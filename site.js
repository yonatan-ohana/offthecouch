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
(function countVisit() {
  try {
    if (sessionStorage.getItem('otcFrom') || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    let ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (/(^|\.)(cuzgames|yo-software)\.com$/.test(ref)) ref = '';
    const all = (location.search + ' ' + ref + ' ' + navigator.userAgent).toLowerCase();
    const from = /tiktok|musical_ly|bytedance|ttclid/.test(all) ? 'tiktok' : /instagram/.test(all) ? 'instagram' :
      /facebook|fban|fbav|fbclid/.test(all) ? 'facebook' : /youtube/.test(all) ? 'youtube' : /google|gclid/.test(all) ? 'google' :
      /itch\.io/.test(all) ? 'itch' : /bing|duckduckgo|yahoo|ecosia/.test(all) ? 'search' : ref ? 'site' : 'direct';
    const visit = Math.random().toString(36).slice(2, 12), start = Date.now();
    const device = /iPhone|iPad|Android|Mobi/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'phone' : 'computer';
    sessionStorage.setItem('otcFrom', from);
    sessionStorage.setItem('otcVisit', visit);
    sessionStorage.setItem('otcStart', String(start));
    const send = (step, game, detail, count) => fetch('https://api.cuzgames.com/api/step', { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ step, game, detail, count, from, visit, at: Date.now() - start, device }) }).catch(() => {});
    send('site', '', '', true);
    // Leaving the website without pressing Play: how long they looked (once; the play page tells its own end).
    let told = false;
    const left = () => {
      if (told) return;
      told = true;
      const minutes = (Date.now() - start) / 60000;
      send('left', minutes < 1 ? 'under 1' : minutes < 3 ? '1-3' : minutes < 10 ? '3-10' : 'over 10', 'website', true);
    };
    addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href^="play/"]')) told = true; }, true);
    addEventListener('pagehide', left);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') left(); });
  } catch (e) {}
})();
