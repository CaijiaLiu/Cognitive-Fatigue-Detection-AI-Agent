// Let the browser choose a supported native camera format. In particular, do
// not require a maximum frame rate: some Safari camera sources reject it.
// The tracking loop, not the hardware stream, controls our ~10 Hz sampling.
export function acquireCamera(mediaDevices = navigator.mediaDevices) {
  return mediaDevices.getUserMedia({ video: true, audio: false });
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: 'Camera permission was denied. In Safari, allow this website under Settings → Websites → Camera. Also check system camera permissions, or choose Task only.',
    NotFoundError: 'No camera was found. Choose Simulated vision or Task only.',
    NotReadableError: 'The camera is busy or cannot be read. Close other apps using the camera and retry.',
    OverconstrainedError: 'The browser could not open the native camera format. No resolution or frame-rate limits are requested. Disconnect virtual or external cameras and retry with the built-in camera.',
    AbortError: 'Camera startup was interrupted. Close other camera apps and retry.'
  };
  const code = error?.name || 'UnknownError';
  const detail = error?.constraint ? ` / Constraint: ${error.constraint}` : '';
  return `${messages[code] || `Camera startup failed: ${error?.message || 'Unknown error'}`} [${code}${detail}]`;
}
