# Automation Helper — Chrome Extension

A safe, privacy-first Chrome extension that autofills web forms using your locally stored profile data. It **refuses** to operate on pages containing CAPTCHAs, password fields, payment inputs, or authentication forms.

---

## Features

- **Smart field detection** — infers field types from name, id, placeholder, aria-label, autocomplete, and label text
- **Safety-first** — scans for CAPTCHAs, passwords, payment fields, and auth forms before touching anything
- **Preview before fill** — see exactly what will be filled before committing
- **Field highlighting** — green outline animation on filled fields
- **Badge notifications** — extension icon shows detected field count or warning indicators
- **Domain whitelist** — restrict automation to specific trusted domains
- **Context menu** — right-click to scan or autofill without opening the popup
- **Keyboard shortcuts** — Alt+S / Alt+F / Alt+X for power users
- **Export / Import** — backup and restore your profile as JSON
- **Profile meter** — visual completeness indicator on the settings page
- **Activity log** — scrollable log viewer in the popup for debugging

---

## Project Structure

```
automation-helper/
├── manifest.json              Manifest V3 configuration
├── background.js              Service worker (shortcuts, badge, context menu)
├── content.js                 Content script (message bridge + logging)
├── popup.html / .js / .css    Popup UI
├── options.html / .js / .css  Settings page (profile, whitelist, export/import)
├── utils/
│   ├── safetyChecks.js        Detects CAPTCHAs, passwords, payments, auth forms
│   ├── fieldDetector.js       Infers field types from 6+ DOM signals
│   └── autofillEngine.js      Fills fields, fires events, highlights
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── test/
    ├── test-form.html         All form types (safe + blocked)
    └── safe-form.html         Safe-only form for testing autofill
```

---

## Installation

1. Download and unzip the project
2. Open Chrome → navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** → select the `automation-helper/` folder
5. The extension icon appears in your toolbar — pin it for easy access

---

## Setup

1. Click the extension icon → **Profile Settings** (or right-click → Options)
2. Fill in your details: name, email, phone, company, address, city, state, zip, country
3. Click **Save Profile**
4. Watch the completeness meter fill up as you add more data

Your data is stored locally via `chrome.storage.sync` and never leaves your browser.

---

## Usage

### Popup Flow

1. Navigate to any webpage with forms
2. Click the extension icon to open the popup
3. **Scan Page** — checks safety, then detects fillable fields
4. **Preview** — shows what each field will receive before filling
5. **Autofill** — fills empty safe fields with your profile data
6. **Stop** — clears highlights and resets state

### Keyboard Shortcuts

| Shortcut | Action          |
|----------|-----------------|
| Alt+S    | Scan page       |
| Alt+F    | Autofill fields |
| Alt+X    | Stop automation |

Customise at `chrome://extensions/shortcuts`.

### Context Menu

Right-click on any webpage to access **Scan Page for Forms** and **Autofill Detected Fields** directly.

### Badge Icon

The extension icon badge shows:
- **Green number** — count of detected fields or filled fields
- **Red `!`** — page blocked (CAPTCHA, password, or payment detected)

---

## Safety System

The extension scans for and **blocks automation** if any of these are detected:

| Threat          | Selectors detected                                           |
|-----------------|--------------------------------------------------------------|
| CAPTCHA         | `.g-recaptcha`, `.h-captcha`, `iframe[src*="captcha"]`, etc. |
| Password        | `input[type="password"]`, `autocomplete="*-password"`        |
| Payment / Card  | `input[name*="card"]`, `autocomplete="cc-*"`, Stripe, etc.  |
| Authentication  | `form[action*="login"]`, `form[id*="signin"]`, etc.          |

When blocked, the status bar turns red with a clear explanation of what was found.

---

## Domain Whitelist

1. Open **Profile Settings** → Domain Whitelist section
2. Check **Enable domain whitelist**
3. Add one domain per line (e.g., `example.com`, `forms.google.com`)
4. Click **Save Whitelist**

When enabled, scanning and autofill are skipped on domains not in the list.

---

## Export / Import

- **Export**: Settings page → click **Export Profile** → saves a `.json` file
- **Import**: Click **Import Profile** → select a previously exported `.json` file

The backup includes your profile data, whitelist, and whitelist-enabled state.

---

## Testing

### Safe-only form (happy path)

Open `test/safe-form.html` in Chrome. This page has only contact and address fields — no blockers. Scan → Preview → Autofill should work smoothly.

### Full test page (safety verification)

Open `test/test-form.html` in Chrome. This page has four forms:

1. **Contact form** (safe) — should detect and fill
2. **Login form** (password) — should trigger a safety block
3. **Payment form** (credit card) — should trigger a safety block
4. **CAPTCHA form** (reCAPTCHA) — should trigger a safety block

Note: Because the safety scanner checks the entire page, having any blocked element present will block automation for the whole page. This is by design — it's the conservative, safe approach.

---

## Architecture

| Principle              | Implementation                                                |
|------------------------|---------------------------------------------------------------|
| Manifest V3            | Service worker, no persistent background page                 |
| Modular utilities      | Each concern (safety, detection, filling) is a separate IIFE  |
| Event-driven messaging | `chrome.runtime.sendMessage` between popup - content scripts  |
| Zero dependencies      | Vanilla JS, async/await, no frameworks or libraries           |
| Secure storage         | `chrome.storage.sync` for profile — syncs across devices      |
| Never submits forms    | Only fills fields and fires input/change events               |
| Privacy-first          | No analytics, no external calls, no data leaves the browser   |

---

## License

`MIT`
