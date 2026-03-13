/**
 * safetyChecks.js — Safety scanning module
 * 
 * Scans the current page for sensitive/protected elements that must
 * block automation: CAPTCHAs, password fields, payment inputs,
 * authentication forms.  Returns a structured report so the caller
 * can decide whether to proceed.
 */

// eslint-disable-next-line no-var
var SafetyChecks = (() => {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  Selector lists for each threat category                           */
  /* ------------------------------------------------------------------ */

  const CAPTCHA_SELECTORS = [
    '.g-recaptcha',
    '.h-captcha',
    '[data-sitekey]',
    'iframe[src*="captcha"]',
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    'iframe[src*="turnstile"]',
    '#captcha',
    '.captcha',
    '[id*="captcha"]',
    '[class*="captcha"]',
  ];

  const PASSWORD_SELECTORS = [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
  ];

  const PAYMENT_SELECTORS = [
    'input[name*="card"]',
    'input[name*="credit"]',
    'input[name*="debit"]',
    'input[name*="cvv"]',
    'input[name*="cvc"]',
    'input[name*="expir"]',
    'input[autocomplete="cc-number"]',
    'input[autocomplete="cc-exp"]',
    'input[autocomplete="cc-csc"]',
    'input[autocomplete="cc-name"]',
    'input[autocomplete="cc-type"]',
    '[data-braintree-id]',
    'iframe[src*="stripe"]',
    'iframe[src*="paypal"]',
    'iframe[src*="braintree"]',
    'iframe[src*="checkout"]',
    '.StripeElement',
    '#card-element',
    '[class*="payment"]',
  ];

  const AUTH_SELECTORS = [
    'form[action*="login"]',
    'form[action*="signin"]',
    'form[action*="sign-in"]',
    'form[action*="authenticate"]',
    'form[action*="auth"]',
    'form[id*="login"]',
    'form[id*="signin"]',
    '[data-testid*="login"]',
    '[data-testid*="signin"]',
  ];

  /* ------------------------------------------------------------------ */
  /*  Helper: query the DOM for any matching selector in a list         */
  /* ------------------------------------------------------------------ */

  function _findMatches(selectorList) {
    const matches = [];
    for (const sel of selectorList) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          matches.push({ selector: sel, count: els.length });
        }
      } catch {
        // invalid selector — skip silently
      }
    }
    return matches;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Run a full safety scan on the current page.
   *
   * @returns {{
   *   safe: boolean,
   *   threats: Array<{category: string, selector: string, count: number}>,
   *   reasons: string[],
   *   summary: string
   * }}
   */
  function scanPage() {
    const threats = [];
    const reasons = [];

    const categories = [
      { name: 'CAPTCHA',         selectors: CAPTCHA_SELECTORS },
      { name: 'Password',        selectors: PASSWORD_SELECTORS },
      { name: 'Payment/Card',    selectors: PAYMENT_SELECTORS },
      { name: 'Authentication',  selectors: AUTH_SELECTORS },
    ];

    for (const cat of categories) {
      const matches = _findMatches(cat.selectors);
      if (matches.length > 0) {
        reasons.push(`${cat.name} element(s) detected`);
        for (const m of matches) {
          threats.push({
            category: cat.name,
            selector: m.selector,
            count: m.count,
          });
        }
      }
    }

    const safe = threats.length === 0;
    const summary = safe
      ? 'Page is safe for automation.'
      : `Blocked: ${reasons.join('; ')}.`;

    return { safe, threats, reasons, summary };
  }

  /**
   * Quick boolean check — is the page safe?
   */
  function isSafe() {
    return scanPage().safe;
  }

  return { scanPage, isSafe };
})();
