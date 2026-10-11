import { format, percent } from './format.js';
import { sourceLabel } from '../session/provenance.js';
import { nullVision } from '../features/unavailable.js';
const $=id=>document.getElementById(id);
export function chart(id,points,color,maxY,label){
  const svg=$(id),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
  const el=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));if(text)node.textContent=text;svg.append(node);return node;};
  const finite=points.filter(p=>Number.isFinite(p.y));
  if(!finite.length){el('text',{x:300,y:85,'text-anchor':'middle',fill:'#95a38b','font-size':13},'无有效数据');return;}
  const width=535,height=125,x0=47,y0=14;
  const maxX=Math.max(1,...points.map(p=>p.x));
  maxY=maxY||Math.max(1,...finite.map(p=>p.y))*1.15;
  for(let i=0;i<=3;i++){const y=y0+height*i/3;el('line',{x1:x0,y1:y,x2:x0+width,y2:y,stroke:'#ebefe5','stroke-width':1});el('text',{x:x0-8,y:y+3,'text-anchor':'end',fill:'#96a38d','font-size':9},format(maxY*(1-i/3),maxY<1?2:0));}
  let path='',pen=false;
  for(const p of points){if(!Number.isFinite(p.y)){pen=false;continue;}const x=x0+p.x/maxX*width,y=y0+height-Math.min(1,p.y/maxY)*height;path+=`${pen?'L':'M'}${x.toFixed(1)},${y.toFixed(1)} `;pen=true;}
  el('path',{d:path,fill:'none',stroke:color,'stroke-width':2,'stroke-linejoin':'round'});
  if(finite.length<60)for(const p of finite)el('circle',{cx:x0+p.x/maxX*width,cy:y0+height-Math.min(1,p.y/maxY)*height,r:2.7,fill:color});
  el('text',{x:x0,y:165,fill:'#96a38d','font-size':9},'0');el('text',{x:x0+width,y:165,'text-anchor':'end',fill:'#96a38d','font-size':9},`${format(maxX/1000,0)} s`);el('text',{x:x0+width/2,y:178,'text-anchor':'middle',fill:'#96a38d','font-size':9},label);
}
export function renderResult(s){
  $('empty-result').hidden=true;$('result').hidden=false;$('result-badge').textContent=sourceLabel(s);$('result-badge').classList.toggle('simulated',['demo','simulated'].includes(s.mode));
  $('result-meta').textContent=`${new Date(s.started_at).toLocaleString()} · ${format(s.duration_ms/1000)} 秒 · ${s.status==='completed'?'已完成':s.status==='in_progress'?'未完成草稿':'已中断'} · ID ${s.session_id.slice(0,12)}${s.fatigue_post===null?' · 缺少测试后自评':''}${s.mode==='demo'?' · 示例未保存到历史':''}`;
  const v=s.vision_summary||nullVision(),b=s.behavior_summary;
  $('metric-rt').textContent=format(b.median_reaction_ms);$('metric-accuracy').textContent=percent(b.accuracy);$('metric-trials').textContent=`${b.valid_trial_count} 个有效试次 / ${b.invalid_trial_count} 个中断试次`;
  $('metric-blink').textContent=format(v.blink_rate_per_min,1);
  $('metric-rating').textContent=s.fatigue_post===null?'—':`${s.fatigue_post-s.fatigue_pre>0?'+':''}${s.fatigue_post-s.fatigue_pre}`;
  $('rating-detail').textContent=`${s.fatigue_pre} → ${s.fatigue_post??'未填写'} / 10`;
  chart('reaction-chart',s.trials.filter(t=>t.type==='go').map(t=>({x:t.onset_ms,y:!t.invalid_reason&&t.correct?t.reaction_ms:null})),'#729989',null,'会话时间 / 秒');
  chart('eye-chart',s.samples.map(t=>({x:t.elapsed_ms,y:t.eye_aspect_ratio})),'#a4ac77',.5,'会话时间 / 秒');
  const metrics=[['有效追踪覆盖率',percent(v.tracking_coverage)],['总闭眼时长',v.closed_time_ms===null?'—':`${format(v.closed_time_ms/1000,2)} s`],['闭眼时间占比',percent(v.closed_fraction)],['平均眨眼时长',`${format(v.mean_blink_duration_ms)} ms`],['头部角速度',`${format(v.head_motion_deg_per_sec,2)} °/s`],['虹膜位置标准差',format(v.gaze_position_sd_eye_width,4)],['遗漏 / 误按',`${b.omissions} / ${b.false_alarms}`],['抢按 <100 ms / 空窗响应',`${b.anticipations} / ${s.events.filter(e=>e.type==='inter_trial_response').length}`]];
  $('quality-grid').replaceChildren(...metrics.map(([label,value])=>{const div=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value;div.append(small,strong);return div;}));
}
