const DB_NAME='focus-lab-v1';
let dbPromise;
export function openStore() {
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('sessions',{keyPath:'session_id'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('数据库被其他页面占用，请关闭其他 Focus Lab 页面后重试。'));
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
    tx.onabort=()=>reject(tx.error||new Error('保存被中断'));
  });
}
export const putSession=s=>transaction('readwrite',store=>store.put(s));
export const allSessions=()=>transaction('readonly',store=>store.getAll());
export const deleteSession=id=>transaction('readwrite',store=>store.delete(id));
export const clearSessions=()=>transaction('readwrite',store=>store.clear());
export function participantId() {
  let id=localStorage.getItem('focus-lab-participant');
  if(!id) {id=crypto.randomUUID();localStorage.setItem('focus-lab-participant',id);}
  return id;
}
