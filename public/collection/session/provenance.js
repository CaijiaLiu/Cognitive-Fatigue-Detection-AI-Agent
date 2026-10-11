export function sources(mode){return {vision:mode==='camera'?'camera':mode==='simulated'?'simulated':'unavailable',behavior:'human',ratings:'self_report'};}
export const sourceLabel=s=>s.mode==='demo'?'全部模拟数据':s.sources.vision==='simulated'?'模拟视觉 + 真实任务 / 自评':['none','unavailable'].includes(s.sources.vision)?'真实任务 / 无视觉':'真实摄像头 + 真实任务 / 自评';
