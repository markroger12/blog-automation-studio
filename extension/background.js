/* Blog Automation Studio — agent service worker. Talks only to the configured local server and ChatGPT tabs. */
const VERSION = '3.0.0';
const state = { running: false, tabs: new Map(), backoffUntil: 0, lastError: null, instanceId: null };

async function cfg() {
  const c = await chrome.storage.local.get(['serverUrl', 'key', 'instanceId', 'tabCount', 'enabled']);
  if (!c.instanceId) { c.instanceId = `inst-${crypto.randomUUID().slice(0, 12)}`; await chrome.storage.local.set({ instanceId: c.instanceId }); }
  return { serverUrl: (c.serverUrl || 'http://localhost:3000').replace(/\/$/, ''), key: c.key || '', instanceId: c.instanceId, tabCount: Math.min(5, Math.max(1, Number(c.tabCount) || 2)), enabled: !!c.enabled };
}

function isLocal(url) {
  try { const u = new URL(url); return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'); } catch { return false; }
}

async function call(path, body) {
  const c = await cfg();
  if (!isLocal(c.serverUrl)) throw new Error('Server URL must be http://localhost or http://127.0.0.1');
  if (!c.key) throw new Error('No connection key configured');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${c.serverUrl}/api/agent/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` }, body: JSON.stringify({ instanceId: c.instanceId, ...body }), signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  } finally { clearTimeout(t); }
}

function waitTabComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); reject(new Error('Tab load timeout')); }, timeoutMs);
    function fn(id, info) { if (id === tabId && info.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(fn); resolve(); } }
    chrome.tabs.onUpdated.addListener(fn);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(fn); resolve(); } }).catch(() => {});
  });
}

async function ensureTabs() {
  const c = await cfg();
  const existing = await chrome.tabs.query({ url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] });
  const ours = existing.filter((t) => state.tabs.has(t.id));
  for (const t of existing) if (ours.length < c.tabCount && !state.tabs.has(t.id)) { state.tabs.set(t.id, { busy: false }); ours.push(t); }
  while (state.tabs.size < c.tabCount) {
    const t = await chrome.tabs.create({ url: 'https://chatgpt.com/', active: false });
    state.tabs.set(t.id, { busy: false });
  }
}

async function navigate(tabId, url) {
  const t = await chrome.tabs.get(tabId);
  if (t.url !== url) { await chrome.tabs.update(tabId, { url }); await waitTabComplete(tabId); }
  for (let i = 0; i < 20; i++) {
    try { const r = await chrome.tabs.sendMessage(tabId, { type: 'bas:ping' }); if (r?.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Content script did not respond');
}

async function runOnTab(tabId) {
  const slot = state.tabs.get(tabId);
  if (!slot || slot.busy || Date.now() < state.backoffUntil) return;
  slot.busy = true;
  let job = null;
  let hb = null;
  try {
    const r = await call('claim', { tabId: String(tabId) });
    if (r.backoffUntil) { state.backoffUntil = new Date(r.backoffUntil).getTime(); return; }
    job = r.job;
    if (!job) return;
    slot.jobId = job.jobId;
    await navigate(tabId, job.newChat || !job.conversationUrl ? 'https://chatgpt.com/' : job.conversationUrl);
    hb = setInterval(async () => {
      try {
        const p = await call('progress', { tabId: String(tabId), jobId: job.jobId, phase: 'heartbeat', conversationUrl: (await chrome.tabs.get(tabId)).url });
        if (p.cancel) chrome.tabs.sendMessage(tabId, { type: 'bas:cancel' }).catch(() => {});
      } catch (e) { if (e.status === 409) chrome.tabs.sendMessage(tabId, { type: 'bas:cancel' }).catch(() => {}); }
    }, 20000);
    const res = await chrome.tabs.sendMessage(tabId, { type: 'bas:run', job });
    if (res?.ok) await call('complete', { tabId: String(tabId), jobId: job.jobId, ...res.result });
    else await call('fail', { tabId: String(tabId), jobId: job.jobId, code: res?.code || 'ERROR', message: res?.message || 'No response from content script', retryAfterSec: res?.retryAfterSec, conversationUrl: res?.conversationUrl });
    state.lastError = res?.ok ? null : `${res?.code}: ${res?.message}`;
  } catch (e) {
    state.lastError = e.message;
    if (job) await call('fail', { tabId: String(tabId), jobId: job.jobId, code: /closed|No tab/i.test(e.message) ? 'ERROR' : 'ERROR', message: e.message }).catch(() => {});
  } finally {
    if (hb) clearInterval(hb);
    slot.busy = false;
    slot.jobId = null;
  }
}

async function loop() {
  if (state.running) return;
  state.running = true;
  try {
    const c = await cfg();
    if (!c.enabled || !c.key) return;
    await call('hello', { version: VERSION, tabs: state.tabs.size, userAgent: navigator.userAgent }).then((h) => { if (h.backoffUntil) state.backoffUntil = new Date(h.backoffUntil).getTime(); });
    await ensureTabs();
    await Promise.all([...state.tabs.keys()].map((id) => runOnTab(id)));
  } catch (e) {
    state.lastError = e.message;
  } finally {
    state.running = false;
  }
}

chrome.tabs.onRemoved.addListener((id) => state.tabs.delete(id));
chrome.alarms.create('bas-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'bas-poll') loop(); });
chrome.runtime.onStartup.addListener(loop);
chrome.runtime.onInstalled.addListener(loop);
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.type === 'bas:status') { cfg().then((c) => sendResponse({ ...c, key: c.key ? `${c.key.slice(0, 10)}…` : '', tabs: state.tabs.size, busy: [...state.tabs.values()].filter((t) => t.busy).length, backoffUntil: state.backoffUntil, lastError: state.lastError, version: VERSION })); return true; }
  if (msg?.type === 'bas:test') { call('hello', { version: VERSION, tabs: state.tabs.size }).then((r) => sendResponse({ ok: true, r })).catch((e) => sendResponse({ ok: false, error: e.message })); return true; }
  if (msg?.type === 'bas:kick') { loop(); sendResponse({ ok: true }); }
});
setInterval(loop, 5000);
