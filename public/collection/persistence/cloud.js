const $=id=>document.getElementById(id),prefix='focus-lab-cloud-receipt:';
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function request(path,body,options={}){
 const r=await fetch(path,{method:options.method||'POST',headers:{'Content-Type':'application/json',...(options.token?{'Authorization':'Bearer '+options.token}:{})},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const b=await r.json();if(!r.ok)throw Error(b.error||'网络请求失败');return b;
}
function download(receipt){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}));a.href=url;a.download='focus-lab-withdrawal-'+receipt.session_id.slice(0,8)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderReceipts(){
 const el=$('cloud-receipts');el.replaceChildren();
 try{for(let i=0;i<localStorage.length;i++){
 const k=localStorage.key(i);if(!k.startsWith(prefix))continue;const receipt=JSON.parse(localStorage.getItem(k));if(!receipt.saved)continue;
 const row=document.createElement('p');row.append(document.createTextNode('已上传 '+receipt.session_id.slice(0,12)+' · '));
 const backup=document.createElement('button');backup.className='text-button';backup.textContent='下载撤回凭证';backup.onclick=()=>download(receipt);
 const del=document.createElement('button');del.className='text-button danger';del.textContent='撤回云端结果';del.onclick=async()=>{
 if(!confirm('删除云端的这份数值记录？不会删除本地记录，已导出的文件不受影响。'))return;
 del.disabled=true;try{await request('/api/submissions',receipt,{method:'DELETE'});localStorage.removeItem(k);$('cloud-status').textContent='这份云端结果已撤回。';renderReceipts();}catch(e){$('cloud-status').textContent=e.message;del.disabled=false;}
 };row.append(backup,del);el.append(row);
 }}catch{$('cloud-status').textContent='无法读取撤回凭证，请保留你下载的备份。';}
}
export async function uploadSession(session){
 if(!session.upload_consent?.accepted)return;
 const status=$('cloud-status'),actions=$('cloud-actions');actions.replaceChildren();status.textContent='正在上传本次已同意的数值结果…';
 try{
 const key=prefix+session.session_id,old=JSON.parse(localStorage.getItem(key)||'null');
 const receipt=old||{session_id:session.session_id,withdrawal_token:secret(),saved:false};
 localStorage.setItem(key,JSON.stringify(receipt)); // Retain withdrawal capability before transmitting.
 const ticket=await request('/api/upload-ticket',{session_id:session.session_id});
 const {environment,events,notes,...minimal}=session;
 const saved=await request('/api/submissions',{session:minimal,withdrawal_token:receipt.withdrawal_token},{token:ticket.token});
 if(saved.saved!==true)throw Error('服务器尚未确认保存');
 receipt.saved=true;receipt.received_at=saved.received_at;localStorage.setItem(key,JSON.stringify(receipt));
 status.textContent='服务器已确认保存。研究者可在私密后台查看；没有上传视频或照片。';renderReceipts();
 }catch(e){status.textContent='上传未获确认：'+e.message+'。本地结果仍可导出；不会自动重传。';const retry=document.createElement('button');retry.className='button secondary';retry.textContent='重试本次已同意上传';retry.onclick=()=>uploadSession(session);actions.append(retry);}
}
renderReceipts();
