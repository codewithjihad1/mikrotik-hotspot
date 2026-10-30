# Automatic Hotspot Re-Login (Voucher Recovery)

Automatic re-login after deauthentication (electricity load shedding, router/AP
reboot, brief Wi-Fi drops) using browser-stored credentials — while fully
preserving Mikhmon voucher login, Member login, MAC-Cookie authentication, HTTP
CHAP, and the existing page design.

---

## 1. What was changed

| File | Change |
|---|---|
| `js/credentials.js` | **NEW — shared storage module.** Obfuscated (Base64-wrapped JSON, versioned) records in the browser's `localStorage`: active recovery pair `{u, p, exp, iat, savedAt}`, a *pending* pair stashed at login-submit time, an *auto-attempt marker*, and a *failure cooldown*. Contains no RouterOS `$(…)` variables (external scripts are not template-processed). |
| `js/auto-login.js` | **NEW — login-page module.** Runs the one-shot automatic login through the existing CHAP `sendin` form (`hexMD5("$(chap-id)" + password + "$(chap-challenge)")`), with all safeguards below. PAP fallback only when `$(chap-id)` is absent. |
| `login.html` | Added `HOTSPOT_CHAP = {id, challenge}` constants, `savePending()` stash inside the existing `doLogin()` (plus a `papSubmit()` stash for non-CHAP profiles), the hidden `#autologin-note` element, and the two new script tags. The CHAP handshake and all UI elements are untouched. |
| `status.html` | Loads `js/credentials.js`; on every load (including the periodic meta-refresh): consumes the in-flight attempt marker and calls `syncFromStatus('$(username)', seconds, '$(login-by)')` which converts/refreshes the stored record using `$(session-time-left-secs)`. |
| `logout.html` | Loads `js/credentials.js`; explicit logout calls `clearAll()` (wipes recovery records, attempt marker and cooldown). |
| `css/style.css` | Added `.notice.autologin-warn` (failure styling) and `form.auto-trying` (dims the form while the automatic attempt runs). |
| `error.html`, `alogin.html`, `success.html`, `rlogin.html`, `redirect.html`, `md5.js`, `js/login.js`, `js/mac-detection.js`, the voucher template | **Unchanged.** |

Nothing in MikroTik router configuration, Mikhmon voucher expiration scripts,
`limit-uptime`, or MAC-Cookie settings is required to change.

## 2. How it works

### Capture (status page, every load)

```
seconds = parseInt('$(session-time-left-secs)', 10)
valid  ⇔  isFinite && > 0 && ≤ 366 days
exp = Date.now() + seconds * 1000
```

- A pair stashed on the login page (`pending`, TTL 2 h) whose username matches
  `$(username)` becomes the *active* recovery record with the computed `exp`.
- Otherwise an existing active record with the same username is refreshed with
  the new remaining time (this keeps `exp` accurate while the customer stays
  connected).
- `$(session-time-left-secs)` missing / 0 / unlimited / malformed ⇒ recovery is
  **deleted and disabled** (no invented lifetime). MAC-Cookie (`login-by =
  'mac'`) and trial sessions never store anything.
- The in-flight attempt marker is always consumed here so a *later manual*
  failed login is never misattributed to the automatic flow.

### Recovery (login page)

1. **Failure reconciliation first.** If the page carries `$(error)` and the
   attempt marker is present (this load came from an automatic attempt):
   - invalid / expired-style router error ⇒ `clearAll()`, show the Bengali
     warning, normal form — never retried;
   - anything else (e.g. *"user already logged in"* from a parallel device) ⇒
     90 s cooldown, record kept, Bengali warning shown.
2. Otherwise, if an unexpired record exists and no cooldown is running:
   - skip while the Random-MAC warning is on screen (the attempt starts only
     from the "তারপরও লগইন করব" link — the modem/MAC guide keeps working);
   - pre-check `./status` via XHR: if the router already considers the device
     authenticated (MAC-Cookie login succeeded, parallel tab), do nothing;
   - show **"আপনার অ্যাকাউন্ট যাচাই করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন..."**,
     dim the login form, and submit **once** via the existing CHAP `sendin`
     form. Only one attempt per page load.

### Logout policy

- Load shedding / router reboot: `logout.html` is never served ⇒ recovery data
  survives.
- Explicit "Disconnect from WiFi" ⇒ `logout.html` clears everything.
- Voucher expiry: the router rejects the replay; the expired/invalid error
  branch deletes the record. Expired vouchers can never regain access, because
  the router — not the client — is the authentication authority.

## 3. `session-time-left` semantics (important)

RouterOS `session-time-left` is **remaining online uptime** derived from the
user's `limit-uptime`; it decreases 1:1 with wall-clock time *only while
connected*. For Mikhmon packages (`limit-uptime` = e.g. `1d`, `7d`) the
computation matches the existing "Access expires" display on `status.html`.
Consequences, accepted by design:

- If the customer disconnects early, unused uptime freezes, so the stored `exp`
  is an upper bound and a genuinely expired voucher may trigger one final failed
  automatic attempt before cleanup (handled by the failure branch; no loop —
  invalid/expired errors delete permanently).
- With `shared-users > 1`, uptime is shared across devices — expiry tracks the
  voucher, not one device. This is correct for vouchers.
- Verified behavior exists in the *existing* page already (`status.html`
  "Access expires" row uses the same math), so no new semantic risk is
  introduced.

## 4. Security considerations

Approved as a **temporary client-side fallback** (2026-10-30). Storing anything
CHAP-reusable requires the raw password client-side; a server-side/token design
would need Mikhmon-side changes, and Mikhmon's host is typically down in the
exact outage scenarios this feature targets.

Protections in place:

- Records live only in the customer's own browser (`localStorage`, same origin);
  never in URLs, never in cookies sent over radio, never logged anywhere.
- The voucher/password pair is visible to anyone with access to the *unlocked
  device* (Base64 obfuscation only deters casual inspection — it is not
  encryption). Vouchers should therefore be treated as low-value, user-issued
  credentials, as they already are.
- Data is deleted on: expiry (voucher-derived), router rejection
  (invalid/expired), and explicit logout. Cleared by "clear browsing data".
- Authentication decisions come only from the router (CHAP + MAC-Cookie).
  A MAC address in client-side storage is recorded for diagnosics but is never
  used as an authentication basis.
- Auto-login is gated by cooldowns and single-attempt-per-load guards; no
  captive-portal loops with the router.

## 5. Installation (Mikhmon / RouterOS — file upload only, no config change)

1. Back up the current hotspot directory (Mikhmon → Hotspot Files, or router
   `/hotspot` via FTP/SFTP/WinBox Files). Commit the current files in git
   (`git add -A && git commit`) so rollback is one command.
2. Upload the changed/new files into the router's `hotspot` folder:
   - `js/credentials.js` (new)
   - `js/auto-login.js` (new)
   - `login.html`, `status.html`, `logout.html`, `css/style.css` (updated)
3. **No router or Mikhmon configuration change is needed.** The feature only
   reads existing template variables that are already in use
   (`$(mac)`, `$(error)`, `$(username)`, `$(login-by)`,
   `$(session-time-left-secs)`, `$(link-login-only)`, `$(chap-id)`,
   `$(chap-challenge)`).
4. Hard-refresh a test device (or clear the captive-portal cache) and continue
   with Section 7.

## 6. Rollback

- From git: `git checkout -- login.html status.html logout.html css/style.css`
  and delete `js/credentials.js`, `js/auto-login.js`.
- Or from the backup taken in step 1: restore the four updated files.
- Optionally clear customer-side leftovers: they self-clean (2 h pending TTL /
  record expiry), or a forced logout removes them.

## 7. Test checklist (⚠ do not claim "works" until these pass on the router)

| # | Scenario | Expected |
|---|---|---|
| 1 | New voucher login | Normal behavior unchanged |
| 2 | Successful auth + expiry calculation | `status.html` shows correct "Access expires"; record exists in DevTools local storage with `exp ≈ now + remaining` |
| 3 | Wi-Fi disconnection/reconnection | MAC-Cookie or auto-login reconnects; verifying message appears briefly |
| 4 | Router reboot | Same as 3 |
| 5 | Complete power interruption | Same as 3 after browser reopens portal |
| 6 | Valid MAC-Cookie auth | Login page normally skipped; if opened, pre-check detects the session and auto-login stays silent |
| 7 | MAC-Cookie unavailable, recovery valid | Auto-login submits CHAP and lands on success/status |
| 8 | Expired voucher | One replay attempt max → Bengali expiry warning, record deleted, manual form |
| 9 | Invalid voucher credentials | Manual error path; auto-record (if any) deleted only when the *automatic* attempt is the one rejected |
| 10 | Explicit logout | `logout.html` wipes records; next deauth shows the normal form |
| 11 | Randomized MAC | Warning sheet preserved; attempt only after "তারপরও লগইন করব" |
| 12 | Captive portal browser reopening | Works from the auto-opened portal window; no double/looping attempts |

Offline checks already performed: `node --check` on all JS files; simulated
unit tests covering the storage module (convert/refresh/expire/unlimited/trial/
mac/mismatch/marker/cooldown/clearAll) and the auto-login decision branches
(invalid, expired, ambiguous-failure cooldown, manual-error, no-creds, random
MAC, already-authenticated pre-check, PAP fallback).
