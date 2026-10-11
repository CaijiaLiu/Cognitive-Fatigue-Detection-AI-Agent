import { database,hash,token,response,sameOrigin,limitedBody } from '../../../lib/research';
import { isId } from '../../../lib/research-data.mjs';
import { env } from 'cloudflare:workers';
export async function POST(r:Request){
 if(!sameOrigin(r))return response({error:'请求来源不允许'},403);
 try{
 const {session_id}=await limitedBody(r,1000);if(!isId(session_id))return response({error:'会话 ID 无效'},400);
 const secret=(env as unknown as Record<string,string>).RATE_HASH_KEY;if(!secret)return response({error:'上传尚未配置'},503);
 const db=database(),now=Date.now(),hour=Math.floor(now/3600000),day=Math.floor(now/86400000);
 const ip=r.headers.get('cf-connecting-ip')||'local';
 const key=await hash(secret+':'+ip+':'+hour);
 await db.batch([
 db.prepare('DELETE FROM upload_limits WHERE expires < ?').bind(now),
 db.prepare('DELETE FROM upload_tickets WHERE expires < ?').bind(now),
 db.prepare('INSERT INTO upload_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,now+7200000),
 db.prepare('INSERT INTO upload_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind('daily:'+day,now+172800000)
 ]);
 const local=await db.prepare('SELECT count FROM upload_limits WHERE key=?').bind(key).first<{count:number}>();
 const global=await db.prepare('SELECT count FROM upload_limits WHERE key=?').bind('daily:'+day).first<{count:number}>();
 if((local?.count||0)>10||(global?.count||0)>500)return response({error:'上传次数限制，请稍后重试'},429);
 const value=token();await db.prepare('INSERT INTO upload_tickets (hash,session_id,expires) VALUES (?,?,?)').bind(await hash(value),session_id,now+1800000).run();
 return response({token:value,expires_at:now+1800000});
 }catch{return response({error:'无法创建上传许可'},400);}
}
