import { database,hash,response,sameOrigin,limitedBody } from '../../../lib/research';
import { sanitizeSession,isId } from '../../../lib/research-data.mjs';
export async function POST(r:Request){
 if(!sameOrigin(r))return response({error:'请求来源不允许'},403);
 try{
 const raw=await limitedBody(r),s=sanitizeSession(raw.session),withdrawal=raw.withdrawal_token;
 if(typeof withdrawal!=='string'||!/^[a-f0-9]{64}$/.test(withdrawal))throw Error('撤回凭证无效');
 const bearer=r.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!bearer)return response({error:'缺少上传许可'},401);
 const ticketHash=await hash(bearer),db=database();
 const ticket=await db.prepare('SELECT session_id,expires FROM upload_tickets WHERE hash=?').bind(ticketHash).first<{session_id:string;expires:number}>();
 if(!ticket||ticket.session_id!==s.session_id||ticket.expires<Date.now())return response({error:'上传许可已失效，请重试'},401);
 const withdrawalHash=await hash(withdrawal),received=new Date().toISOString();
 await db.prepare('INSERT OR IGNORE INTO research_sessions (id,received_at,mode,payload,ticket_hash,withdrawal_hash) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM upload_tickets WHERE hash=? AND session_id=? AND expires>=?)').bind(s.session_id,received,s.mode,JSON.stringify(s),ticketHash,withdrawalHash,ticketHash,s.session_id,Date.now()).run();
 const saved=await db.prepare('SELECT received_at,withdrawal_hash FROM research_sessions WHERE id=?').bind(s.session_id).first<{received_at:string;withdrawal_hash:string}>();
 if(!saved)return response({error:'上传许可已撤回'},401);
 if(saved.withdrawal_hash!==withdrawalHash)return response({error:'会话 ID 冲突'},409);
 return response({session_id:s.session_id,received_at:saved.received_at,saved:true});
 }catch(e){return response({error:e instanceof Error?e.message:'上传失败'},400);}
}
export async function DELETE(r:Request){
 if(!sameOrigin(r))return response({error:'请求来源不允许'},403);
 try{const b=await limitedBody(r,1000);if(!isId(b.session_id)||typeof b.withdrawal_token!=='string'||!/^[a-f0-9]{64}$/.test(b.withdrawal_token))throw Error('撤回凭证无效');
 const db=database(),hashed=await hash(b.withdrawal_token);const results=await db.batch([
 db.prepare('DELETE FROM upload_tickets WHERE session_id=? AND EXISTS (SELECT 1 FROM research_sessions WHERE id=? AND withdrawal_hash=?)').bind(b.session_id,b.session_id,hashed),
 db.prepare('DELETE FROM research_sessions WHERE id=? AND withdrawal_hash=?').bind(b.session_id,hashed)]);
 if(!results[1].meta.changes)return response({error:'未找到记录，或撤回凭证不正确'},404);
 return response({deleted:true});
 }catch{return response({error:'撤回失败'},400);}
}
