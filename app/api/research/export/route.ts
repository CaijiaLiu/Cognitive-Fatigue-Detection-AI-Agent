import { database,researcher,response } from '../../../../lib/research';
import { exportRows,toCSV } from '../../../../public/collection/core.js';
export async function GET(r:Request){
 if(!await researcher())return response({error:'仅研究者可以读取结果'},403);
 const url=new URL(r.url),format=url.searchParams.get('format')||'json',kind=url.searchParams.get('kind')||'sessions';
 if(!['json','csv'].includes(format)||!['sessions','samples','trials'].includes(kind))return response({error:'导出格式无效'},400);
 const cursor=url.searchParams.get('cursor')||'';
 const rows=await database().prepare('SELECT id,received_at,payload FROM research_sessions WHERE id>? ORDER BY id LIMIT 10').bind(cursor).all<{id:string;received_at:string;payload:string}>();
 const sessions=rows.results.map(r=>({...JSON.parse(r.payload),received_at:r.received_at}));
 const content=format==='csv'?toCSV(exportRows(sessions,kind)):JSON.stringify({schema_version:'1.0.0',exported_at:new Date().toISOString(),next_cursor:rows.results.length===10?rows.results.at(-1)?.id:null,sessions},null,2);
 return new Response(content,{headers:{'Content-Type':format==='csv'?'text/csv;charset=utf-8':'application/json','Cache-Control':'no-store','X-Next-Cursor':rows.results.length===10?rows.results.at(-1)!.id:'','Content-Disposition':`attachment; filename="focus-lab-${kind}.${format}"`}});
}
