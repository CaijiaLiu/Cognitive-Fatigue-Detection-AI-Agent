// Classic worker: MediaPipe's WASM loader uses importScripts in this pinned version.
let tracker;
self.onmessage=async event=>{
  const {type,bitmap,timestamp}=event.data;
  try {
    if(type==='init') {
      const {FaceLandmarker,FilesetResolver}=await import(new URL('./vendor/vision_bundle.mjs', self.location.href).href);
      const wasm=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm/',self.location.href).href);
      tracker=await FaceLandmarker.createFromOptions(wasm,{baseOptions:{modelAssetPath:new URL('./vendor/face_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFacialTransformationMatrixes:true,minFaceDetectionConfidence:.6,minFacePresenceConfidence:.6,minTrackingConfidence:.6});
      self.postMessage({type:'ready'});
    } else if(type==='frame') {
      try {
        const result=tracker.detectForVideo(bitmap,timestamp);
        self.postMessage({type:'result',timestamp,frameWidth:bitmap.width,frameHeight:bitmap.height,result:{faceLandmarks:result.faceLandmarks,facialTransformationMatrixes:result.facialTransformationMatrixes}});
      } finally {bitmap.close();}
    }
  } catch(error) { self.postMessage({type:'error',message:error.message||String(error)}); }
};
