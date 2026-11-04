// The home page: the game's menu on the first screen, its videos. Every page that loads this: the sale end and the count of visits. Nothing moves for people who
// asked their computer for less motion.
// The launch price ends by itself at the end of 15 November in California (as the online program's LAUNCH_ENDS):
// after that the usual price shows again.
const SALE = Date.now() < Date.parse('2026-11-16T08:00:00Z');
if (!SALE) {
  document.querySelectorAll('[data-launch]').forEach(e => e.remove());
  document.querySelectorAll('[data-usual]').forEach(e => { e.textContent = e.dataset.usual; });
}

// The giveaway's lines show only while free copies are left.
fetch('https://api.cuzgames.com/api/giveaway').then(r => r.json()).then(g => {
  if (g.left > 0) document.querySelectorAll('[data-giveaway]').forEach(e => { e.hidden = false; });
}).catch(() => {});

// The menu, its clip and its stars are on the home page only; the pages made for searches use the rest of this file.
if (document.getElementById('deck')) {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The menu: the same eight cards as the game, the middle one playing, the next two tilted at the right. While another
  // game is in the middle, the free game waits at the left, so it is never out of sight on a computer. Upright screens
  // have no room there: the green button under the card does that job.
  const room = document.querySelector('.room'), deck = document.getElementById('deck');
  const cards = [...deck.querySelectorAll('.card')];
  const go = document.getElementById('go'), dots = document.getElementById('dots');
  const prev = document.getElementById('prev'), next = document.getElementById('next');
  let current = 0, onScreen = true;

  // Places are the game's 1280 x 800 layout; upright screens use a column 500 wide.
  const places = () => matchMedia('(max-aspect-ratio: 11 / 10)').matches
    ? { x: 250, y: 215, one: [640, 226, 0.64], two: [820, 232, 0.52] }
    : { x: 640, y: 310, one: [1058, 309, 0.64], two: [1236, 312, 0.52], wait: [196, 288, 0.64] };

  function playMiddle() {
    cards.forEach((card, i) => card.querySelectorAll('video').forEach(v => {
      if (i === current && onScreen && !REDUCE) {
        if (!v.src) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else v.pause();
    }));
  }

  function show(index) {
    current = Math.max(0, Math.min(cards.length - 1, index));
    const p = places();
    cards.forEach((card, i) => {
      const a = i - current, free = !!card.dataset.free, waits = a < 0 && free && !!p.wait;
      let x = p.x, y = p.y, s = 1, r = 0, o = 1, z = 5;
      if (a === 1) [x, y, s, r, z] = [...p.one, 3, 4];
      else if (a === 2) [x, y, s, r, z] = [...p.two, 4, 3];
      else if (a > 2) [x, y, s, r, o, z] = [p.two[0] + 260, p.two[1], 0.45, 5, 0, 2];
      else if (waits) [x, y, s, r, z] = [...p.wait, -3, 4];
      else if (a < 0) [x, s, r, o, z] = [-300, 0.6, -4, 0, 2];
      Object.entries({ '--x': x, '--y': y, '--s': s, '--r': r + 'deg' }).forEach(([k, v]) => card.style.setProperty(k, v));
      card.style.opacity = o;
      card.style.zIndex = z;
      card.style.pointerEvents = o ? '' : 'none';
      card.classList.toggle('now', a === 0);
      card.classList.toggle('waiting', waits);
    });
    [...dots.children].forEach((d, i) => d.classList.toggle('now', i === current));
    prev.disabled = current === 0;
    next.disabled = current === cards.length - 1;
    room.classList.toggle('away', current > 0);
    go.innerHTML = cards[current].dataset.free
      ? '<a class="gold big green" href="play/">Play free</a>'
      : `<a class="gold" href="play/?unlock">Unlock all games · ${SALE ? '$3.99' : '$7.99'}</a><a class="pill" href="play/?signin"><small>Bought it?</small>Log in</a>`;
    playMiddle();
  }

  cards.forEach((card, i) => {
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', card.querySelector('h2').textContent);
    dot.addEventListener('click', () => show(i));
    dots.appendChild(dot);
    // A click on the card in the middle does what its button does; any other card comes to the middle.
    card.addEventListener('click', () => { if (i === current) go.querySelector('a').click(); else show(i); });
  });
  prev.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
  let swipeFrom = null;
  deck.addEventListener('touchstart', e => { swipeFrom = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', e => {
    const moved = e.changedTouches[0].clientX - swipeFrom;
    if (Math.abs(moved) > 40) show(current + (moved < 0 ? 1 : -1));
  }, { passive: true });
  addEventListener('resize', () => show(current));
  new IntersectionObserver(list => { onScreen = list[0].isIntersecting; playMiddle(); }, { threshold: 0.1 }).observe(document.querySelector('.stage'));
  show(0);

  // The clip further down plays only while it is on screen.
  const clip = document.querySelector('.clip video');
  if (!REDUCE) new IntersectionObserver(list => list.forEach(e => {
    if (e.isIntersecting) clip.play().catch(() => {}); else clip.pause();
  }), { threshold: 0.35 }).observe(clip);

  // The stars: the game's fixed places, each twinkling in its own time.
  [[0.09, 0.19, 6], [0.18, 0.59, 4], [0.26, 0.15, 5], [0.77, 0.18, 6], [0.86, 0.58, 4], [0.70, 0.75, 5], [0.14, 0.80, 4], [0.92, 0.25, 5], [0.05, 0.48, 4], [0.95, 0.75, 6]].forEach(([x, y, size], i) => {
    const star = document.createElement('span');
    star.className = 'dot';
    star.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${size}px;height:${size}px;animation-delay:${-i * 0.7}s`;
    document.querySelector('.stage').appendChild(star);
  });
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
    const paid = /[?&]from=(paid-[a-z0-9]+)/.exec(location.search); // a paid video's own link, so each one is counted apart
    const from = test ? 'test' : paid ? paid[1] : /tiktok|musical_ly|bytedance|ttclid/.test(all) ? 'tiktok' : /instagram/.test(all) ? 'instagram' :
      /facebook|fban|fbav|fbclid/.test(all) ? 'facebook' : /youtube/.test(all) ? 'youtube' : /google|gclid/.test(all) ? 'google' :
      /itch\.io/.test(all) ? 'itch' : /discord/.test(all) ? 'discord' : /bing|duckduckgo|yahoo|ecosia/.test(all) ? 'search' : ref ? 'site' : 'direct';
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
      // Which app's own browser this is: a paid link's mark replaces it in "from", and the camera can behave differently there.
      const agent = navigator.userAgent, app = /musical_ly|bytedance|tiktok|trill/i.test(agent) ? 'TikTok' : /instagram/i.test(agent) ? 'Instagram' :
        /fban|fbav|fb_iab/i.test(agent) ? 'Facebook' : /snapchat/i.test(agent) ? 'Snapchat' : /; wv\)/.test(agent) ? 'an app' : '';
      if (app) send('say', '', 'inside ' + app, false);
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
