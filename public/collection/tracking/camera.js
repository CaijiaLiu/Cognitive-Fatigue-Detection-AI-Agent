// Let the browser choose a supported native camera format. In particular, do
// not require a maximum frame rate: some Safari camera sources reject it.
// The tracking loop, not the hardware stream, controls our ~10 Hz sampling.
export function acquireCamera(mediaDevices = navigator.mediaDevices) {
  return mediaDevices.getUserMedia({ video: true, audio: false });
}

export function cameraErrorMessage(error) {
  const messages = {
    NotAllowedError: '摄像头权限被拒绝。请在 Safari 设置 → 网站 → 摄像头中允许 localhost；也可选择仅任务模式。',
    NotFoundError: '未发现摄像头。可选择模拟视觉或仅任务模式。',
    NotReadableError: '摄像头被占用或不可读取。请关闭其他使用摄像头的应用后重试。',
    OverconstrainedError: '浏览器无法打开摄像头的默认格式（已取消分辨率和帧率限制）。请断开虚拟/外接摄像头，使用内置摄像头后重试。',
    AbortError: '摄像头启动被中断，请关闭其他摄像头应用后重试。'
  };
  const code = error?.name || 'UnknownError';
  const detail = error?.constraint ? ` / 参数：${error.constraint}` : '';
  return `${messages[code] || `摄像头启用失败：${error?.message || '未知错误'}`} [${code}${detail}]`;
}
