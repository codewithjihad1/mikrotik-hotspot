/* ==========================================================
           Wi-Fi Privacy / Random MAC detection
           MikroTik fills $(mac) with the client MAC address.
           A randomized ("private") MAC always has the locally
           administered bit (0x02) set in its first octet, so the
           2nd hex digit is one of 2, 6, A or E  ->  x2:, x6:, xA:, xE:
           ========================================================== */
var CLIENT_MAC = '$(mac)';
// var CLIENT_MAC = 'aa:06:81:83:d6:35';

function isRandomMac(mac) {
    if (!mac) return false;
    var hex = String(mac).replace(/[^0-9a-fA-F]/g, '');
    if (hex.length < 12) return false;
    var first = parseInt(hex.substr(0, 2), 16);
    if (isNaN(first)) return false;
    if (first & 0x01) return false; // multicast - not a real client MAC
    return (first & 0x02) === 0x02; // locally administered = randomized
}

/* Applied on <html> before paint so the login form never flashes */
if (isRandomMac(CLIENT_MAC) && document.cookie.indexOf('skipmac=1') === -1) {
    document.documentElement.className += ' random-mac';
}
