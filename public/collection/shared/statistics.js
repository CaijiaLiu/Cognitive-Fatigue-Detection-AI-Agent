export const median = values => { const a = values.filter(Number.isFinite).sort((x,y)=>x-y); if (!a.length) return null; const m = Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2; };
export const mean = values => { const a = values.filter(Number.isFinite); return a.length ? a.reduce((s,x)=>s+x,0)/a.length : null; };
export const sd = values => { const a = values.filter(Number.isFinite); const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)) : null; };
