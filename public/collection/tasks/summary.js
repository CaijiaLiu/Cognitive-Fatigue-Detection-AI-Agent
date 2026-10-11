import { median, mean, sd } from '../shared/statistics.js';
export function summarizeTrials(trials) {
  const valid=trials.filter(t=>!t.invalid_reason);
  const correct=valid.filter(t=>t.correct);
  const go=valid.filter(t=>t.type==='go');
  const noGo=valid.filter(t=>t.type==='no-go');
  const times=go.filter(t=>t.correct).map(t=>t.reaction_ms);
  return {trial_count:trials.length,valid_trial_count:valid.length,invalid_trial_count:trials.length-valid.length,accuracy:valid.length?correct.length/valid.length:null,go_accuracy:go.length?go.filter(t=>t.correct).length/go.length:null,no_go_accuracy:noGo.length?noGo.filter(t=>t.correct).length/noGo.length:null,median_reaction_ms:median(times),mean_reaction_ms:mean(times),reaction_sd_ms:sd(times),omissions:go.filter(t=>!t.responded).length,false_alarms:noGo.filter(t=>t.responded).length,anticipations:valid.filter(t=>t.responded&&t.reaction_ms<100).length};
}
