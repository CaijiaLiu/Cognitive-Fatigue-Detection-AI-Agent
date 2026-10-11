import { requireChatGPTUser,chatGPTSignOutPath } from '../chatgpt-auth';
import { researcher,database } from '../../lib/research';
import DeleteButton from './delete-button';
export const dynamic='force-dynamic';
export default async function Research({searchParams}:{searchParams:Promise<{cursor?:string}>}){
 await requireChatGPTUser('/research');const u=await researcher();
 if(!u)return <main style={{padding:40}}><h1>此账号没有研究者权限</h1><p>请使用网站所有者的 ChatGPT 账号登录。参与者结果不会公开。</p><a href={chatGPTSignOutPath('/research')} target="_top">退出并切换账号</a></main>;
 const cursor=(await searchParams).cursor||'',db=database();
 const counts=await db.prepare('SELECT mode,COUNT(*) AS count FROM research_sessions GROUP BY mode').all<{mode:string;count:number}>();
 const rows=await db.prepare('SELECT id,received_at,payload FROM research_sessions WHERE id>? ORDER BY id LIMIT 10').bind(cursor).all<{id:string;received_at:string;payload:string}>();
 const exportURL=(format:string,kind='sessions')=>`/api/research/export?format=${format}&kind=${kind}&cursor=${encodeURIComponent(cursor)}`;
 return <main style={{maxWidth:1200,margin:'40px auto',padding:24,fontFamily:'system-ui',color:'#23443b'}}>
 <h1>Focus Lab · 私密研究者后台</h1>
 <p>仅授权研究者可见 · 数值数据，不含视频、照片或用户代理信息 · 非医学诊断</p>
 <p>{counts.results.map(r=>`${r.mode}: ${r.count} 条`).join(' / ')||'尚无上传结果'}</p>
 <p>每页最多 10 条。以下按钮导出当前页，点击“下一页”可查看与导出更多结果。</p>
 <p><a href={exportURL('json')}>本页 JSON</a> · <a href={exportURL('csv')}>会话 CSV</a> · <a href={exportURL('csv','samples')}>视觉样本 CSV</a> · <a href={exportURL('csv','trials')}>任务 CSV</a></p>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left',borderSpacing:'12px'}}>
 <thead><tr><th>接收时间</th><th>数据来源</th><th>会话 ID</th><th>疲劳前 → 后</th><th>正确率</th><th>反应中位数</th><th>操作</th></tr></thead>
 <tbody>{rows.results.map(r=>{const s=JSON.parse(r.payload);return <tr key={r.id}><td>{r.received_at}</td><td>{s.mode==='simulated'?'模拟视觉 / 真实任务':s.mode==='camera'?'真实摄像头 / 真实任务':'仅真实任务'}</td><td>{r.id.slice(0,12)}</td><td>{s.fatigue_pre} → {s.fatigue_post}</td><td>{s.behavior_summary.accuracy===null?'—':`${Math.round(s.behavior_summary.accuracy*100)}%`}</td><td>{s.behavior_summary.median_reaction_ms?.toFixed(0)||'—'} ms</td><td><DeleteButton id={r.id}/></td></tr>;})}</tbody>
 </table></div>
 <p><a href="/research">第一页</a> {rows.results.length===10&&<a href={'/research?cursor='+encodeURIComponent(rows.results.at(-1)!.id)}>下一页 →</a>}</p>
 <p>匿名 ID 仍可关联同一浏览器。自评不是医学标签；训练时须排除模拟视觉并按参与者划分数据。后台删除不影响已经导出的文件。</p>
 <a href="/collection/index.html">返回测试网页</a> · <a href={chatGPTSignOutPath('/research')} target="_top">退出登录</a>
 </main>;
}
