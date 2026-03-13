/**
 * options.js — Options page controller
 *
 * Features:
 *  - Save / clear profile data
 *  - Domain whitelist management
 *  - Export profile to JSON file
 *  - Import profile from JSON file
 *  - Live profile completeness meter
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------------------------------------------------------- */
  /*  Constants                                                       */
  /* ---------------------------------------------------------------- */

  const PROFILE_FIELDS = [
    'fullName', 'email', 'phone', 'company',
    'address', 'city', 'state', 'zip', 'country',
  ];

  /* ---------------------------------------------------------------- */
  /*  DOM references                                                  */
  /* ---------------------------------------------------------------- */

  const $           = (id) => document.getElementById(id);
  const btnSave     = $('btn-save');
  const btnClear    = $('btn-clear');
  const btnSaveWL   = $('btn-save-wl');
  const wlEnabled   = $('whitelistEnabled');
  const wlTextarea  = $('whitelist');
  const toast       = $('toast');
  const btnExport   = $('btn-export');
  const btnImport   = $('btn-import');
  const importFile  = $('import-file');
  const meterBar    = $('meter-bar');
  const meterLabel  = $('meter-label');

  /* ---------------------------------------------------------------- */
  /*  Toast                                                           */
  /* ---------------------------------------------------------------- */

  let toastTimer = null;
  function showToast(message = 'Saved!', isError = false) {
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#22c55e';
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  /* ---------------------------------------------------------------- */
  /*  Profile completeness meter                                      */
  /* ---------------------------------------------------------------- */

  function updateMeter() {
    let filled = 0;
    for (const key of PROFILE_FIELDS) {
      if ($(key)?.value.trim()) filled++;
    }
    const pct = Math.round((filled / PROFILE_FIELDS.length) * 100);
    if (meterBar) meterBar.style.width = `${pct}%`;
    if (meterLabel) meterLabel.textContent = `${filled} of ${PROFILE_FIELDS.length} fields filled (${pct}%)`;
  }

  // Live update meter on typing
  for (const key of PROFILE_FIELDS) {
    const el = $(key);
    if (el) el.addEventListener('input', updateMeter);
  }

  /* ---------------------------------------------------------------- */
  /*  Load saved data                                                 */
  /* ---------------------------------------------------------------- */

  chrome.storage.sync.get(['profile', 'whitelist', 'whitelistEnabled'], (data) => {
    const profile = data.profile || {};
    for (const key of PROFILE_FIELDS) {
      const el = $(key);
      if (el && profile[key]) el.value = profile[key];
    }
    wlEnabled.checked = !!data.whitelistEnabled;
    wlTextarea.value  = data.whitelist || '';
    updateMeter();
  });

  /* ---------------------------------------------------------------- */
  /*  Save profile                                                    */
  /* ---------------------------------------------------------------- */

  btnSave.addEventListener('click', () => {
    const profile = {};
    for (const key of PROFILE_FIELDS) {
      const el = $(key);
      if (el) profile[key] = el.value.trim();
    }
    chrome.storage.sync.set({ profile }, () => {
      showToast('Profile saved!');
      updateMeter();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Clear profile                                                   */
  /* ---------------------------------------------------------------- */

  btnClear.addEventListener('click', () => {
    if (!confirm('Clear all profile data? This cannot be undone.')) return;
    for (const key of PROFILE_FIELDS) {
      const el = $(key);
      if (el) el.value = '';
    }
    chrome.storage.sync.remove('profile', () => {
      showToast('Profile cleared.');
      updateMeter();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Save whitelist                                                  */
  /* ---------------------------------------------------------------- */

  btnSaveWL.addEventListener('click', () => {
    chrome.storage.sync.set({
      whitelist: wlTextarea.value,
      whitelistEnabled: wlEnabled.checked,
    }, () => showToast('Whitelist saved!'));
  });

  /* ---------------------------------------------------------------- */
  /*  Export profile                                                  */
  /* ---------------------------------------------------------------- */

  btnExport.addEventListener('click', () => {
    chrome.storage.sync.get(['profile', 'whitelist', 'whitelistEnabled'], (data) => {
      const exportData = {
        _version: 1,
        _exportedAt: new Date().toISOString(),
        _app: 'AutomationHelper',
        profile: data.profile || {},
        whitelist: data.whitelist || '',
        whitelistEnabled: !!data.whitelistEnabled,
      };

      const blob = new Blob(
        [JSON.stringify(exportData, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `automation-helper-profile-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Profile exported!');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Import profile                                                  */
  /* ---------------------------------------------------------------- */

  btnImport.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);

        // Basic validation
        if (!data._app || data._app !== 'AutomationHelper') {
          showToast('Invalid backup file.', true);
          return;
        }

        // Apply profile
        if (data.profile && typeof data.profile === 'object') {
          for (const key of PROFILE_FIELDS) {
            const el = $(key);
            if (el && data.profile[key]) el.value = data.profile[key];
          }
        }

        // Apply whitelist
        if (typeof data.whitelist === 'string') {
          wlTextarea.value = data.whitelist;
        }
        if (typeof data.whitelistEnabled === 'boolean') {
          wlEnabled.checked = data.whitelistEnabled;
        }

        // Persist
        chrome.storage.sync.set({
          profile: data.profile || {},
          whitelist: data.whitelist || '',
          whitelistEnabled: !!data.whitelistEnabled,
        }, () => {
          showToast('Profile imported!');
          updateMeter();
        });
      } catch (err) {
        showToast('Failed to parse file: ' + err.message, true);
      }
    };
    reader.readAsText(file);
    importFile.value = ''; // reset for re-import
  });

  /* ---------------------------------------------------------------- */
  /*  Usage Statistics                                                */
  /* ---------------------------------------------------------------- */

  const btnClearStats = $('btn-clear-stats');

  function loadStats() {
    chrome.storage.local.get(['stats'], (data) => {
      const s = data.stats || { scans: 0, fills: 0, blocks: 0, totalFields: 0 };
      const el = (id) => $(id);
      if (el('opt-stat-scans'))  el('opt-stat-scans').textContent  = s.scans;
      if (el('opt-stat-fills'))  el('opt-stat-fills').textContent  = s.fills;
      if (el('opt-stat-fields')) el('opt-stat-fields').textContent = s.totalFields;
      if (el('opt-stat-blocks')) el('opt-stat-blocks').textContent = s.blocks;
    });
  }

  loadStats();

  if (btnClearStats) {
    btnClearStats.addEventListener('click', () => {
      if (!confirm('Reset all usage statistics?')) return;
      chrome.storage.local.remove('stats', () => {
        loadStats();
        showToast('Stats reset.');
      });
    });
  }
});
