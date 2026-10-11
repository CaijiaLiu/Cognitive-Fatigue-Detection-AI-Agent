export const format=(n,digits=0)=>Number.isFinite(n)?n.toFixed(digits):'—';
export const percent=n=>Number.isFinite(n)?`${Math.round(n*100)}%`:'—';
