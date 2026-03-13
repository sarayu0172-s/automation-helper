/**
 * background.js — Manifest V3 service worker
 *
 * Responsibilities:
 *  1. Keyboard shortcut relay (Alt+S / Alt+F / Alt+X)
 *  2. Badge icon updates (field count, safety warnings)
 *  3. Extension lifecycle (install, update)
 *  4. Context menu integration
 *  5. Message routing between popup ↔ content scripts
 */

'use strict';

/* ==================================================================== */
/*  Constants                                                           */
/* ==================================================================== */

const BADGE_COLORS = {
  safe:    '#22c55e',
  warning: '#eab308',
  danger:  '#ef4444',
  idle:    '#6c8cff',
};

/* ==================================================================== */
/*  Badge helpers                                                       */
/* ==================================================================== */

async function setBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeText({ text: String(text), tabId });
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
  } catch { /* tab may have closed */ }
}

async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ text: '', tabId });
  } catch { /* ignore */ }
}

/* ==================================================================== */
/*  Keyboard shortcut handler                                           */
/* ==================================================================== */

chrome.commands.onCommand.addListener(async (command) => {
  const actionMap = {
    'scan-page':       'scan',
    'autofill-page':   'autofill',
    'stop-automation': 'stop',
  };
  const action = actionMap[command];
  if (!action) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    const response = await chrome.tabs.sendMessage(tab.id, { action });
    if (action === 'scan' && response?.ok) {
      setBadge(tab.id, String(response.total), BADGE_COLORS.safe);
    } else if (action === 'scan' && !response?.ok) {
      setBadge(tab.id, '!', BADGE_COLORS.danger);
    } else if (action === 'autofill' && response?.ok) {
      setBadge(tab.id, String(response.filled), BADGE_COLORS.safe);
    } else if (action === 'stop') {
      clearBadge(tab.id);
    }
  } catch (err) {
    console.warn('[AH-BG]', err.message);
  }
});

/* ==================================================================== */
/*  Message handler — badge updates from popup                          */
/* ==================================================================== */

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg.type === 'updateBadge') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (msg.status === 'scanned') {
        setBadge(tab.id, String(msg.count || 0), BADGE_COLORS.safe);
      } else if (msg.status === 'blocked') {
        setBadge(tab.id, '!', BADGE_COLORS.danger);
      } else if (msg.status === 'filled') {
        setBadge(tab.id, String(msg.count), BADGE_COLORS.safe);
      } else if (msg.status === 'clear') {
        clearBadge(tab.id);
      }
    })();
  }
  return false;
});

/* ==================================================================== */
/*  Clear badge on navigation                                           */
/* ==================================================================== */

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearBadge(tabId);
  }
});

/* ==================================================================== */
/*  Context menu                                                        */
/* ==================================================================== */

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'ah-scan',
    title: 'Scan Page for Forms',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'ah-autofill',
    title: 'Autofill Detected Fields',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'ah-sep',
    type: 'separator',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'ah-options',
    title: 'Open Profile Settings',
    contexts: ['page'],
  });

  if (details.reason === 'install') {
    console.log('[AH] Installed — opening options.');
    chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ah-options') {
    chrome.runtime.openOptionsPage();
    return;
  }
  const actionMap = { 'ah-scan': 'scan', 'ah-autofill': 'autofill' };
  const action = actionMap[info.menuItemId];
  if (!action || !tab?.id) return;

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action });
    if (action === 'scan' && resp?.ok) setBadge(tab.id, String(resp.total), BADGE_COLORS.safe);
    else if (action === 'scan' && !resp?.ok) setBadge(tab.id, '!', BADGE_COLORS.danger);
  } catch { /* content script not loaded */ }
});
