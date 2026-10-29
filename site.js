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

// The first video shows each game in turn, an equal share of its length each, in the order of the cards below; the
// label names the one on screen.
const cards = [...document.querySelectorAll('.card:not(.more)')];
const names = cards.map(c => c.querySelector('h3').textContent);
const hero = document.querySelector('.hero > video'), now = document.getElementById('now');
if (REDUCE) hero.pause();
hero.addEventListener('timeupdate', () => {
  if (!hero.duration) return;
  now.textContent = names[Math.min(names.length - 1, Math.floor(hero.currentTime / (hero.duration / names.length)))];
});
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
