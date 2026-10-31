// The home page: the top bar, the video window, the label naming the game in the first video, and the game cards that
// play while you point at them (on a phone, while they are on screen). Nothing moves for people who asked their
// computer for less motion.
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOVER = matchMedia('(hover: hover)').matches;

// The top bar is see-through over the first video and turns solid once you scroll.
const bar = document.querySelector('.top');
const solid = () => bar.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', solid, { passive: true });
solid();

// Plays each video only while it is on screen.
function playWhileSeen(videos, threshold) {
  if (REDUCE) return;
  const io = new IntersectionObserver(list => list.forEach(e => {
    if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause();
  }), { threshold });
  videos.forEach(v => io.observe(v));
}

// The first video shows each game in turn.
const cards = [...document.querySelectorAll('.card:not(.more)')];
const hero = document.querySelector('.hero > video');
if (REDUCE) hero.pause();
playWhileSeen([hero], 0);

// Game cards: the game fills the card, and the player pops up in the corner while it plays.
const setLive = (card, on) => {
  card.classList.toggle('live', on);
  card.querySelectorAll('video').forEach(v => on ? v.play().catch(() => {}) : v.pause());
};
if (!REDUCE) {
  // The free game plays by itself while on screen; on a phone every game does.
  const io = new IntersectionObserver(list => list.forEach(e => setLive(e.target, e.isIntersecting)), { threshold: HOVER ? 0.5 : 0.6 });
  if (HOVER) {
    io.observe(cards[0]);
    cards.slice(1).forEach(c => {
      c.addEventListener('mouseenter', () => setLive(c, true));
      c.addEventListener('mouseleave', () => setLive(c, false));
    });
  } else cards.forEach(c => io.observe(c));
}
playWhileSeen([document.querySelector('.how-clip video')], 0.35);

// Each part slides in once it scrolls into view.
const parts = document.querySelectorAll('.rise');
if (REDUCE) parts.forEach(p => p.classList.add('in'));
else {
  const io = new IntersectionObserver(list => list.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  parts.forEach(p => io.observe(p));
}

// Counts a visit to the website, once per tab, with where it came from, and starts the visit's story for the owner's
// list of visits (see cameFrom, visit and step in play/shop.js, which work the same way and share what is kept here
// for the tab, so the play page goes on with the same story). Nothing about who is sent.
// A visit counts only once someone is really there: the page on screen for 3 seconds, or a touch, scroll or click.
// Apps such as TikTok load an ad's page early while the ad plays and drop it when the person swipes on; those, and
// anyone gone within 3 seconds, count only as a "glance", with no story.
// The owner's tests are counted apart, as coming from "test" (owner, 2026-10-31: "make sure my test sessions are not
// counted... toggle it in the analytics"; the numbers page hides them unless its Tests switch is on): open any page once
// with ?tester=on to mark this device (?tester=off unmarks it); it stays marked on this device and browser. Headless
// browsers (the checks run on this Mac) count as tests too. play/shop.js does the same.
function isTest() {
  try {
    const asked = new URLSearchParams(location.search).get('tester');
    if (asked === 'on' || asked === 'off') {
      if (asked === 'on') localStorage.setItem('otcTester', '1'); else localStorage.removeItem('otcTester');
      const note = document.createElement('div');
      note.textContent = asked === 'on' ? 'This device counts as a test' : 'This device counts as a visitor again';
      note.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:99;padding:8px 18px;border-radius:20px;background:#FFC93C;color:#2B1D4A;font:800 15px system-ui,sans-serif';
      const show = () => { document.body.appendChild(note); setTimeout(() => note.remove(), 4000); };
      if (document.body) show(); else addEventListener('DOMContentLoaded', show);
    }
    return localStorage.getItem('otcTester') === '1' || navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent);
  } catch (e) { return false; }
}

(function countVisit() {
  try {
    const test = isTest();
    if (sessionStorage.getItem('otcFrom') || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    let ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (/(^|\.)(cuzgames|yo-software)\.com$/.test(ref)) ref = '';
    const all = (location.search + ' ' + ref + ' ' + navigator.userAgent).toLowerCase();
    const from = test ? 'test' : /tiktok|musical_ly|bytedance|ttclid/.test(all) ? 'tiktok' : /instagram/.test(all) ? 'instagram' :
      /facebook|fban|fbav|fbclid/.test(all) ? 'facebook' : /youtube/.test(all) ? 'youtube' : /google|gclid/.test(all) ? 'google' :
      /itch\.io/.test(all) ? 'itch' : /bing|duckduckgo|yahoo|ecosia/.test(all) ? 'search' : ref ? 'site' : 'direct';
    const visit = Math.random().toString(36).slice(2, 12);
    const device = /iPhone|iPad|Android|Mobi/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'phone' : 'computer';
    let start = Date.now();
    sessionStorage.setItem('otcFrom', from);
    sessionStorage.setItem('otcVisit', visit);
    sessionStorage.setItem('otcStart', String(start));
    const send = (step, game, detail, count, story = true) => fetch('https://api.cuzgames.com/api/step', { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ step, game, detail, count, from, device,
        ...(story ? { visit, at: Date.now() - start } : {}) }) }).catch(() => {});

    // Someone is there: count the visit, its story starting from now.
    let there = false, timer = 0;
    const arrived = () => {
      if (there || told) return;
      there = true;
      clearTimeout(timer);
      start = Date.now();
      sessionStorage.setItem('otcStart', String(start));
      send('site', '', '', true);
    };
    const watch = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible' && !document.prerendering) timer = setTimeout(arrived, 3000);
    };
    ['pointerdown', 'scroll', 'keydown'].forEach((type) => addEventListener(type, arrived, { once: true, passive: true, capture: true }));
    document.addEventListener('visibilitychange', watch);
    watch();

    // Leaving the website without pressing Play: how long they looked (once; the play page tells its own end). Gone
    // before anyone was there: a glance.
    let told = false;
    const left = () => {
      if (told) return;
      if (!there) {
        told = true;
        send('glance', '', '', true, false);
        return;
      }
      told = true;
      const minutes = (Date.now() - start) / 60000;
      send('left', minutes < 1 ? 'under 1' : minutes < 3 ? '1-3' : minutes < 10 ? '3-10' : 'over 10', 'website', true);
    };
    addEventListener('click', (e) => {
      if (!(e.target.closest && e.target.closest('a[href^="play/"]'))) return;
      arrived();
      told = true;
    }, true);
    addEventListener('pagehide', left);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && there) left(); });
  } catch (e) {}
})();
