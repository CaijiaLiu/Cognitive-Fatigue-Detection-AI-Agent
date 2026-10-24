const DB_NAME = 'focus-lab-mission-preview-v1';

// Read only after an explicit user action. Never creates, upgrades, writes or migrates a DB.
export function loadLocalMissionRecords(factory = globalThis.indexedDB) {
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable. You can open an exported JSON instead.'));
  return new Promise((resolve,reject) => {
    const request = factory.open(DB_NAME);
    let settled = false;
    const finish = (error,records) => { if (settled) return; settled=true;clearTimeout(deadline);error?reject(error):resolve(records); };
    const deadline = setTimeout(() => finish(new Error('Local storage did not respond. Close other tabs or open an exported JSON.')),5000);
    request.onupgradeneeded = () => { request.transaction.abort(); finish(new Error('No local game sessions at this address yet. Play here or open an exported JSON.')); };
    request.onblocked = () => finish(new Error('Local storage is blocked by another tab.'));
    request.onerror = () => finish(new Error('Cannot read local game storage. No records were changed.'));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {db.close();return;}
      if (!db.objectStoreNames.contains('sessions')) { db.close();finish(new Error('Unsupported local database.'));return; }
      const tx = db.transaction('sessions','readonly');
      const read = tx.objectStore('sessions').getAll();
      tx.oncomplete = () => {db.close();finish(null,read.result);};
      tx.onerror = tx.onabort = () => {db.close();finish(new Error('Reading local records was interrupted.'));};
    };
  });
}
