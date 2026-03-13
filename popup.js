/**
 * popup.js — Popup controller
 *
 * Manages the popup UI: sends messages to the content script,
 * receives results, updates the display, and notifies the
 * background worker to update the badge icon.
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------------------------------------------------------- */
  /*  DOM references                                                  */
  /* ---------------------------------------------------------------- */

  const $         = (sel) => document.getElementById(sel);
  const btnScan   = $('btn-scan');
  const btnPreview= $('btn-preview');
  const btnFill   = $('btn-fill');
  const btnStop   = $('btn-stop');
  const statusBar = $('status-bar');
  const statusText= $('status-text');
  const scanResults  = $('scan-results');
  const fieldsList   = $('fields-list');
  const previewPanel = $('preview-panel');
  const previewList  = $('preview-list');
  const linkOptions  = $('link-options');
  const linkLogs     = $('link-logs');
  const logDrawer    = $('log-drawer');
  const logOutput    = $('log-output');
  const btnCloseLogs = $('btn-close-logs');
  const scanCounter  = $('scan-counter');

  /* ---------------------------------------------------------------- */
  /*  State                                                           */
  /* ---------------------------------------------------------------- */

  let lastScanCount = 0;

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                         */
  /* ---------------------------------------------------------------- */

  function setStatus(level, text) {
    statusBar.className = `status-bar status-${level}`;
    statusText.textContent = text;
  }

  function updateBadge(status, count = 0) {
    try {
      chrome.runtime.sendMessage({ type: 'updateBadge', status, count });
    } catch { /* popup closing — safe to ignore */ }
  }

  async function sendToContent(action) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setStatus('error', 'No active tab found.');
        return null;
      }
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action }, (resp) => {
          if (chrome.runtime.lastError) {
            setStatus('error', 'Cannot reach page. Try refreshing the tab.');
            resolve(null);
            return;
          }
          resolve(resp);
        });
      });
    } catch (err) {
      setStatus('error', err.message);
      return null;
    }
  }

  function enablePostScan() {
    btnPreview.disabled = false;
    btnFill.disabled    = false;
    btnStop.disabled    = false;
  }

  function resetUI() {
    btnPreview.disabled = true;
    btnFill.disabled    = true;
    btnStop.disabled    = true;
    scanResults.classList.add('hidden');
    previewPanel.classList.add('hidden');
    fieldsList.innerHTML  = '';
    previewList.innerHTML = '';
    if (scanCounter) scanCounter.classList.add('hidden');
    setStatus('idle', 'Ready — scan a page to begin');
  }

  /** Render a list of key→value items into a <ul>. */
  function renderList(ul, items) {
    ul.innerHTML = '';
    for (const [label, value] of items) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="field-type">${label}</span><span class="field-value">${value}</span>`;
      ul.appendChild(li);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Scan                                                            */
  /* ---------------------------------------------------------------- */

  btnScan.addEventListener('click', async () => {
    setStatus('idle', 'Scanning…');
    btnScan.disabled = true;
    scanResults.classList.add('hidden');
    previewPanel.classList.add('hidden');

    const resp = await sendToContent('scan');
    btnScan.disabled = false;

    if (!resp) return;

    if (!resp.ok) {
      setStatus('error', resp.reason);
      updateBadge('blocked');
      return;
    }

    if (resp.total === 0) {
      setStatus('warn', 'No fillable fields detected on this page.');
      updateBadge('clear');
      return;
    }

    // Show detected fields summary
    const items = Object.entries(resp.summary).map(
      ([type, count]) => [type, `${count} field${count > 1 ? 's' : ''}`]
    );
    renderList(fieldsList, items);
    scanResults.classList.remove('hidden');

    // Update counter badge in popup header
    if (scanCounter) {
      scanCounter.textContent = resp.total;
      scanCounter.classList.remove('hidden');
    }

    lastScanCount = resp.total;
    setStatus('ok', `Found ${resp.total} field${resp.total > 1 ? 's' : ''} — ready to fill`);
    updateBadge('scanned', resp.total);
    enablePostScan();
  });

  /* ---------------------------------------------------------------- */
  /*  Preview                                                         */
  /* ---------------------------------------------------------------- */

  btnPreview.addEventListener('click', async () => {
    setStatus('idle', 'Loading preview…');
    const resp = await sendToContent('preview');

    if (!resp?.ok) {
      setStatus('warn', resp?.reason || 'Preview failed.');
      return;
    }

    const items = resp.preview.map((item) => {
      let val;
      if (item.wouldFill) {
        val = item.isEmpty
          ? `<span style="color:#22c55e">${escHtml(item.wouldFill)}</span>`
          : `<span style="color:#eab308">${escHtml(item.wouldFill)}</span> <span style="opacity:.4">(has value)</span>`;
      } else {
        val = '<span style="opacity:.3">no profile data</span>';
      }
      return [item.fieldType, val];
    });

    renderList(previewList, items);
    previewPanel.classList.remove('hidden');
    setStatus('ok', `Preview: ${resp.preview.filter(i => i.wouldFill && i.isEmpty).length} fields will be filled`);
  });

  /* ---------------------------------------------------------------- */
  /*  Autofill                                                        */
  /* ---------------------------------------------------------------- */

  btnFill.addEventListener('click', async () => {
    setStatus('idle', 'Filling fields…');
    btnFill.disabled = true;
    const resp = await sendToContent('autofill');
    btnFill.disabled = false;

    if (!resp) return;
    if (!resp.ok) {
      setStatus('error', resp.reason);
      updateBadge('blocked');
      return;
    }

    const msg = resp.filled > 0
      ? `Filled ${resp.filled} field${resp.filled !== 1 ? 's' : ''}`
      : 'No fields were filled';
    const suffix = resp.skipped > 0 ? `, skipped ${resp.skipped}` : '';
    setStatus('ok', msg + suffix);
    updateBadge('filled', resp.filled);
  });

  /* ---------------------------------------------------------------- */
  /*  Stop                                                            */
  /* ---------------------------------------------------------------- */

  btnStop.addEventListener('click', async () => {
    await sendToContent('stop');
    resetUI();
    updateBadge('clear');
    setStatus('idle', 'Automation stopped and highlights cleared.');
  });

  /* ---------------------------------------------------------------- */
  /*  Options link                                                    */
  /* ---------------------------------------------------------------- */

  linkOptions.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  /* ---------------------------------------------------------------- */
  /*  Logs                                                            */
  /* ---------------------------------------------------------------- */

  linkLogs.addEventListener('click', async (e) => {
    e.preventDefault();
    logDrawer.classList.toggle('hidden');

    if (!logDrawer.classList.contains('hidden')) {
      logOutput.textContent = 'Loading…';
      const resp = await sendToContent('getLogs');
      if (resp?.ok && resp.logs.length > 0) {
        logOutput.textContent = resp.logs
          .map(l => `${l.ts.slice(11, 19)} [${l.level.toUpperCase().padEnd(4)}] ${l.message}`)
          .join('\n');
        logOutput.scrollTop = logOutput.scrollHeight;
      } else {
        logOutput.textContent = '(no log entries yet — scan a page first)';
      }
    }
  });

  btnCloseLogs.addEventListener('click', () => {
    logDrawer.classList.add('hidden');
  });

  /* ---------------------------------------------------------------- */
  /*  Utility                                                         */
  /* ---------------------------------------------------------------- */

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------------------------------------------------------- */
  /*  Init — fetch page info + stats on popup open                    */
  /* ---------------------------------------------------------------- */

  const pageInfo   = $('page-info');
  const pageDomain = $('page-domain');
  const statsRow   = $('stats-row');

  (async () => {
    // Show current domain
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const hostname = new URL(tab.url).hostname || 'local file';
        if (pageInfo && pageDomain) {
          pageDomain.textContent = hostname;
          pageInfo.classList.remove('hidden');
        }
      }
    } catch { /* ignore */ }

    // Load usage stats
    const statsResp = await sendToContent('getStats');
    if (statsResp?.ok && statsResp.stats) {
      const s = statsResp.stats;
      const numScans  = $('stat-scans');
      const numFills  = $('stat-fills');
      const numFields = $('stat-fields');
      const numBlocks = $('stat-blocks');
      if (numScans)  numScans.textContent  = s.scans;
      if (numFills)  numFills.textContent  = s.fills;
      if (numFields) numFields.textContent = s.totalFields;
      if (numBlocks) numBlocks.textContent = s.blocks;
      if (statsRow && (s.scans || s.fills || s.blocks)) {
        statsRow.classList.remove('hidden');
      }
    }
  })();
});
