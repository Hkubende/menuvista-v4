const DB_NAME = "menuvista_local_assets";
const STORE_NAME = "assets";
const DB_VERSION = 1;
const LOCAL_ASSET_PREFIX = "localasset:";

const objectUrlCache = new Map<string, string>();

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function makeAssetKey(prefix: "thumb" | "model", file: File, preferredName?: string) {
  const base = slugify(preferredName || file.name.replace(/\.[^.]+$/, "")) || prefix;
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || (prefix === "model" ? "glb" : "bin")).toLowerCase();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${base}-${Date.now()}-${random}.${ext}`;
}

export async function saveLocalAsset(
  file: File,
  prefix: "thumb" | "model",
  preferredName?: string
): Promise<string> {
  const db = await openDb();
  const key = makeAssetKey(prefix, file, preferredName);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(file, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  return `${LOCAL_ASSET_PREFIX}${key}`;
}

async function getLocalAssetBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as Blob | undefined) || null);
    request.onerror = () => reject(request.error);
  });
}

export async function resolveLocalAssetPath(path: string): Promise<string> {
  if (!path.startsWith(LOCAL_ASSET_PREFIX)) return path;
  const key = path.slice(LOCAL_ASSET_PREFIX.length);
  const cached = objectUrlCache.get(key);
  if (cached) return cached;

  const blob = await getLocalAssetBlob(key);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(key, url);
  return url;
}

export async function deleteLocalAsset(path: string): Promise<void> {
  if (!path.startsWith(LOCAL_ASSET_PREFIX)) return;
  const key = path.slice(LOCAL_ASSET_PREFIX.length);

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  const cached = objectUrlCache.get(key);
  if (cached) {
    URL.revokeObjectURL(cached);
    objectUrlCache.delete(key);
  }
}

export function isLocalAssetPath(path: string) {
  return path.startsWith(LOCAL_ASSET_PREFIX);
}
