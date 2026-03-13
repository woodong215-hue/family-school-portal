const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes){
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sha256Hex(text){
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  const bytes = new Uint8Array(buf);
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function deriveKey(password, saltBytes, iterations){
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name:"PBKDF2", salt: saltBytes, iterations, hash:"SHA-256" },
    keyMaterial,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt","decrypt"]
  );
}

export async function encryptJsonToEncObject(jsonObj, password){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const iter = 200000;

  const key = await deriveKey(password, salt, iter);
  const plaintext = enc.encode(JSON.stringify(jsonObj));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, plaintext));

  return {
    v: 1,
    kdf: { name:"PBKDF2", hash:"SHA-256", iter, salt: bytesToB64(salt) },
    alg: "AES-GCM",
    iv: bytesToB64(iv),
    ct: bytesToB64(ciphertext)
  };
}

export async function decryptEncObjectToJson(encObj, password){
  const salt = b64ToBytes(encObj.kdf.salt);
  const iv   = b64ToBytes(encObj.iv);
  const ct   = b64ToBytes(encObj.ct);

  const key = await deriveKey(password, salt, encObj.kdf.iter);
  const ptBuf = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, ct);
  const text = dec.decode(ptBuf);
  return JSON.parse(text);
}
