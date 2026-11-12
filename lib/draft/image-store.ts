/**
 * halloCD · 草稿图片仓库（浏览器侧 · IndexedDB）
 * ==================================================================
 * DIY 草稿里的图片本体存在这里。
 *
 * 为什么是 IndexedDB 而不是 localStorage：
 *   · localStorage 存的是**字符串**，图片得先转 base64（膨胀 33%），
 *     而且整个库只有 5MB —— 一张 4MB 的封面就把它塞满了
 *   · IndexedDB 直接存 Blob，没有编码损耗，容量是几百 MB 起
 *
 * 为什么不上传到服务器：
 *   草稿是「还没决定送不送出去」的半成品。为了一个半成品就占用
 *   对象存储和带宽不值当 —— 而且用户多半会再换一张图。
 *
 * ------------------------------------------------------------------
 * 降级策略：
 *   IndexedDB 不可用（隐私模式 / 老浏览器 / 服务端渲染）时，
 *   所有函数都安静地失败 —— 标量草稿照常工作，只是图片不会跨刷新保留。
 *   草稿功能不该把整个工作台拖垮。
 */

const DB_NAME = "hallocd-drafts";
const DB_VERSION = 1;
const STORE_NAME = "diy-images";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!isBrowser()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** 存一张图（同一个槽位会覆盖上一张） */
export async function putDraftImage(slot: string, file: File): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, slot);
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

/** 取回一张图 */
export async function getDraftImage(slot: string): Promise<File | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(slot);
    const value = await new Promise<unknown>((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (value instanceof File) return value;
    /* 某些浏览器读出来是 Blob 而不是 File —— 包一层，接口保持一致 */
    if (value instanceof Blob) {
      return new File([value], (value as File).name || `${slot}.png`, {
        type: value.type || "application/octet-stream",
      });
    }
    return null;
  } catch {
    return null;
  }
}

/** 删掉某个槽位的图 */
export async function deleteDraftImage(slot: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(slot);
    await txDone(tx);
  } catch {
    /* ignore */
  }
}

/** 清空所有草稿图片 */
export async function clearDraftImages(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await txDone(tx);
  } catch {
    /* ignore */
  }
}

/** 仓库里现在有哪些槽位（用于和 localStorage 里的元信息对账） */
export async function listDraftImageSlots(): Promise<string[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAllKeys();
    return await new Promise<string[]>((resolve) => {
      request.onsuccess = () => {
        resolve(
          (request.result ?? []).filter(
            (k): k is string => typeof k === "string",
          ),
        );
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
