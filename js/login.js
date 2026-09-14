var hostname = window.location.hostname;
document.getElementById('title').innerHTML = hostname + ' > login';

const memberBtn = document.getElementById('btnmem');
const voucherBtn = document.getElementById('btnvrc');

document.login.username.focus();

var infologin = document.getElementById('infologin');
infologin.innerHTML = 'প্রথমে ভাউচার কোড লিখুন তারপর লগইন করুন.';

// login page 2 mode by Laksamadi Guko
var username = document.login.username;
var password = document.login.password;

username.placeholder = 'Voucher Code';

// set password = username
function setpass() {
    var user = username.value;
    //user = user.toLowerCase();
    username.value = user;
    password.value = user;
}

username.onkeyup = setpass;

// change to voucher mode
function voucher() {
    username.focus();
    username.onkeyup = setpass;
    username.placeholder = 'Voucher Code';
    username.style = 'border-radius:3px;';
    password.type = 'hidden';
    infologin.innerHTML = 'ভাউচার কোড লিখুন তারপর লগইন করুন.';
    voucherBtn.classList = 'small-button active';
    memberBtn.classList = 'small-button';
}

// ===== Random MAC warning: guide tabs + helpers =====
(function () {
    var macval = document.getElementById('macval');
    if (macval) macval.innerHTML = CLIENT_MAC || 'unknown';

    // remember the user's choice only for this browser session
    var skip = document.getElementById('skipmac');
    if (skip) {
        skip.onclick = function () {
            document.cookie = 'skipmac=1; path=/';
            document.documentElement.className = document.documentElement.className.replace(/\brandom-mac\b/, '');
            return false;
        };
    }

    // pick the guide matching the device
    var ua = navigator.userAgent || '';
    var os = 'android';
    if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
    else if (/Windows/i.test(ua)) os = 'windows';
    else if (/Android/i.test(ua)) os = 'android';
    showGuide(os);
})();

function showGuide(os) {
    var all = ['android', 'ios', 'windows'];
    for (var i = 0; i < all.length; i++) {
        var on = all[i] === os;
        document.getElementById('guide-' + all[i]).style.display = on ? 'block' : 'none';
        document.getElementById('tab-' + all[i]).className = on ? 'small-button active' : 'small-button';
    }
}

// ===== Infinite auto image slider =====
(function () {
    var track = document.getElementById('sliderTrack');
    var dotsBox = document.getElementById('sliderDots');
    if (!track) return;

    var slides = track.getElementsByClassName('slider-slide');
    var total = slides.length;
    if (total < 2) return;

    var DELAY = 3500; // ms between slides
    var SPEED = 450; // ms transition
    var index = 0;
    var timer = null;
    var busy = false;

    // clone the first slide at the end so the last -> first move keeps sliding forward
    var clone = slides[0].cloneNode(true);
    track.appendChild(clone);
    track.style.width = (total + 1) * 100 + '%';
    var slideWidth = 100 / (total + 1);
    for (var i = 0; i < track.children.length; i++) {
        track.children[i].style.width = slideWidth + '%';
    }

    // dots
    var dots = [];
    for (var d = 0; d < total; d++) {
        var dot = document.createElement('span');
        dot.className = 'slider-dot';
        dot.setAttribute('data-i', d);
        dot.onclick = function () {
            goTo(parseInt(this.getAttribute('data-i'), 10));
            restart();
        };
        dotsBox.appendChild(dot);
        dots.push(dot);
    }

    function move(animate) {
        track.style.transition = animate ? 'transform ' + SPEED + 'ms ease-in-out' : 'none';
        track.style.transform = 'translateX(' + -(index * slideWidth) + '%)';
        for (var i = 0; i < total; i++) {
            dots[i].className = i === index % total ? 'slider-dot active' : 'slider-dot';
        }
    }

    function goTo(i) {
        if (busy) return;
        busy = true;
        index = i;
        move(true);
        setTimeout(function () {
            // landed on the clone -> jump back to the real first slide silently
            if (index === total) {
                index = 0;
                move(false);
            }
            busy = false;
        }, SPEED);
    }

    function next() {
        goTo(index + 1);
    }
    function prev() {
        goTo(index === 0 ? total - 1 : index - 1);
    }

    function start() {
        if (!timer) timer = setInterval(next, DELAY);
    }
    function stop() {
        clearInterval(timer);
        timer = null;
    }
    function restart() {
        stop();
        start();
    }

    // swipe / drag support
    var startX = 0,
        moved = 0,
        dragging = false;
    var box = document.getElementById('slider');

    function down(x) {
        startX = x;
        moved = 0;
        dragging = true;
        stop();
    }
    function up() {
        if (!dragging) return;
        dragging = false;
        if (moved < -40) next();
        else if (moved > 40) prev();
        start();
    }

    box.addEventListener(
        'touchstart',
        function (e) {
            down(e.touches[0].clientX);
        },
        { passive: true },
    );
    box.addEventListener(
        'touchmove',
        function (e) {
            if (dragging) moved = e.touches[0].clientX - startX;
        },
        { passive: true },
    );
    box.addEventListener('touchend', up);
    box.onmousedown = function (e) {
        down(e.clientX);
        return false;
    };
    box.onmousemove = function (e) {
        if (dragging) moved = e.clientX - startX;
    };
    box.onmouseup = up;
    box.onmouseleave = function () {
        if (dragging) up();
        else start();
    };
    box.onmouseenter = stop;

    // don't animate while the tab is hidden
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop();
        else start();
    });

    move(false);
    start();
})();

// change to member mode
function member() {
    username.focus();
    username.onkeyup = '';
    username.placeholder = 'Username';
    username.style = 'border-radius:3px 3px 0px 0px;';
    password.type = 'password';
    infologin.innerHTML = 'মেম্বার ইউজার নেম ও পাসওয়ার্ড লিখে লগইন করুন.';
    memberBtn.classList = 'small-button active';
    voucherBtn.classList = 'small-button';
}

// copywrite date text
let date = new Date();
document.getElementById('cp-year').innerText = date.getFullYear();
