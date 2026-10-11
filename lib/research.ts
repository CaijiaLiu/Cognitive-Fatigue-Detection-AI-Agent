import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
export function database(){if(!env.DB)throw Error('Research database unavailable');return env.DB;}
export const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function sameOrigin(r:Request){return r.headers.get('origin')===new URL(r.url).origin;}
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function token(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function researcher(){const u=await getChatGPTUser();const owner=(env as unknown as Record<string,string>).RESEARCHER_EMAIL;return u&&owner&&u.email.toLowerCase()===owner.toLowerCase()?u:null;}
export async function limitedBody(r:Request,max=2000000){
 if(!r.headers.get('content-type')?.startsWith('application/json'))throw Error('需要 JSON');
 if(Number(r.headers.get('content-length'))>max)throw Error('数据超过大小限制');
 const reader=r.body?.getReader();if(!reader)throw Error('缺少数据');let length=0;const chunks:Uint8Array[]=[];
 while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw Error('数据超过大小限制');}chunks.push(value);}
 const data=new Uint8Array(length);let i=0;for(const c of chunks){data.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(data));
}
