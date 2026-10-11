import { SCHEMA_VERSION } from './versions.js';
import { FeatureAccumulator } from '../features/accumulator.js';
import { simulatedFeatures } from '../tracking/simulated.js';
import { summarizeTrials } from '../tasks/summary.js';
export function makeDemo() {
  const acc=new FeatureAccumulator(.3);
  for(let t=0;t<=60000;t+=100) acc.add(t,simulatedFeatures(t),'simulated');
  const trials=Array.from({length:25},(_,i)=>({index:i,type:i%5===4?'no-go':'go',onset_ms:i*2400,deadline_ms:i*2400+1000,response_ms:i%5===4?null:i*2400+300+i*4,reaction_ms:i%5===4?null:300+i*4,responded:i%5!==4,correct:true,invalid_reason:null,source:'simulated'}));
  const ended=Date.now();
  return {schema_version:SCHEMA_VERSION,session_id:'demo-'+crypto.randomUUID(),participant_id:'demo-anonymous',started_at:new Date(ended-60000).toISOString(),ended_at:new Date(ended).toISOString(),duration_ms:60000,status:'completed',mode:'demo',sources:{vision:'simulated',behavior:'simulated',ratings:'simulated'},consent:null,fatigue_pre:3,fatigue_post:6,config:{protocol:'go-no-go-v1',planned_duration_ms:60000,vision_sample_hz:10,ear_baseline:.3,close_ratio:.65,open_ratio:.8,blink_range_ms:[80,800],max_gap_ms:250},vision_summary:acc.summary(60000),behavior_summary:summarizeTrials(trials),samples:acc.samples,blink_events:acc.blinks,trials,events:[],calibration:{source:'simulated',ear_baseline:.3},notes:['All data in this example is synthetic.']};
}
