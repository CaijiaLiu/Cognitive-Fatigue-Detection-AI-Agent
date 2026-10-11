import { database,researcher,response,sameOrigin,limitedBody } from '../../../../lib/research';
import { isId } from '../../../../lib/research-data.mjs';
export async function POST(r:Request){
 if(!sameOrigin(r)||!await researcher())return response({error:'无权删除'},403);
 try{const {session_id}=await limitedBody(r,1000);if(!isId(session_id))throw Error('ID 无效');await database().batch([database().prepare('DELETE FROM research_sessions WHERE id=?').bind(session_id),database().prepare('DELETE FROM upload_tickets WHERE session_id=?').bind(session_id)]);return response({deleted:true});}catch{return response({error:'删除失败'},400);}
}
