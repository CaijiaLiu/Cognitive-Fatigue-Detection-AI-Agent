const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function ear(p, ids) {
  const q = ids.map(i=>p[i]); if (q.some(x=>!x)) return null;
  const width = distance(q[0],q[3]);
  return width > .001 ? (distance(q[1],q[5])+distance(q[2],q[4]))/(2*width) : null;
}
function iris(p, corners, lids, center) {
  if (![...corners,...lids,center].every(i=>p[i])) return null;
  const a=p[corners[0]], b=p[corners[1]], c=p[center];
  const dx=b.x-a.x, dy=b.y-a.y, w2=dx*dx+dy*dy;
  if (w2 < .000001) return null;
  const mid={x:(p[lids[0]].x+p[lids[1]].x)/2,y:(p[lids[0]].y+p[lids[1]].y)/2};
  return {x:((c.x-a.x)*dx+(c.y-a.y)*dy)/w2, y:((c.x-mid.x)*-dy+(c.y-mid.y)*dx)/w2};
}
export function extractFeatures(result,frameWidth=1,frameHeight=1) {
  const landmarks=result.faceLandmarks?.[0];
  if (!landmarks) return { face_present: false, ear:null, gaze_x:null, gaze_y:null, rotation:null };
  // Coordinates are normalized independently by width/height: undo that aspect ratio
  // before measuring distances, using width as the common unit.
  const p=landmarks.map(point=>({...point,y:point.y*frameHeight/frameWidth}));
  const left=ear(p,[33,160,158,133,153,144]);
  const right=ear(p,[362,385,387,263,373,380]);
  const l=iris(p,[33,133],[159,145],468), r=iris(p,[362,263],[386,374],473);
  const data=result.facialTransformationMatrixes?.[0]?.data;
  // Rotation columns from the column-major facial transform. Normalize to remove scale.
  let rotation=null;
  if (data?.length===16) {
    rotation=[];
    for (const c of [0,4,8]) { const length=Math.hypot(data[c],data[c+1],data[c+2]); if (!length) {rotation=null;break;} rotation.push(data[c]/length,data[c+1]/length,data[c+2]/length); }
  }
  return {face_present:true,ear:left!==null&&right!==null?(left+right)/2:null,gaze_x:l&&r?(l.x+r.x)/2:null,gaze_y:l&&r?(l.y+r.y)/2:null,rotation};
}
