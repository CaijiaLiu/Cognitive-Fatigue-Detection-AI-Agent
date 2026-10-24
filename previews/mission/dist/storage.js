const DB_NAME='focus-lab-mission-preview-v1';
let dbPromise;
export function openStore() {
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('sessions',{keyPath:'session_id'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('The database is blocked by another page. Close other Focus Lab preview tabs and retry.'));
  });
  return dbPromise;
}
async function transaction(mode,action) {
  const db=await openStore();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('sessions',mode);
    const request=action(tx.objectStore('sessions'));
    let result;
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||new Error('Saving was interrupted.'));
  });
}
export const putSession=s=>transaction('readwrite',store=>store.put(s));
export const allSessions=()=>transaction('readonly',store=>store.getAll());
export const deleteSession=id=>transaction('readwrite',store=>store.delete(id));
export const clearSessions=()=>transaction('readwrite',store=>store.clear());
export function participantId() {
  let id=localStorage.getItem('focus-lab-mission-participant');
  if(!id) {id=crypto.randomUUID();localStorage.setItem('focus-lab-mission-participant',id);}
  return id;
}
