// Navigation only. No serialization, postMessage, upload, or new storage.
export function updateAgentLink(saveFailed = false) {
  let link = document.getElementById('open-local-agent');
  if (!link) {
    link = document.createElement('a');
    link.id = 'open-local-agent';
    link.className = 'button secondary';
    link.href = '/research-agent#local-results';
    document.querySelector('.result-actions').append(link);
  }
  link.textContent = saveFailed ? 'Open Agent (export JSON first) ↗' : 'View this browser’s results in Agent ↗';
}
