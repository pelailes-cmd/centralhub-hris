// Files selected in the development preview are kept in this browser's IndexedDB.
// Production documents always use the authorized Supabase storage routes.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("centralhub-development-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Your browser could not open preview file storage."));
  });
}
export async function saveDemoFile(id: string, file: Blob) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("The file could not be saved in this browser."));
  });
  db.close();
}
export async function getDemoFile(id: string) {
  const db = await database();
  const file = await new Promise<Blob>((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").get(id);
    request.onsuccess = () =>
      request.result
        ? resolve(request.result)
        : reject(new Error("This preview file is no longer available."));
    request.onerror = () => reject(new Error("Could not read the preview file."));
  });
  db.close();
  return file;
}
