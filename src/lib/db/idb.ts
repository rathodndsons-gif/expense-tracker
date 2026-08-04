/**
 * Minimal, promise-based IndexedDB wrapper.
 *
 * IndexedDB is the backbone of the offline-first layer: every write goes to
 * the local database immediately (so the UI is never blocked on the network),
 * and the sync engine replays changes when connectivity returns.
 *
 * We deliberately avoid `idb`-style generators and use plain IDBRequest
 * wrappers so there are zero extra dependencies and the code is easy to audit.
 */

export interface IDBSchema {
  /** Main transaction table. Indexed by `date` for fast dashboard queries. */
  expenses: { keyPath: "id"; index?: { date: "date" } };
  subscriptions: { keyPath: "id" };
  /** Outbox of pending sync operations. */
  syncQueue: { keyPath: "id" };
  /** Key/value metadata (last sync clock, settings, coach history). */
  meta: { keyPath: "key" };
}

export type StoreName = keyof IDBSchema;

const DB_NAME = "expense-tracker";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("expenses")) {
        const store = db.createObjectStore("expenses", { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains("subscriptions")) {
        db.createObjectStore("subscriptions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut<T>(
  store: StoreName,
  value: T,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbBulkPut<T>(
  store: StoreName,
  values: T[],
): Promise<void> {
  if (values.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbGet<T>(
  store: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await getDB();
  const tx = db.transaction(store, "readonly");
  const req = tx.objectStore(store).get(key);
  return requestToPromise(req);
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDB();
  const tx = db.transaction(store, "readonly");
  const req = tx.objectStore(store).getAll();
  return requestToPromise(req);
}

export async function idbDelete(
  store: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Query an index range, optionally filtered to a key. */
export async function idbGetAllByIndex<T>(
  store: StoreName,
  index: string,
  key?: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await getDB();
  const tx = db.transaction(store, "readonly");
  const idx = tx.objectStore(store).index(index);
  const req = key === undefined ? idx.getAll() : idx.getAll(key);
  return requestToPromise(req);
}
