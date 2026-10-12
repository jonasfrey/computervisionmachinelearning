import { validatePainting } from "./painting.js";

async function database() {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open("vision-lab-paintings", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("paintings", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Painting storage is busy in another tab."));
  });
}

async function transact(mode, operation) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("paintings", mode);
      const request = operation(tx.objectStore("paintings"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () =>
        reject(tx.error || new Error("Painting storage failed."));
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listPaintings() {
  const records = await transact("readonly", (store) => store.getAll());
  // Keep the gallery lightweight; load full pixel data only when selected.
  return records.map(({ id, name, size, preview, createdAt }) => ({
    id,
    name,
    size,
    preview,
    createdAt,
  }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function savePainting(record) {
  validatePainting(record);
  await transact("readwrite", (store) => store.add(record));
}

export async function loadPainting(id) {
  const record = await transact("readonly", (store) => store.get(id));
  if (!record) {
    throw new Error("This painting is no longer saved in this browser.");
  }
  return validatePainting(record);
}

export async function deletePainting(id) {
  await transact("readwrite", (store) => store.delete(id));
}
