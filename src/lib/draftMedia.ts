// Keeps the photos and video a customer picked while booking, so they survive
// a page reload or the trip to their email to confirm a new account.
export interface DraftItem { id: string; kind: "photo" | "video"; blob: Blob; name: string }

const DB = "moremahi-draft";
const STORE = "media";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const draftMedia = {
  async all(): Promise<DraftItem[]> {
    try { return (await tx<DraftItem[]>("readonly", (s) => s.getAll() as IDBRequest<DraftItem[]>)) ?? []; } catch { return []; }
  },
  async put(item: DraftItem) { try { await tx("readwrite", (s) => s.put(item)); } catch { /* memory only */ } },
  async remove(id: string) { try { await tx("readwrite", (s) => s.delete(id)); } catch { /* ignore */ } },
  async clear() { try { await tx("readwrite", (s) => s.clear()); } catch { /* ignore */ } },
};
