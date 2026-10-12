const $ = (id) => document.getElementById(id);
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'bas:status' });
  $('server').value = s.serverUrl; $('tabs').value = s.tabCount; $('enabled').checked = s.enabled;
  $('key').placeholder = s.key || 'bas_…';
  const bo = s.backoffUntil > Date.now() ? `\nBackoff until ${new Date(s.backoffUntil).toLocaleTimeString()}` : '';
  $('status').textContent = `v${s.version} · tabs ${s.tabs} · busy ${s.busy}${bo}${s.lastError ? `\nLast error: ${s.lastError}` : ''}`;
}
$('save').onclick = async () => {
  const patch = { serverUrl: $('server').value.trim() || 'http://localhost:3000', tabCount: Number($('tabs').value) || 2, enabled: $('enabled').checked };
  if ($('key').value.trim()) patch.key = $('key').value.trim();
  await chrome.storage.local.set(patch); $('key').value = '';
  await chrome.runtime.sendMessage({ type: 'bas:kick' }); refresh();
};
$('test').onclick = async () => { const r = await chrome.runtime.sendMessage({ type: 'bas:test' }); $('status').textContent = r.ok ? 'Connected ✔' : `Failed: ${r.error}`; };
refresh();
