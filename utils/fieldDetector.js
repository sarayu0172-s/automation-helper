/**
 * fieldDetector.js — Intelligent form-field detection
 *
 * Inspects every visible <input>, <textarea>, and <select> on the page,
 * then infers which profile field (name, email, phone, …) each one
 * corresponds to.  Detection uses multiple signals: name, id,
 * placeholder, aria-label, associated <label>, and autocomplete.
 */

// eslint-disable-next-line no-var
var FieldDetector = (() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Keyword → profile-field mapping                                   */
  /*  Order matters: first match wins.                                  */
  /* ------------------------------------------------------------------ */

  const FIELD_RULES = [
    {
      type: 'email',
      keywords: ['email', 'e-mail', 'emailaddress', 'email_address'],
      autocomplete: ['email'],
    },
    {
      type: 'phone',
      keywords: ['phone', 'tel', 'mobile', 'cell', 'fax', 'telephone', 'phone_number', 'phonenumber'],
      autocomplete: ['tel', 'tel-national'],
    },
    {
      type: 'firstName',
      keywords: ['firstname', 'first_name', 'first-name', 'fname', 'given-name', 'givenname'],
      autocomplete: ['given-name'],
    },
    {
      type: 'lastName',
      keywords: ['lastname', 'last_name', 'last-name', 'lname', 'surname', 'family-name', 'familyname'],
      autocomplete: ['family-name'],
    },
    {
      type: 'fullName',
      keywords: ['fullname', 'full_name', 'full-name', 'name', 'your_name', 'your-name', 'yourname', 'displayname'],
      autocomplete: ['name'],
    },
    {
      type: 'company',
      keywords: ['company', 'organization', 'org', 'employer', 'business', 'company_name', 'companyname'],
      autocomplete: ['organization'],
    },
    {
      type: 'address',
      keywords: ['address', 'street', 'address1', 'address-line1', 'streetaddress', 'street_address', 'addr'],
      autocomplete: ['address-line1', 'street-address'],
    },
    {
      type: 'city',
      keywords: ['city', 'town', 'locality', 'address-level2'],
      autocomplete: ['address-level2'],
    },
    {
      type: 'state',
      keywords: ['state', 'province', 'region', 'address-level1'],
      autocomplete: ['address-level1'],
    },
    {
      type: 'zip',
      keywords: ['zip', 'zipcode', 'zip_code', 'postal', 'postalcode', 'postal_code', 'postcode'],
      autocomplete: ['postal-code'],
    },
    {
      type: 'country',
      keywords: ['country', 'country_code', 'countrycode'],
      autocomplete: ['country', 'country-name'],
    },
  ];

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */

  /** Gather every text signal from a form element. */
  function _getSignals(el) {
    const signals = [];
    const push = (v) => { if (v) signals.push(v.trim().toLowerCase()); };

    push(el.getAttribute('name'));
    push(el.getAttribute('id'));
    push(el.getAttribute('placeholder'));
    push(el.getAttribute('aria-label'));
    push(el.getAttribute('autocomplete'));
    push(el.getAttribute('data-field'));
    push(el.getAttribute('data-type'));

    // Associated <label>
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) push(label.textContent);
    }
    // Parent label
    const parentLabel = el.closest('label');
    if (parentLabel) push(parentLabel.textContent);

    return signals;
  }

  /** Check whether any signal contains one of the keywords. */
  function _matchesRule(signals, rule) {
    // Autocomplete exact match (highest confidence)
    const ac = signals.find(s => rule.autocomplete.includes(s));
    if (ac) return { confidence: 1.0, via: 'autocomplete' };

    // Keyword substring match
    for (const signal of signals) {
      const normalised = signal.replace(/[\s\-_]/g, '').toLowerCase();
      for (const kw of rule.keywords) {
        if (normalised.includes(kw)) {
          return { confidence: 0.8, via: 'keyword' };
        }
      }
    }
    return null;
  }

  /** Is the element visible and interactable? */
  function _isVisible(el) {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    if (el.disabled || el.readOnly) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /** Skip sensitive input types */
  function _isSafe(el) {
    const dangerTypes = ['password', 'hidden', 'file', 'image', 'submit', 'reset', 'button'];
    return !dangerTypes.includes((el.type || '').toLowerCase());
  }

  /** Input type → field type fallback (lowest confidence) */
  const TYPE_FALLBACKS = {
    'email': 'email',
    'tel':   'phone',
    'url':   null,    // no profile mapping — skip
  };

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Scan the page and return every detected form field with its
   * inferred profile-field type.
   *
   * @returns {Array<{
   *   element: HTMLElement,
   *   fieldType: string,
   *   confidence: number,
   *   via: string,
   *   tagName: string,
   *   currentValue: string,
   *   rect: {top: number, left: number, width: number, height: number}
   * }>}
   */
  function detectFields() {
    const inputs = document.querySelectorAll(
      'input, textarea, select'
    );

    const detected = [];

    for (const el of inputs) {
      if (!_isVisible(el) || !_isSafe(el)) continue;

      const signals = _getSignals(el);
      let bestMatch = null;

      // Try rule-based matching first
      for (const rule of FIELD_RULES) {
        const result = _matchesRule(signals, rule);
        if (result && (!bestMatch || result.confidence > bestMatch.confidence)) {
          bestMatch = { fieldType: rule.type, ...result };
        }
      }

      // Fallback: use input type attribute
      if (!bestMatch) {
        const inputType = (el.type || '').toLowerCase();
        const fallback = TYPE_FALLBACKS[inputType];
        if (fallback) {
          bestMatch = { fieldType: fallback, confidence: 0.5, via: 'input-type' };
        }
      }

      if (bestMatch) {
        const rect = el.getBoundingClientRect();
        detected.push({
          element: el,
          fieldType: bestMatch.fieldType,
          confidence: bestMatch.confidence,
          via: bestMatch.via,
          tagName: el.tagName.toLowerCase(),
          currentValue: el.value || '',
          rect: {
            top: Math.round(rect.top + window.scrollY),
            left: Math.round(rect.left + window.scrollX),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    }

    return detected;
  }

  /**
   * Return a simple count-by-type summary for the popup.
   */
  function getSummary() {
    const fields = detectFields();
    const counts = {};
    for (const f of fields) {
      counts[f.fieldType] = (counts[f.fieldType] || 0) + 1;
    }
    return { total: fields.length, counts };
  }

  /**
   * Return the total count of ALL form inputs on the page
   * (including ones that weren't matched to a profile field).
   */
  function countAllInputs() {
    const all = document.querySelectorAll('input, textarea, select');
    let count = 0;
    for (const el of all) {
      if (_isVisible(el) && _isSafe(el)) count++;
    }
    return count;
  }

  return { detectFields, getSummary, countAllInputs };
})();
