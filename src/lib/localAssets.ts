const DB_NAME = "menuvista_local_assets";
const STORE_NAME = "assets";
const DB_VERSION = 1;
const LOCAL_ASSET_PREFIX = "localasset:";

const objectUrlCache = new Map<string, string>();

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

function makeAssetKey(prefix: "thumb" | "model") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}

export async function saveLocalAsset(
  file: File,
  prefix: "thumb" | "model"
): Promise<string> {
  const db = await openDb();
  const key = makeAssetKey(prefix);

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
