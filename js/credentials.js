/* =====================================================================
   Hotspot automatic re-login — credential storage module
   Shared by: login.html (js/auto-login.js), status.html, logout.html

   SECURITY NOTICE (temporary client-side fallback, user-approved):
   - The voucher username/password is stored ONLY in this browser's
     localStorage, obfuscated with a Base64 wrapper. Obfuscation is NOT
     encryption: anyone with access to the unlocked device can decode it.
   - The credentials are never placed in URLs and never logged.
   - Lifetime mirrors the voucher's remaining uptime reported by the
     router ($(session-time-left-secs)); unlimited / unknown lifetimes
     DISABLE recovery entirely (no invented, arbitrary lifetime).
   - Records are deleted when: expired, the router rejects the voucher,
     or the customer logs out explicitly.
   - Authentication is always decided by the router via the existing
     HTTP-CHAP handshake; a MAC address is never used to authenticate.

   NOTE: this is a plain external script, so it must never contain
   RouterOS template variables ($(…)) — those are only substituted in
   inline scripts. Page-specific values are passed in as arguments.
   ===================================================================== */
window.HSReLogin = (function () {
    'use strict';

    var VERSION = 1;
    var PREFIX = 'HSRL' + VERSION + ':';

    // localStorage keys
    var K_ACTIVE = 'hsReLogin.active'; // {u, p, exp, iat, savedAt} valid recovery pair
    var K_PENDING = 'hsReLogin.pending'; // {u, p, mac, t} stashed at login submit, converted on the status page
    var K_MARKER = 'hsReLogin.marker'; // {u, t} "an automatic attempt is in flight"
    var K_COOLDOWN = 'hsReLogin.cooldown'; // unix ms until which automatic login is paused

    // Sanity limits
    var MAX_TTL_MS = 366 * 24 * 3600 * 1000; // implausibly large session-time-left => treat as invalid
    var PENDING_TTL_MS = 2 * 3600 * 1000; // pending stash lifetime (normally converted within seconds)
    var MARKER_TTL_MS = 3 * 60 * 1000; // stale attempt markers are ignored
    var COOLDOWN_MS = 90 * 1000; // pause after an ambiguous automatic-login failure

    /* ---------- low-level helpers (never throw into the UI) ---------- */

    function enc(obj) {
        try {
            return PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
        } catch (e) {
            return '';
        }
    }

    function dec(raw) {
        var str = String(raw || '');
        if (str.indexOf(PREFIX) !== 0) return null;
        try {
            var obj = JSON.parse(decodeURIComponent(escape(atob(str.slice(PREFIX.length)))));
            return obj && typeof obj === 'object' ? obj : null;
        } catch (e) {
            return null;
        }
    }

    function lsGet(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function lsSet(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            /* private mode / storage disabled: automatic re-login silently off */
        }
    }

    function lsDel(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (e) {
            /* ignore */
        }
    }

    function isValidActiveRecord(r) {
        return !!(
            r &&
            r.v === VERSION &&
            typeof r.u === 'string' &&
            r.u.length > 0 &&
            typeof r.p === 'string' &&
            r.p.length > 0 &&
            typeof r.exp === 'number' &&
            isFinite(r.exp) &&
            r.exp <= Date.now() + MAX_TTL_MS
        );
    }

    function currentMac() {
        // set inline on login.html via $(mac); harmless if undefined elsewhere
        return typeof window.CLIENT_MAC !== 'undefined' ? window.CLIENT_MAC : '';
    }

    /* -------------------------- public API -------------------------- */

    return {
        /**
         * Called at the moment of a successful submit on the login page
         * (manual voucher or member login, automatic re-login does not
         * need to re-stash because the active record is refreshed later).
         */
        savePending: function (username, password) {
            username = String(username || '').trim();
            if (!username || typeof password !== 'string' || !password) return false;
            lsSet(
                K_PENDING,
                enc({
                    v: VERSION,
                    u: username,
                    p: password,
                    mac: currentMac(),
                    t: Date.now(),
                }),
            );
            return true;
        },

        /**
         * Called on status.html for every (re)load.
         * Converts a pending stash into an active record, or refreshes the
         * expiry of the matching active record, using the router-supplied
         * remaining session time. Unlimited / invalid / implausible
         * remaining time disables and deletes recovery data.
         *
         * @returns true when an active record exists afterwards.
         */
        syncFromStatus: function (username, remainingSecs, loginBy) {
            username = String(username || '').trim();
            loginBy = String(loginBy || '').trim().toLowerCase();

            if (!username) return false;

            // MAC-cookie and trial sessions carry no customer credential pair.
            // Touch nothing in those cases.
            if (loginBy === 'mac' || loginBy === 'trial') return false;

            var secs = parseInt(remainingSecs, 10);
            if (!(secs > 0) || secs * 1000 > MAX_TTL_MS) {
                // No usable lifetime from the router (unlimited voucher,
                // missing substitution or malformed value): recovery cannot
                // be given a credential lifetime, so it is disabled.
                this.clear();
                return false;
            }

            var exp = Date.now() + secs * 1000;

            var pend = dec(lsGet(K_PENDING));
            if (
                pend &&
                pend.v === VERSION &&
                pend.u === username &&
                typeof pend.p === 'string' &&
                pend.p.length > 0 &&
                Date.now() - (pend.t || 0) <= PENDING_TTL_MS
            ) {
                // The customer just logged in with these credentials.
                lsSet(
                    K_ACTIVE,
                    enc({
                        v: VERSION,
                        u: username,
                        p: pend.p,
                        exp: exp,
                        iat: Date.now(),
                        savedAt: Date.now(),
                    }),
                );
                lsDel(K_PENDING);
                return true;
            }

            var act = dec(lsGet(K_ACTIVE));
            if (act && act.v === VERSION && act.u === username && typeof act.p === 'string') {
                // Page refresh / periodic status reload: keep the pair,
                // re-sync the expiry to the router's remaining time.
                act.exp = exp;
                act.savedAt = Date.now();
                lsSet(K_ACTIVE, enc(act));
                return true;
            }

            // Mismatched or stale pending stash: drop it. An old active
            // record for a different username is left to expire naturally —
            // the router remains the authority if it is ever replayed.
            lsDel(K_PENDING);
            return false;
        },

        /**
         * Returns { u, p, exp } when an unexpired record exists,
         * otherwise deletes the record and returns null.
         */
        load: function () {
            var r = dec(lsGet(K_ACTIVE));
            if (!isValidActiveRecord(r)) {
                lsDel(K_ACTIVE);
                return null;
            }
            if (Date.now() >= r.exp) {
                lsDel(K_ACTIVE);
                return null;
            }
            return { u: r.u, p: r.p, exp: r.exp };
        },

        /** Deletes active + pending records (but not the attempt marker). */
        clear: function () {
            lsDel(K_ACTIVE);
            lsDel(K_PENDING);
        },

        /** Explicit customer logout: erase everything, including state. */
        clearAll: function () {
            lsDel(K_ACTIVE);
            lsDel(K_PENDING);
            lsDel(K_MARKER);
            lsDel(K_COOLDOWN);
        },

        /** Record that an automatic login attempt is being submitted. */
        markAttempt: function (username) {
            lsSet(K_MARKER, enc({ v: VERSION, u: String(username || ''), t: Date.now() }));
        },

        /**
         * Returns-and-clears the attempt marker. Returns null when the
         * marker is missing, stale (older than MARKER_TTL_MS), or
         * unreadable.
         */
        takeAttemptMarker: function () {
            var r = dec(lsGet(K_MARKER));
            lsDel(K_MARKER);
            if (!r || typeof r.t !== 'number' || !isFinite(r.t)) return null;
            if (Date.now() - r.t > MARKER_TTL_MS) return null; // stale marker
            return r;
        },

        /** Convenience alias used by status.html after a successful login. */
        consumeAttemptMarker: function () {
            return this.takeAttemptMarker();
        },

        /** Pause automatic attempts for COOLDOWN_MS after an odd failure. */
        setCooldown: function () {
            lsSet(K_COOLDOWN, String(Date.now() + COOLDOWN_MS));
        },

        cooldownActive: function () {
            var until = parseFloat(lsGet(K_COOLDOWN));
            if (!until || Date.now() >= until) {
                if (until) lsDel(K_COOLDOWN);
                return false;
            }
            return true;
        },
    };
})();
