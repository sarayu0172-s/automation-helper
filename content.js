/**
 * content.js — Content script (runs in every matched page)
 *
 * Acts as the bridge between the popup / background service worker
 * and the three utility modules (SafetyChecks, FieldDetector,
 * AutofillEngine) that operate on the live DOM.
 *
 * Also manages a simple log buffer that can be retrieved by the popup.
 */

(() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Logging                                                           */
  /* ------------------------------------------------------------------ */

  const MAX_LOG_ENTRIES = 200;
  const _log = [];

  function log(level, message, data = null) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(data ? { data } : {}),
    };
    _log.push(entry);
    if (_log.length > MAX_LOG_ENTRIES) _log.shift();
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `[AutomationHelper] ${message}`, data ?? ''
    );
  }

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */

  let lastScanResult = null;   // cached field scan
  let automationActive = false;

  /* ------------------------------------------------------------------ */
  /*  On-page toast notification                                        */
  /* ------------------------------------------------------------------ */

  const TOAST_ID = 'ah-page-toast';

  function _injectToastCSS() {
    if (document.getElementById('ah-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'ah-toast-style';
    style.textContent = `
      #${TOAST_ID} {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        max-width: 340px;
        padding: 12px 18px;
        border-radius: 10px;
        font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        color: #fff;
        box-shadow: 0 8px 32px rgba(0,0,0,.35);
        opacity: 0;
        transform: translateY(12px) scale(.97);
        transition: opacity .25s ease, transform .25s ease;
        pointer-events: none;
      }
      #${TOAST_ID}.ah-toast-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      #${TOAST_ID}.ah-toast-ok      { background: #16a34a; }
      #${TOAST_ID}.ah-toast-warn    { background: #ca8a04; }
      #${TOAST_ID}.ah-toast-error   { background: #dc2626; }
      #${TOAST_ID} .ah-toast-title  { font-weight: 700; margin-bottom: 2px; }
      #${TOAST_ID} .ah-toast-body   { opacity: .9; }
    `;
    document.head.appendChild(style);
  }

  let _toastTimer = null;
  function showPageToast(level, title, body, durationMs = 3500) {
    _injectToastCSS();

    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      document.body.appendChild(el);
    }

    clearTimeout(_toastTimer);
    el.className = '';  // reset
    el.innerHTML = `
      <div class="ah-toast-title">${title}</div>
      ${body ? `<div class="ah-toast-body">${body}</div>` : ''}
    `;

    // Force reflow for animation restart
    void el.offsetWidth;
    el.className = `ah-toast-${level}`;

    requestAnimationFrame(() => {
      el.classList.add('ah-toast-visible');
    });

    _toastTimer = setTimeout(() => {
      el.classList.remove('ah-toast-visible');
    }, durationMs);
  }

  /* ------------------------------------------------------------------ */
  /*  Usage statistics — lightweight, stored locally                    */
  /* ------------------------------------------------------------------ */

  function _trackStat(action, count = 1) {
    chrome.storage.local.get(['stats'], (data) => {
      const stats = data.stats || { scans: 0, fills: 0, blocks: 0, totalFields: 0 };
      if (action === 'scan')  stats.scans += count;
      if (action === 'fill')  { stats.fills += 1; stats.totalFields += count; }
      if (action === 'block') stats.blocks += count;
      stats.lastUsed = new Date().toISOString();
      chrome.storage.local.set({ stats });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Domain whitelist check                                            */
  /* ------------------------------------------------------------------ */

  async function isDomainAllowed() {
    return new Promise(resolve => {
      chrome.storage.sync.get(['whitelist', 'whitelistEnabled'], (data) => {
        if (!data.whitelistEnabled) { resolve(true); return; }
        const list = (data.whitelist || '').split('\n')
          .map(d => d.trim().toLowerCase()).filter(Boolean);
        if (list.length === 0) { resolve(true); return; }
        const host = location.hostname.toLowerCase();
        resolve(list.some(d => host === d || host.endsWith(`.${d}`)));
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Message handler                                                   */
  /* ------------------------------------------------------------------ */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // All actions are async so we return true to keep the channel open
    (async () => {
      try {
        switch (msg.action) {

          /* ---------- Scan ---------- */
          case 'scan': {
            log('info', 'Scan requested');

            // Domain whitelist
            const allowed = await isDomainAllowed();
            if (!allowed) {
              sendResponse({ ok: false, reason: 'Domain not in whitelist.' });
              return;
            }

            // Safety check first
            const safety = SafetyChecks.scanPage();
            if (!safety.safe) {
              log('warn', 'Safety block', safety);
              _trackStat('block');
              showPageToast('error', 'Automation Blocked', safety.summary, 5000);
              sendResponse({
                ok: false,
                reason: safety.summary,
                threats: safety.threats,
              });
              return;
            }

            // Detect fields
            const fields = FieldDetector.detectFields();
            lastScanResult = fields;
            const summary = {};
            for (const f of fields) {
              summary[f.fieldType] = (summary[f.fieldType] || 0) + 1;
            }
            log('info', `Scan complete: ${fields.length} fields`, summary);
            _trackStat('scan');
            showPageToast('ok', 'Scan Complete', `${fields.length} fillable field${fields.length !== 1 ? 's' : ''} detected.`);
            sendResponse({ ok: true, total: fields.length, summary });
            return;
          }

          /* ---------- Preview ---------- */
          case 'preview': {
            if (!lastScanResult) {
              sendResponse({ ok: false, reason: 'Run a scan first.' });
              return;
            }
            const profile = await _getProfile();
            const prev = AutofillEngine.preview(lastScanResult, profile);
            sendResponse({ ok: true, preview: prev });
            return;
          }

          /* ---------- Autofill ---------- */
          case 'autofill': {
            log('info', 'Autofill requested');
            automationActive = true;

            // Re-check safety
            const safety2 = SafetyChecks.scanPage();
            if (!safety2.safe) {
              automationActive = false;
              sendResponse({ ok: false, reason: safety2.summary });
              return;
            }

            // If no prior scan, do one now
            if (!lastScanResult) {
              lastScanResult = FieldDetector.detectFields();
            }

            const profile = await _getProfile();
            if (!profile || Object.keys(profile).length === 0) {
              automationActive = false;
              sendResponse({ ok: false, reason: 'No profile saved. Open Options to set one up.' });
              return;
            }

            const result = AutofillEngine.fill(lastScanResult, profile, {
              overwrite: false,
              highlight: true,
            });

            log('info', `Autofill done: ${result.filled} filled, ${result.skipped} skipped`);
            _trackStat('fill', result.filled);
            if (result.filled > 0) {
              showPageToast('ok', 'Fields Filled', `${result.filled} field${result.filled !== 1 ? 's' : ''} filled successfully.`);
            } else {
              showPageToast('warn', 'Nothing Filled', 'All fields already have values or no matching profile data.');
            }
            automationActive = false;
            sendResponse({ ok: true, ...result });
            return;
          }

          /* ---------- Stop ---------- */
          case 'stop': {
            automationActive = false;
            AutofillEngine.clearHighlights();
            lastScanResult = null;
            log('info', 'Automation stopped');
            sendResponse({ ok: true });
            return;
          }

          /* ---------- Get logs ---------- */
          case 'getLogs': {
            sendResponse({ ok: true, logs: _log.slice(-50) });
            return;
          }

          /* ---------- Get current status ---------- */
          case 'getStatus': {
            const safety = SafetyChecks.scanPage();
            sendResponse({
              ok: true,
              hostname: location.hostname,
              safe: safety.safe,
              hasScanned: lastScanResult !== null,
              fieldCount: lastScanResult ? lastScanResult.length : 0,
              automationActive,
            });
            return;
          }

          /* ---------- Get usage stats ---------- */
          case 'getStats': {
            chrome.storage.local.get(['stats'], (data) => {
              sendResponse({ ok: true, stats: data.stats || { scans: 0, fills: 0, blocks: 0, totalFields: 0 } });
            });
            return;
          }

          default:
            sendResponse({ ok: false, reason: `Unknown action: ${msg.action}` });
        }
      } catch (err) {
        log('error', err.message);
        sendResponse({ ok: false, reason: err.message });
      }
    })();

    return true; // keep message channel open for async response
  });

  /* ------------------------------------------------------------------ */
  /*  Profile loader                                                    */
  /* ------------------------------------------------------------------ */

  function _getProfile() {
    return new Promise(resolve => {
      chrome.storage.sync.get(['profile'], (data) => {
        resolve(data.profile || {});
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Init                                                              */
  /* ------------------------------------------------------------------ */

  log('info', `Content script loaded on ${location.hostname}`);
})();
