export function simulatedFeatures(time) {
  const closed=time%3600>=2200&&time%3600<2400;
  const angle=.035*Math.sin(time/900);
  return {face_present:true,ear:closed?.09:.3+.012*Math.sin(time/800),gaze_x:.5+.028*Math.sin(time/1300),gaze_y:.01*Math.cos(time/1500),rotation:[Math.cos(angle),Math.sin(angle),0,-Math.sin(angle),Math.cos(angle),0,0,0,1]};
}
