/* Blog Automation Studio — ChatGPT page driver. Only reads/writes the visible ChatGPT UI the owner is signed in to. */
(() => {
  const SEL = {
    input: ['#prompt-textarea', 'div[contenteditable="true"][data-virtualkeyboard]', 'textarea[name="prompt-textarea"]', 'div.ProseMirror[contenteditable="true"]'],
    send: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Send message"]'],
    stop: ['button[data-testid="stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="Stop generating"]'],
    assistant: '[data-message-author-role="assistant"]',
    user: '[data-message-author-role="user"]',
    login: ['button[data-testid="login-button"]', 'a[href*="/auth/login"]'],
    challenge: ['iframe[src*="challenges.cloudflare.com"]', '#challenge-form', '#cf-challenge-running'],
  };
  const LIMIT_RE = /(you['’]ve (hit|reached) (your|the) .*limit|usage (cap|limit)|too many requests|rate limit|try again (later|in))/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (list, root = document) => { for (const s of [].concat(list)) { const el = root.querySelector(s); if (el) return el; } return null; };
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  class AgentError extends Error { constructor(code, msg, retryAfterSec) { super(msg); this.code = code; this.retryAfterSec = retryAfterSec; } }

  function pageState() {
    if (q(SEL.challenge) || /verify you are human/i.test(document.body?.innerText?.slice(0, 4000) || '')) return 'HUMAN_CHECK';
    if (!q(SEL.input) && q(SEL.login)) return 'LOGIN';
    if (q(SEL.input)) return 'READY';
    return 'LOADING';
  }

  async function waitReady(timeoutMs = 45000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const s = pageState();
      if (s === 'READY') return;
      if (s === 'LOGIN') throw new AgentError('LOGIN', 'ChatGPT is not signed in. Sign in once in the Automation Chrome window.');
      if (s === 'HUMAN_CHECK') throw new AgentError('HUMAN_CHECK', 'ChatGPT is showing a human verification check. Complete it manually.');
      await sleep(400);
    }
    throw new AgentError('ERROR', 'ChatGPT composer did not appear (missing DOM marker).');
  }

  function limitBanner() {
    const nodes = document.querySelectorAll('[role="alert"], .text-token-text-error, div[class*="toast"], ' + SEL.assistant);
    const last = nodes[nodes.length - 1];
    const txt = last ? last.innerText || '' : '';
    if (LIMIT_RE.test(txt)) {
      const m = txt.match(/(\d+)\s*(second|minute|hour)/i);
      const sec = m ? Number(m[1]) * (/hour/i.test(m[2]) ? 3600 : /minute/i.test(m[2]) ? 60 : 1) : undefined;
      return { text: norm(txt).slice(0, 300), sec };
    }
    return null;
  }

  function nodeToMarkdown(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return '';
    const el = node;
    const tag = el.tagName.toLowerCase();
    const kids = () => Array.from(el.childNodes).map(nodeToMarkdown).join('');
    switch (tag) {
      case 'h1': return `\n\n# ${norm(el.innerText)}\n\n`;
      case 'h2': return `\n\n## ${norm(el.innerText)}\n\n`;
      case 'h3': return `\n\n### ${norm(el.innerText)}\n\n`;
      case 'h4': case 'h5': case 'h6': return `\n\n#### ${norm(el.innerText)}\n\n`;
      case 'p': return `\n\n${kids().trim()}\n\n`;
      case 'br': return '\n';
      case 'strong': case 'b': return `**${kids()}**`;
      case 'em': case 'i': return `*${kids()}*`;
      case 'a': return `[${kids()}](${el.getAttribute('href') || ''})`;
      case 'code': return el.closest('pre') ? kids() : `\`${kids()}\``;
      case 'pre': return `\n\n\`\`\`\n${(el.querySelector('code') || el).innerText}\n\`\`\`\n\n`;
      case 'li': {
        const ordered = el.parentElement && el.parentElement.tagName === 'OL';
        const idx = ordered ? Array.from(el.parentElement.children).indexOf(el) + 1 + '. ' : '- ';
        return `\n${idx}${kids().trim()}`;
      }
      case 'ul': case 'ol': return `\n${kids()}\n`;
      case 'table': {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((c) => norm(c.innerText).replace(/\|/g, '\\|')));
        if (!rows.length) return '';
        const head = rows[0];
        const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)];
        return `\n\n${lines.join('\n')}\n\n`;
      }
      case 'button': case 'svg': return '';
      default: return kids();
    }
  }

  function lastAssistant() {
    const all = document.querySelectorAll(SEL.assistant);
    return all.length ? all[all.length - 1] : null;
  }

  function readAnswer(el) {
    const body = el.querySelector('.markdown') || el;
    const md = nodeToMarkdown(body).replace(/\n{3,}/g, '\n\n').trim();
    return { text: md || norm(body.innerText), html: body.innerHTML };
  }

  async function insertPrompt(input, text) {
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(150);
      if (norm(input.innerText).length < Math.min(50, norm(text).length)) {
        document.execCommand('selectAll', false);
        document.execCommand('insertText', false, text);
      }
    }
    await sleep(300);
    const got = norm(input.value ?? input.innerText);
    if (got.slice(-80) !== norm(text).slice(-80)) throw new AgentError('ERROR', 'Prompt insertion could not be verified (composer content mismatch).');
  }

  async function waitForCompletion(beforeCount, onProgress, timeoutMs, isCancelled) {
    const end = Date.now() + timeoutMs;
    let lastText = '';
    let stableSince = Date.now();
    let started = false;
    while (Date.now() < end) {
      if (isCancelled()) throw new AgentError('CANCELLED', 'Cancelled by dashboard');
      const lim = limitBanner();
      if (lim) throw new AgentError('USAGE_LIMIT', lim.text, lim.sec);
      const st = pageState();
      if (st === 'LOGIN' || st === 'HUMAN_CHECK') throw new AgentError(st, st === 'LOGIN' ? 'Signed out during generation' : 'Human verification appeared during generation');
      const count = document.querySelectorAll(SEL.assistant).length;
      const streaming = !!q(SEL.stop);
      const el = count > beforeCount ? lastAssistant() : null;
      const text = el ? norm(el.innerText) : '';
      if (streaming || text) started = true;
      if (text !== lastText) { lastText = text; stableSince = Date.now(); onProgress(text.length); }
      if (started && !streaming && text && Date.now() - stableSince > 2500) return el;
      await sleep(500);
    }
    throw new AgentError('ERROR', `No completed answer within ${Math.round(timeoutMs / 1000)}s`);
  }

  /** If the prompt was already sent (crash/restart), return the existing answer instead of resending. */
  function findExistingAnswer(promptTail) {
    const users = document.querySelectorAll(SEL.user);
    for (let i = users.length - 1; i >= 0; i--) {
      if (norm(users[i].innerText).includes(norm(promptTail).slice(-120))) {
        const all = Array.from(document.querySelectorAll(`${SEL.user}, ${SEL.assistant}`));
        const after = all.slice(all.indexOf(users[i]) + 1).find((n) => n.matches(SEL.assistant));
        return { sent: true, answerEl: after && norm(after.innerText) ? after : null, streaming: !!q(SEL.stop) };
      }
    }
    return { sent: false, answerEl: null, streaming: false };
  }

  async function runJob(job, hooks = {}) {
    const onProgress = hooks.onProgress || (() => {});
    const isCancelled = hooks.isCancelled || (() => false);
    const t0 = Date.now();
    await waitReady();
    if (job.reconcile && !job.newChat) {
      await sleep(1500);
      const ex = findExistingAnswer(job.promptTail);
      if (ex.sent) {
        const el = ex.streaming || !ex.answerEl ? await waitForCompletion(0, onProgress, job.timeoutMs || 600000, isCancelled).catch(() => ex.answerEl) : ex.answerEl;
        if (el) return { ...readAnswer(el), conversationUrl: location.href, recovered: true, elapsedMs: Date.now() - t0 };
      }
    }
    const input = q(SEL.input);
    const before = document.querySelectorAll(SEL.assistant).length;
    await insertPrompt(input, job.prompt);
    let send = null;
    for (let i = 0; i < 20 && !(send = q(SEL.send)); i++) await sleep(250);
    if (!send || send.disabled) throw new AgentError('ERROR', 'Send button not found or disabled (missing DOM marker).');
    send.click();
    onProgress(0, 'sent');
    const el = await waitForCompletion(before, onProgress, job.timeoutMs || 600000, isCancelled);
    return { ...readAnswer(el), conversationUrl: location.href, recovered: false, elapsedMs: Date.now() - t0 };
  }

  globalThis.__basAgent = { runJob, pageState, nodeToMarkdown, findExistingAnswer, AgentError };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    let cancelled = false;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'bas:ping') { sendResponse({ ok: true, state: pageState(), url: location.href }); return; }
      if (msg?.type === 'bas:cancel') { cancelled = true; sendResponse({ ok: true }); return; }
      if (msg?.type === 'bas:run') {
        cancelled = false;
        runJob(msg.job, {
          onProgress: (chars, phase) => chrome.runtime.sendMessage({ type: 'bas:progress', jobId: msg.job.jobId, chars, phase: phase || 'streaming', conversationUrl: location.href }).catch(() => {}),
          isCancelled: () => cancelled,
        })
          .then((r) => sendResponse({ ok: true, result: r }))
          .catch((e) => sendResponse({ ok: false, code: e.code || 'ERROR', message: e.message, retryAfterSec: e.retryAfterSec, conversationUrl: location.href }));
        return true;
      }
    });
  }
})();
