import { decryptEncObjectToJson, sha256Hex } from "./crypto.js";

const $ = (sel) => document.querySelector(sel);

const view = $("#view");
const lockModal = $("#lockModal");

let content = null;

const DAYS = ["월","화","수","목","금"];

function setNavActive(){
  const h = location.hash || "#/notice";
  for (const id of ["Notice","Timetable","Changes","Admin"]) {
    const el = $("#nav"+id);
    if (!el) continue;
    el.classList.toggle("active", h.startsWith("#/"+id.toLowerCase()));
  }
}

function showLock(msg){
  if (msg) $("#lockHint").textContent = msg;
  lockModal.classList.add("show");
}
function hideLock(){ lockModal.classList.remove("show"); }

function escapeHtml(s){
  return (s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function fmtTimeRange(start, end){
  if (!start && !end) return "";
  if (start && end) return `${start}~${end}`;
  if (!start && end) return `~${end}`;
  return `${start}~`;
}
function highlight(text, q){
  if (!q) return escapeHtml(text);
  const safe = escapeHtml(text);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  return safe.replace(re, (m)=>`<span class="highlight">${m}</span>`);
}
function tokens(q){ return (q||"").trim().toLowerCase().split(/\s+/).filter(Boolean); }
function matchAny(haystack, q){
  const t = tokens(q);
  if (!t.length) return true;
  const h = (haystack || "").toLowerCase();
  return t.every(tok => h.includes(tok));
}

async function loadEncrypted(){
  const res = await fetch("./data/content.enc", { cache:"no-store" });
  if (!res.ok) throw new Error("content.enc 없음(초기설정 필요)");
  return await res.json();
}

async function unlockWithPassword(pass){
  const encObj = await loadEncrypted();
  content = await decryptEncObjectToJson(encObj, pass);

  const sub = content?.meta?.schoolName ? `${content.meta.schoolName} · 가족 전용` : "가족 전용";
  $("#brandSub").textContent = sub;
}

function getQ(){ return ($("#q")?.value || "").trim(); }

function renderNotice(){
  const q = getQ();
  $("#searchbar").style.display = "";

  const notices = (content.notices || []).slice().sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  const pinned = notices.filter(n=>n.pinned);
  const normal = notices.filter(n=>!n.pinned);

  const card = (n) => {
    const hay = `${n.title||""}\n${n.date||""}\n${(n.tags||[]).join(" ")}\n${n.body||""}`;
    if (!matchAny(hay, q)) return "";
    const tagHtml = (n.tags||[]).map(t=>`<span class="badge badge--tag">${escapeHtml(t)}</span>`).join(" ");
    const body = n.body || "";
    const bodyPreview = body.split("\n").slice(0, 10).join("\n");
    return `
      <article class="card">
        <div class="hstack">
          <div style="font-weight:800">${highlight(n.title||"(제목 없음)", q)}</div>
          <span class="muted">${escapeHtml(n.date||"")}</span>
          ${n.pinned ? `<span class="badge">PIN</span>` : ""}
        </div>
        <div class="hstack mt8">${tagHtml}</div>
        <hr/>
        <div style="white-space:pre-wrap; line-height:1.6">${highlight(bodyPreview, q)}${body.split("\n").length>10 ? `\n\n<span class="muted small">(본문 일부만 표시)</span>` : ""}</div>
      </article>
    `;
  };

  view.innerHTML = `
    <section class="card">
      <div class="hstack">
        <div style="font-weight:900; font-size:18px">공지</div>
        <span class="muted">검색: 제목/본문/태그</span>
      </div>
    </section>
    ${pinned.length ? `<section class="card"><div class="hstack"><span class="badge">이번 주 고정</span></div>${pinned.map(card).join("")}</section>` : ""}
    <section>${normal.map(card).join("") || `<div class="muted">표시할 공지가 없습니다.</div>`}</section>
  `;
}

function renderTimetable(){
  $("#searchbar").style.display = "none";
  const weeks = (content.timetableWeeks || []).slice().sort((a,b)=> (b.weekStart||"").localeCompare(a.weekStart||""));
  const week = weeks[0] || { weekStart: "", days: {} };

  const periods = content.settings?.periods || [];
  const fixed = content.settings?.fixedBlocks || [];

  const th = DAYS.map(d=>`<th>${d}</th>`).join("");
  const rows = periods.map((p, idx)=>{
    const time = fmtTimeRange(p.start, p.end);
    const pLabel = time ? `${p.name} <div class="small">${time}</div>` : `${p.name}`;
    const tds = DAYS.map(day=>{
      const cell = week.days?.[day]?.[idx] || {};
      return `<td><div style="font-weight:800">${escapeHtml(cell.subject||"")}</div>${
        cell.materials ? `<div class="small">준비물: ${escapeHtml(cell.materials)}</div>` : ""
      }${cell.memo ? `<div class="small">${escapeHtml(cell.memo)}</div>` : ""}</td>`;
    }).join("");
    return `<tr><th>${pLabel}</th>${tds}</tr>`;
  }).join("");

  const fixedHtml = fixed.map(b=>{
    const time = fmtTimeRange(b.start, b.end) || "시간 미설정";
    const days = (b.days||[]).join("·");
    return `<div class="card"><div class="hstack"><div style="font-weight:900">${escapeHtml(b.title)}</div><span class="muted">${escapeHtml(days)}</span><span class="badge">${escapeHtml(time)}</span></div></div>`;
  }).join("");

  view.innerHTML = `
    <section class="card">
      <div class="hstack"><div style="font-weight:900; font-size:18px">시간표</div><span class="muted small">교시 시간/돌봄/태권도 시간은 나중에 설정 가능</span></div>
      <div class="muted small mt8">이번 주 시작일: ${escapeHtml(week.weekStart||"(미설정)")}</div>
      <table class="table"><thead><tr><th>교시</th>${th}</tr></thead><tbody>${rows}</tbody></table>
    </section>
    <section>${fixedHtml}</section>
  `;
}

function renderChanges(){
  const q = getQ();
  $("#searchbar").style.display = "";
  const logs = (content.changeLogs || []).slice().sort((a,b)=> (b.date||"").localeCompare(a.date||""));

  const slotLabel = (log)=>{
    if (log.slotType === "PERIOD") {
      const p = (content.settings?.periods || [])[ (log.periodNumber||1) - 1 ];
      const time = p ? fmtTimeRange(p.start, p.end) : "";
      return time ? `${log.periodNumber}교시(${time})` : `${log.periodNumber}교시`;
    }
    if (log.slotType === "CARE") return "돌봄";
    if (log.slotType === "TAEKWONDO") return "태권도";
    if (log.slotType === "AFTERSCHOOL") return "방과후";
    return "기타";
  };

  const cards = logs.map(l=>{
    const line = `${l.date||""} ${slotLabel(l)} ${l.from||""} ${l.to||""} ${l.materials||""} ${l.source||""} ${l.note||""}`;
    if (!matchAny(line, q)) return "";
    return `
      <article class="card">
        <div class="hstack">
          <div style="font-weight:900">${escapeHtml(l.date||"")}</div>
          <span class="badge">${escapeHtml(slotLabel(l))}</span>
          <span class="muted small">${escapeHtml(l.source||"")}</span>
        </div>
        <div class="mt8" style="line-height:1.7">
          <div><span class="muted">변경:</span> <b>${highlight(l.from||"(미정)", q)}</b> → <b>${highlight(l.to||"(미정)", q)}</b></div>
          ${l.materials ? `<div><span class="muted">준비물:</span> ${highlight(l.materials, q)}</div>` : ""}
          ${l.note ? `<div class="muted">${highlight(l.note, q)}</div>` : ""}
        </div>
      </article>
    `;
  }).join("");

  view.innerHTML = `
    <section class="card"><div class="hstack"><div style="font-weight:900; font-size:18px">변동로그</div><span class="muted">검색 가능</span></div></section>
    <section>${cards || `<div class="muted">표시할 로그가 없습니다.</div>`}</section>
  `;
}

async function renderAdmin(){
  $("#searchbar").style.display = "none";
  const storedHash = content?.settings?.adminPasswordSha256 || "";
  const input = prompt("관리자 비밀번호를 입력하세요");
  if (!input) { location.hash = "#/notice"; return; }
  const hex = await sha256Hex(input);
  if (hex !== storedHash) { alert("관리자 비밀번호가 올바르지 않습니다."); location.hash="#/notice"; return; }

  view.innerHTML = `
    <section class="card">
      <div style="font-weight:900; font-size:18px">관리자</div>
      <div class="muted small mt8">정적 사이트라 “저장”이 아니라, setup.html에서 content.enc를 다시 만들어 GitHub에 업로드하는 방식입니다.</div>
      <div class="row mt12">
        <a class="btn" href="./setup.html">setup.html로 가기(새 content.enc 만들기)</a>
      </div>
    </section>
  `;
}

function route(){
  setNavActive();
  const h = location.hash || "#/notice";
  if (h.startsWith("#/timetable")) return renderTimetable();
  if (h.startsWith("#/changes")) return renderChanges();
  if (h.startsWith("#/admin")) return renderAdmin();
  return renderNotice();
}

async function boot(){
  $("#btnGoSetup").addEventListener("click", ()=> location.href="./setup.html");
  $("#btnReset").addEventListener("click", ()=>{
    localStorage.removeItem("sharedPass");
    $("#sharedPass").value = "";
    alert("저장된 비밀번호를 초기화했습니다.");
  });
  $("#btnClear").addEventListener("click", ()=>{ $("#q").value=""; route(); });
  $("#q").addEventListener("input", ()=>{
    const h = location.hash || "#/notice";
    if (h.startsWith("#/notice") || h.startsWith("#/changes")) route();
  });
  window.addEventListener("hashchange", route);

  const saved = localStorage.getItem("sharedPass") || "";
  if (saved) $("#sharedPass").value = saved;

  $("#btnUnlock").addEventListener("click", async ()=>{
    const pass = $("#sharedPass").value;
    try{
      await unlockWithPassword(pass);
      if ($("#remember").checked) localStorage.setItem("sharedPass", pass);
      else localStorage.removeItem("sharedPass");
      hideLock();
      route();
    }catch(e){
      alert("아직 content.enc가 없거나 비밀번호가 틀렸어요.\n→ 초기설정 버튼을 눌러 content.enc를 먼저 만들고 업로드하세요.");
    }
  });

  showLock("처음이라면 ‘초기설정’에서 content.enc를 만든 뒤, GitHub에 업로드해 주세요.");
}
boot();
