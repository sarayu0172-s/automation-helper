/**
 * autofillEngine.js — Autofill orchestrator
 *
 * Takes detected fields + user profile, fills only empty safe fields,
 * fires native input/change events so frameworks pick up the changes,
 * and highlights filled fields.  Never submits forms.
 */

// eslint-disable-next-line no-var
var AutofillEngine = (() => {
  'use strict';

  const HIGHLIGHT_CLASS = 'ah-filled-highlight';
  const HIGHLIGHT_DURATION_MS = 3000;

  /* ------------------------------------------------------------------ */
  /*  Profile field → detected fieldType mapping                        */
  /* ------------------------------------------------------------------ */

  function _buildValueMap(profile) {
    const map = {};
    if (profile.fullName)  map.fullName  = profile.fullName;
    if (profile.firstName) map.firstName = profile.firstName;
    if (profile.lastName)  map.lastName  = profile.lastName;
    // If only fullName is stored, derive first/last
    if (profile.fullName && !profile.firstName) {
      const parts = profile.fullName.trim().split(/\s+/);
      map.firstName = parts[0] || '';
      map.lastName  = parts.slice(1).join(' ') || '';
    }
    if (profile.email)    map.email   = profile.email;
    if (profile.phone)    map.phone   = profile.phone;
    if (profile.company)  map.company = profile.company;
    if (profile.address)  map.address = profile.address;
    if (profile.city)     map.city    = profile.city;
    if (profile.state)    map.state   = profile.state;
    if (profile.zip)      map.zip     = profile.zip;
    if (profile.country)  map.country = profile.country;
    return map;
  }

  /* ------------------------------------------------------------------ */
  /*  Simulate realistic user input                                     */
  /* ------------------------------------------------------------------ */

  function _setNativeValue(el, value) {
    // Use the native setter so React/Vue state updates
    const proto = Object.getPrototypeOf(el);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
                      || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    // Fire events in the order a real user would produce
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /* ------------------------------------------------------------------ */
  /*  Visual feedback                                                   */
  /* ------------------------------------------------------------------ */

  function _injectHighlightCSS() {
    if (document.getElementById('ah-highlight-style')) return;
    const style = document.createElement('style');
    style.id = 'ah-highlight-style';
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 2px solid #22c55e !important;
        outline-offset: 1px;
        background-color: rgba(34, 197, 94, 0.06) !important;
        transition: outline-color 0.3s ease, background-color 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }

  function _highlightField(el) {
    el.classList.add(HIGHLIGHT_CLASS);
    setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Fill detected fields with profile data.
   *
   * @param {Array}  detectedFields — output of FieldDetector.detectFields()
   * @param {Object} profile        — user profile from chrome.storage
   * @param {Object} [options]
   * @param {boolean} options.overwrite — fill even if field already has a value
   * @param {boolean} options.highlight — flash green outline on filled fields
   * @returns {{filled: number, skipped: number, details: Array}}
   */
  function fill(detectedFields, profile, options = {}) {
    const { overwrite = false, highlight = true } = options;
    const valueMap = _buildValueMap(profile);

    if (highlight) _injectHighlightCSS();

    const details = [];
    let filled = 0;
    let skipped = 0;

    for (const field of detectedFields) {
      const value = valueMap[field.fieldType];

      if (!value) {
        skipped++;
        details.push({ fieldType: field.fieldType, status: 'no-data' });
        continue;
      }

      // Skip non-empty fields unless overwrite is on
      if (field.currentValue && !overwrite) {
        skipped++;
        details.push({ fieldType: field.fieldType, status: 'already-filled' });
        continue;
      }

      _setNativeValue(field.element, value);

      if (highlight) _highlightField(field.element);

      filled++;
      details.push({ fieldType: field.fieldType, status: 'filled', value });
    }

    return { filled, skipped, details };
  }

  /**
   * Remove all highlight classes from the page.
   */
  function clearHighlights() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)
      .forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
  }

  /**
   * Build a preview of what WOULD be filled without actually doing it.
   */
  function preview(detectedFields, profile) {
    const valueMap = _buildValueMap(profile);
    return detectedFields.map(f => ({
      fieldType: f.fieldType,
      wouldFill: valueMap[f.fieldType] || null,
      currentValue: f.currentValue,
      isEmpty: !f.currentValue,
    }));
  }

  return { fill, clearHighlights, preview };
})();
