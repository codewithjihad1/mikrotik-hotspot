/* =====================================================================
   Automatic hotspot re-login (voucher recovery) — login page module
   Requires js/credentials.js (window.HSReLogin); uses the EXISTING
   CHAP handshake in login.html (document.sendin + hexMD5) unchanged.

   Flow on login.html:
     1. If RouterOS re-rendered the page with $(error) after an automatic
        attempt (attempt marker present) => classify the error:
          - invalid / expired credentials => DELETE stored credentials,
            show a Bengali warning, keep the normal form (no retry).
          - other errors => 90 s cooldown, keep credentials, show warning.
     2. Otherwise, if unexpired credentials exist and no cooldown is
        running:
          - skip while the Random-MAC warning view is active (it is
            triggered from the "তারপরও লগইন করব" link instead);
          - pre-check ./status with XHR: if the router already considers
            us authenticated (e.g. MAC-cookie login succeeded first),
            do nothing;
          - show the Bengali "verifying" notice, dim the form, submit
            the stored pair ONCE through the existing CHAP sendin form
            (PAP fallback only when chap-id is absent).
     3. Only one attempt per page load; runaway loops are impossible
        because every subsequent page is either the status chain or a
        login page handled by (1) / the cooldown.
   ===================================================================== */
(function () {
    'use strict';

    if (!window.HSReLogin) return; // storage module missing: do nothing
    if (window.__hsAutoLoginLoaded) return;
    window.__hsAutoLoginLoaded = true;

    /* ---------------- page probes (template-provided) ---------------- */

    var CLIENT_MAC_GUESS =
        typeof window.CLIENT_MAC !== 'undefined' ? String(window.CLIENT_MAC) : '';

    function randomMacActive() {
        var html = document.documentElement;
        if (!html || !html.className) return false;
        return html.className.indexOf('random-mac') !== -1;
    }

    /* Raw router error text from the $(error) notice inside #main. */
    function getRouterError() {
        if (!document.querySelectorAll) return '';
        var notes = document.querySelectorAll('#main .notice');
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id !== 'autologin-note') {
                return String((notes[i].textContent || notes[i].innerText || '')).trim();
            }
        }
        return '';
    }

    /* ---------------------- Bengali UI messages ---------------------- */

    var MSG_VERIFY =
        'আপনার অ্যাকাউন্ট যাচাই করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...';
    var MSG_FAIL_DEAD =
        'স্বয়ংক্রিয় লগইন ব্যর্থ হয়েছে — ভাউচারটির সময় শেষ হয়ে গেছে বা তথ্য ভুল। নতুন ভাউচার কোড দিয়ে লগইন করুন।';
    var MSG_FAIL_OTHER =
        'স্বয়ংক্রিয় লগইন ব্যর্থ হয়েছে। অনুগ্রহ করে নিজের ভাউচার কোড বসিয়ে লগইন করুন।';

    /* --------------------------- UI helpers --------------------------- */

    var noteEl = document.getElementById('autologin-note');
    var loginForm = document.forms.login || (document.login ? document.login : null);

    function showNote(text, warning) {
        if (!noteEl) return;
        noteEl.textContent = text;
        noteEl.className = warning ? 'notice autologin-warn' : 'notice';
        noteEl.style.display = 'block';
    }

    function hideNote() {
        if (noteEl) noteEl.style.display = 'none';
    }

    function dimForm(on) {
        if (!loginForm) return;
        if (on) loginForm.className = 'auto-trying';
        else loginForm.className = loginForm.className.replace(/\s*\bauto-trying\b/g, '');
    }

    /* ------------------------ failure handling ------------------------ */

    function classifyError(text) {
        var t = String(text || '').toLowerCase();
        if (/expir|time\s*limit|limit[\s-]*uptime|session\s*limit|exceeded|no\s*time/.test(t)) {
            return 'expired';
        }
        if (/invalid|wrong|incorrect|bad\s*pass|not\s*found|no\s*such|unknown\s*user/.test(t)) {
            return 'invalid';
        }
        return 'other';
    }

    /* ------------------------- state pre-check ------------------------ */

    /**
     * True when the router already considers this device authenticated
     * (MAC-cookie login worked, or a parallel tab logged in). Detecting
     * it prevents re-logging with the stored voucher while the customer
     * may actually want to switch vouchers from an authenticated state.
     */
    function checkLoggedIn(callback) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', './status', true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                var url = '';
                try {
                    url = String(xhr.responseURL || '');
                } catch (e) {}
                // authenticated: request ended on /status
                // not authenticated: redirected back to /login
                callback(url.indexOf('/status') !== -1 && url.indexOf('/login') === -1);
            };
            xhr.ontimeout = function () {
                callback(false);
            };
            xhr.onerror = function () {
                callback(false);
            };
            try {
                xhr.timeout = 5000;
            } catch (e) {
                /* very old browsers: no timeout support, proceed anyway */
            }
            xhr.send(null);
        } catch (e) {
            callback(false);
        }
    }

    /* --------------------------- submission --------------------------- */

    function submitWithCredentials(rec) {
        if (!loginForm) return; // give up: never navigate away pointlessly

        var chap =
            typeof window.HOTSPOT_CHAP === 'object' && window.HOTSPOT_CHAP
                ? window.HOTSPOT_CHAP
                : null;
        var sendin = document.forms.sendin || document.sendin;

        try {
            if (chap && chap.id && chap.challenge && sendin && window.hexMD5) {
                // Existing HTTP-CHAP flow: hash = md5(chap-id + password + chap-challenge).
                // The raw password never reaches the network.
                sendin.username.value = rec.u;
                sendin.password.value = window.hexMD5(chap.id + rec.p + chap.challenge);
                showNote(MSG_VERIFY, false);
                sendin.submit();
                return;
            }

            // PAP fallback (profile without CHAP): plain POST of the login
            // form, credentials stashed the same way as manual logins.
            loginForm.username.value = rec.u;
            loginForm.password.value = rec.p;
            loginForm.submit();
        } catch (e) {
            // Submission failed locally: restore the normal form immediately.
            dimForm(false);
            showNote(MSG_FAIL_OTHER, true);
        }
    }

    /* -------------------------- main routine -------------------------- */

    var attempting = false; // hard guard: one attempt per page load

    function maybeAttempt() {
        if (attempting || !window.HSReLogin || window.__hsAutoLoginDone) return;

        var rec = window.HSReLogin.load();
        if (!rec) return; // nothing stored, or it just expired and was deleted

        if (window.HSReLogin.cooldownActive()) return; // recent odd failure: stay manual

        attempting = true;
        window.__hsAutoLoginDone = true;

        showNote(MSG_VERIFY, false);

        checkLoggedIn(function (isLoggedIn) {
            if (isLoggedIn) {
                // Router already has us in (MAC cookie). Cancel the marker
                // and let the customer browse or switch vouchers manually.
                window.HSReLogin.consumeAttemptMarker();
                attempting = false;
                dimForm(false);
                hideNote();
                return;
            }
            window.HSReLogin.markAttempt(rec.u);
            dimForm(true);
            submitWithCredentials(rec);
        });
    }

    /* ---------------------------- boot order --------------------------- */

    (function init() {
        // 1) Reconcile a previous automatic attempt against $(error).
        var routerError = getRouterError();
        if (routerError) {
            var marker = window.HSReLogin.takeAttemptMarker();
            if (marker) {
                // This failure is OUR automatic attempt's outcome.
                var kind = classifyError(routerError);
                if (kind === 'invalid' || kind === 'expired') {
                    // Invalid credentials or an exhausted voucher:
                    // permanently erase and never auto-retry.
                    window.HSReLogin.clearAll();
                    showNote(MSG_FAIL_DEAD, true);
                    return;
                }
                // Ambiguous failure (e.g. "user already active" from a
                // parallel device): keep credentials, pause attempts.
                window.HSReLogin.setCooldown();
                showNote(MSG_FAIL_OTHER, true);
                return;
            }
            // A manual attempt failed; the normal form + $(error) already
            // explain it. Automatic recovery may still be valid below.
        }

        // 2) Random-MAC warning is on screen: do not fight it. The attempt
        //    starts if the customer chooses "তারপরও লগইন করব".
        if (randomMacActive()) {
            var skip = document.getElementById('skipmac');
            if (skip) {
                var previous = skip.onclick; // set by js/login.js
                skip.onclick = function (ev) {
                    if (typeof previous === 'function') previous.call(skip, ev);
                    maybeAttempt();
                };
            }
            return;
        }

        // 3) Normal case: try automatic re-login once.
        maybeAttempt();
    })();
})();
