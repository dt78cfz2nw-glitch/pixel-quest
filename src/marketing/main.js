/* =========================================================
   PIXEL QUEST — main.js
   Pure vanilla JS, no heavy frameworks
   Canvas-based stars/particles, parallax, live data
   ========================================================= */

'use strict';

// -------------------------------------------------------
// CANVAS SETUP: Stars + Particles
// -------------------------------------------------------
const canvas = document.getElementById('hero-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = canvas.parentElement ? canvas.parentElement.offsetHeight : window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', () => {
  resizeCanvas();
  initStars();
  initParticles();
});

// -------------------------------------------------------
// UTILITIES
// -------------------------------------------------------
function randomBetween(a, b) { return a + Math.random() * (b - a); }

// -------------------------------------------------------
// STARS (200 twinkling dots)
// -------------------------------------------------------
let stars = [];

function initStars() {
  stars = [];
  const count = 200;
  const colors = [
    'rgba(255,255,255,',
    'rgba(180,210,255,',
    'rgba(255,240,180,',
  ];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const size = r < 0.80 ? 1 : r < 0.95 ? 2 : 3;
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.75,
      size,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: Math.random() * 0.6 + 0.4,
      twinkleSpeed: Math.random() * 4000 + 2000,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }
}
initStars();

// -------------------------------------------------------
// SHOOTING STARS
// -------------------------------------------------------
let shootingStars = [];
let nextShootingStarTime = Date.now() + randomBetween(8000, 12000);

function spawnShootingStar() {
  const startX = randomBetween(canvas.width * 0.2, canvas.width * 0.8);
  const startY = randomBetween(0, canvas.height * 0.35);
  const angle = 35 * (Math.PI / 180);
  const speed = (canvas.width * 1.3) / 0.6; // crosses in 0.6s
  shootingStars.push({
    x: startX,
    y: startY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    length: 120,
    opacity: 1,
    born: Date.now(),
    duration: 600,
    fadingOut: false,
    fadeDuration: 300,
    fadeStart: 0,
  });
  nextShootingStarTime = Date.now() + randomBetween(8000, 12000);
}

// -------------------------------------------------------
// GOLDEN PARTICLES (20, rising upward)
// -------------------------------------------------------
let particles = [];

function initParticles() {
  particles = [];
  for (let i = 0; i < 20; i++) {
    particles.push(createParticle(true));
  }
}

function createParticle(randomY) {
  const size = randomBetween(2, 4);
  return {
    x: randomBetween(0, canvas.width),
    y: randomY ? randomBetween(0, canvas.height) : canvas.height + 10,
    size,
    speed: randomBetween(15, 40),
    opacity: randomBetween(0.3, 0.6),
    drift: randomBetween(-8, 8),
  };
}
initParticles();

// -------------------------------------------------------
// CITY SILHOUETTE DRIFT (merged into main draw loop via dt)
// -------------------------------------------------------
const citySvg = document.getElementById('city-svg');
let cityDrift = 0;

// -------------------------------------------------------
// MAIN ANIMATION LOOP
// -------------------------------------------------------
let lastTime = 0;

function draw(timestamp) {
  if (!ctx) return;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // delta seconds, capped at 50ms
  lastTime = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw twinkling stars
  const now = Date.now();
  for (const s of stars) {
    const t = (now % s.twinkleSpeed) / s.twinkleSpeed;
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 + s.twinkleOffset));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color + (s.opacity * twinkle).toFixed(2) + ')';
    ctx.fill();
  }

  // Spawn shooting star if due
  if (now >= nextShootingStarTime) {
    spawnShootingStar();
  }

  // Draw and update shooting stars
  shootingStars = shootingStars.filter(ss => {
    const age = now - ss.born;
    const progress = Math.min(age / ss.duration, 1);

    const tailX = ss.x + ss.vx * (progress - 0.03) * (ss.duration / 1000);
    const tailY = ss.y + ss.vy * (progress - 0.03) * (ss.duration / 1000);
    const headX = ss.x + ss.vx * progress * (ss.duration / 1000);
    const headY = ss.y + ss.vy * progress * (ss.duration / 1000);

    let alpha = 1;
    if (progress > 0.7) {
      alpha = 1 - (progress - 0.7) / 0.3;
    }

    const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
    grad.addColorStop(0, `rgba(255,255,255,0)`);
    grad.addColorStop(0.7, `rgba(200,220,255,${(alpha * 0.5).toFixed(2)})`);
    grad.addColorStop(1, `rgba(255,255,255,${alpha.toFixed(2)})`);

    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(200,220,255,0.8)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    return progress < 1;
  });

  // Draw and update golden particles
  for (const p of particles) {
    p.y -= p.speed * dt;
    p.x += p.drift * dt;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,221,68,${p.opacity.toFixed(2)})`;
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(255,136,0,0.6)';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Reset particle when it leaves top
    if (p.y < -10) {
      const fresh = createParticle(false);
      p.x = fresh.x;
      p.y = fresh.y;
      p.speed = fresh.speed;
      p.opacity = fresh.opacity;
      p.drift = fresh.drift;
    }
  }

  // City silhouette slow drift: 0.5px per second leftward
  cityDrift -= 0.5 * dt;
  if (citySvg) citySvg.style.transform = `translateX(${cityDrift}px)`;

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// -------------------------------------------------------
// PARALLAX SCROLLING (rAF-throttled)
// -------------------------------------------------------
const layerSky = document.getElementById('layer-sky');
const layerAurora = document.getElementById('layer-aurora');
const layerCity = document.getElementById('layer-city');
const layerParticles = document.getElementById('layer-particles');

let scrollY = 0;
let ticking = false;

window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
  if (!ticking) {
    requestAnimationFrame(updateParallax);
    ticking = true;
  }
}, { passive: true });

function updateParallax() {
  const s = scrollY;
  if (layerSky)       layerSky.style.transform       = `translateY(${s * 0.1}px)`;
  if (layerAurora)    layerAurora.style.transform    = `translateY(${s * 0.3}px)`;
  if (layerCity)      layerCity.style.transform      = `translateY(${s * 0.5}px)`;
  if (layerParticles) layerParticles.style.transform = `translateY(${s * 0.7}px)`;
  ticking = false;
}

// -------------------------------------------------------
// NAVIGATION: scroll detection + active links
// -------------------------------------------------------
const navbar = document.getElementById('navbar');
const scrollIndicator = document.getElementById('scroll-indicator');

function updateNav() {
  const s = window.scrollY;

  // Scroll state
  if (s > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }

  // Hide scroll indicator
  if (s > 100) {
    scrollIndicator && scrollIndicator.classList.add('hidden');
  } else {
    scrollIndicator && scrollIndicator.classList.remove('hidden');
  }

  // Active nav links
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  let current = '';
  sections.forEach(sec => {
    const top = sec.offsetTop - 100;
    if (s >= top) current = sec.getAttribute('id');
  });
  navLinks.forEach(link => {
    const href = link.getAttribute('href').replace('#', '');
    link.classList.toggle('active', href === current);
  });
}

window.addEventListener('scroll', updateNav, { passive: true });
updateNav();

// -------------------------------------------------------
// HAMBURGER MENU
// -------------------------------------------------------
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
const mobileMenuClose = document.getElementById('mobile-menu-close');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

function openMobileMenu() {
  if (!mobileMenu || !hamburger) return;
  mobileMenu.classList.add('open');
  mobileMenu.setAttribute('aria-hidden', 'false');
  hamburger.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}
function closeMobileMenu() {
  if (!mobileMenu || !hamburger) return;
  mobileMenu.classList.remove('open');
  mobileMenu.setAttribute('aria-hidden', 'true');
  hamburger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

if (hamburger) hamburger.addEventListener('click', openMobileMenu);
if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
mobileNavLinks.forEach(link => link.addEventListener('click', closeMobileMenu));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMobileMenu();
});

// -------------------------------------------------------
// SMOOTH SCROLL for #learn-more
// -------------------------------------------------------
const learnMore = document.getElementById('learn-more');
if (learnMore) {
  learnMore.addEventListener('click', e => {
    e.preventDefault();
    const target = document.getElementById('about');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  });
}

// Also handle all [href^="#"] nav links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// -------------------------------------------------------
// SCROLL REVEAL (Intersection Observer with fallback)
// -------------------------------------------------------
const revealEls = document.querySelectorAll('.scroll-reveal');

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Trigger stat bar animations when class cards visible
        if (entry.target.classList.contains('class-card')) {
          animateStatBars(entry.target);
        }
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));
} else {
  // Fallback: show all immediately
  revealEls.forEach(el => el.classList.add('revealed'));
  document.querySelectorAll('.class-card').forEach(animateStatBars);
}

// -------------------------------------------------------
// STAT BAR ANIMATION
// -------------------------------------------------------
function animateStatBars(card) {
  const fills = card.querySelectorAll('.stat-fill');
  fills.forEach(fill => fill.classList.add('animate'));
}

// -------------------------------------------------------
// GALLERY LIGHTBOX
// -------------------------------------------------------
const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightbox-content');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');

const galleryItems = Array.from(document.querySelectorAll('.gallery-item'));
let currentLightboxIndex = 0;

function openLightbox(index) {
  currentLightboxIndex = index;
  showLightboxItem(index);
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
function showLightboxItem(index) {
  const item = galleryItems[index];
  if (!item) return;
  const thumb = item.querySelector('.gallery-thumb');
  const caption = item.querySelector('.gallery-caption');
  lightboxContent.style.cssText = thumb.style.cssText;
  lightboxContent.className = 'lightbox-content ' + thumb.className;
  lightboxContent.setAttribute('aria-label', caption ? caption.textContent : '');
}

galleryItems.forEach((item, i) => {
  item.addEventListener('click', () => openLightbox(i));
  item.addEventListener('keydown', e => { if (e.key === 'Enter') openLightbox(i); });
});
if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
if (lightbox) lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
if (lightboxPrev) lightboxPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  currentLightboxIndex = (currentLightboxIndex - 1 + galleryItems.length) % galleryItems.length;
  showLightboxItem(currentLightboxIndex);
});
if (lightboxNext) lightboxNext.addEventListener('click', (e) => {
  e.stopPropagation();
  currentLightboxIndex = (currentLightboxIndex + 1) % galleryItems.length;
  showLightboxItem(currentLightboxIndex);
});
document.addEventListener('keydown', e => {
  if (!lightbox || !lightbox.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft' && lightboxPrev) lightboxPrev.click();
  if (e.key === 'ArrowRight' && lightboxNext) lightboxNext.click();
});

// -------------------------------------------------------
// LIVE DATA INTEGRATION
// -------------------------------------------------------

// Animated counter utility
function animateCounter(element, newValue, prefix, suffix) {
  const numStr = newValue.toLocaleString();
  element.textContent = prefix + numStr + suffix;
  element.classList.remove('stat-num-flash');
  void element.offsetWidth; // force reflow
  element.classList.add('stat-num-flash');
}

// Canister ID detection
function getCanisterId() {
  try {
    if (window.BACKEND_CANISTER_ID) return window.BACKEND_CANISTER_ID;
    if (window.__ENV__ && window.__ENV__.BACKEND_CANISTER_ID) return window.__ENV__.BACKEND_CANISTER_ID;
    if (window.__CANISTER_IDS__ && window.__CANISTER_IDS__.backend) return window.__CANISTER_IDS__.backend;
    // Try to read from a global set by the platform
    const meta = document.querySelector('meta[name="backend-canister-id"]');
    if (meta) return meta.getAttribute('content');
  } catch (e) {
    // ignore
  }
  return null;
}

// ICP agent HTTP query helper (simple fetch to IC gateway)
async function icQuery(canisterId, methodName, argBytes) {
  // Use the read_state / query endpoint on the IC HTTP gateway
  const url = `https://icp0.io/api/v2/canister/${canisterId}/query`;
  const body = argBytes || new Uint8Array([68, 73, 68, 76, 0, 0]); // empty DIDL arg

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
    },
    body: body,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buf = await response.arrayBuffer();
  return buf;
}

// Simpler approach: use fetch to the HTTP interface if the canister supports it
// Most game canisters don't expose HTTP interface, so we use agent-js via CDN

let agent = null;
let backendActor = null;

async function initAgent() {
  const canisterId = getCanisterId();
  if (!canisterId) return false;

  try {
    // Dynamic import of @dfinity/agent from CDN
    const { HttpAgent, Actor } = await import('https://cdn.jsdelivr.net/npm/@dfinity/agent@2.1.3/lib/esm/index.js');

    agent = await HttpAgent.create({
      host: 'https://icp0.io',
      retryTimes: 2,
    });

    // Minimal Candid IDL for the methods we need
    // We only need 3 methods: getOnlinePlayerCount, getLeaderboardByLevelKills, getAllPlayers
    const { IDL } = await import('https://cdn.jsdelivr.net/npm/@dfinity/candid@2.1.3/lib/esm/index.js');

    const LeaderboardEntry = IDL.Record({
      username: IDL.Text,
      level: IDL.Nat,
      activityScore: IDL.Nat,
      lastActive: IDL.Nat,
      monsterKills: IDL.Nat,
      pvpKills: IDL.Nat,
      characterClass: IDL.Text,
    });

    const PlayerState = IDL.Record({
      username: IDL.Text,
      monsterKills: IDL.Nat,
      pvpKills: IDL.Nat,
      level: IDL.Nat,
      lastActive: IDL.Nat,
    });

    const idlFactory = ({ IDL: I }) => {
      const LE = I.Record({
        username: I.Text,
        level: I.Nat,
        activityScore: I.Nat,
        lastActive: I.Nat,
        monsterKills: I.Nat,
        pvpKills: I.Nat,
        characterClass: I.Text,
      });
      const PS = I.Record({
        username: I.Text,
        monsterKills: I.Nat,
        pvpKills: I.Nat,
        level: I.Nat,
        lastActive: I.Nat,
      });
      return I.Service({
        getOnlinePlayerCount: I.Func([], [I.Nat], ['query']),
        getLeaderboardByLevelKills: I.Func([], [I.Vec(LE)], ['query']),
        getAllPlayers: I.Func([], [I.Vec(I.Tuple(I.Principal, PS))], ['query']),
      });
    };

    backendActor = Actor.createActor(idlFactory, { agent, canisterId });
    return true;
  } catch (e) {
    // CDN unavailable or canister not reachable
    return false;
  }
}

// State
let onlineCount = null;
let leaderTop = null;
let killCount = null;
let leaderboardData = [];

// Fetch functions
async function fetchOnlineCount() {
  if (!backendActor) return;
  try {
    const count = await backendActor.getOnlinePlayerCount();
    const num = Number(count);
    const el = document.getElementById('stat-online');
    if (el) animateCounter(el, num, '', ' PLAYERS ONLINE');
    onlineCount = num;
  } catch (e) { /* silently ignore */ }
}

async function fetchLeaderTop() {
  if (!backendActor) return;
  try {
    const entries = await backendActor.getLeaderboardByLevelKills();
    if (entries && entries.length > 0) {
      const top = entries[0];
      const el = document.getElementById('stat-leader');
      const name = String(top.username).slice(0, 12);
      const lv = Number(top.level);
      if (el) {
        el.textContent = `LEADERBOARD LEADER: ${name} LV${lv}`;
        el.classList.remove('stat-num-flash');
        void el.offsetWidth;
        el.classList.add('stat-num-flash');
      }
      leaderTop = top;
      leaderboardData = entries;
      updateLeaderboardTable(entries);
    }
  } catch (e) { /* silently ignore */ }
}

async function fetchKillCount() {
  if (!backendActor) return;
  try {
    const players = await backendActor.getAllPlayers();
    let total = 0;
    for (const [, state] of players) {
      total += Number(state.monsterKills || 0) + Number(state.pvpKills || 0);
    }
    const el = document.getElementById('stat-kills');
    if (el) animateCounter(el, total, 'MONSTERS SLAIN: ', '');
    killCount = total;
  } catch (e) { /* silently ignore */ }
}

// Leaderboard table renderer
function updateLeaderboardTable(entries) {
  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;

  const top10 = entries.slice(0, 10);
  if (top10.length === 0) {
    tbody.innerHTML = '<tr class="lb-loading"><td colspan="6">No data available yet.</td></tr>';
    return;
  }

  const rankLabels = ['', '👑', '🪨', '🥉'];
  const classIcons = {
    warrior: '⚔',
    mage: '🧙',
    default: '⚔',
  };
  const zoneNames = {
    meadow_hub: 'Meadow',
    forest: 'Forest',
    dark_forest: 'Dark Forest',
    aurelion: 'Aurelion',
    pirate_island: 'Pirate Isle',
    cave_system: 'Cave',
    ancient_ruins: 'Ruins',
    egypt_island: 'Egypt',
    thunder_isle: 'Thunder Isle',
  };

  tbody.innerHTML = top10.map((entry, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const rankDisplay = rankLabels[rank] || String(rank);
    const name = String(entry.username).slice(0, 16);
    const classKey = String(entry.characterClass).toLowerCase();
    const icon = classIcons[classKey] || classIcons.default;
    const level = Number(entry.level);
    const kills = Number(entry.monsterKills || 0) + Number(entry.pvpKills || 0);

    return `<tr class="${rankClass}">
      <td><span class="lb-rank">${rankDisplay}</span></td>
      <td><span class="lb-player">${name}</span></td>
      <td><span class="lb-class-icon">${icon}</span></td>
      <td><span class="lb-level">LV ${level}</span></td>
      <td class="lb-kills">${kills.toLocaleString()}</td>
      <td class="lb-hide-sm"><span class="lb-zone">In-Game</span></td>
    </tr>`;
  }).join('');
}

// Counter-up animation on first load for kill count
function animateCounterUp(el, target, prefix, suffix, duration) {
  const start = Date.now();
  const step = () => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out
    const val = Math.floor(target * (1 - Math.pow(1 - progress, 3)));
    el.textContent = prefix + val.toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Boot live data
async function bootLiveData() {
  const agentReady = await initAgent();

  if (!agentReady) {
    // Show friendly placeholders
    const statOnline = document.getElementById('stat-online');
    const statLeader = document.getElementById('stat-leader');
    const statKills = document.getElementById('stat-kills');
    if (statOnline) statOnline.textContent = '-- PLAYERS ONLINE';
    if (statLeader) statLeader.textContent = 'LEADERBOARD LEADER: --';
    if (statKills)  statKills.textContent = 'MONSTERS SLAIN: --';

    // Show demo leaderboard
    const tbody = document.getElementById('leaderboard-body');
    if (tbody) {
      tbody.innerHTML = '<tr class="lb-loading"><td colspan="6">Connect to game to see live rankings</td></tr>';
    }
    return;
  }

  // Initial fetches
  await Promise.allSettled([
    fetchOnlineCount(),
    fetchLeaderTop(),
    fetchKillCount(),
  ]);

  // Animate kill count up on first load
  if (killCount !== null) {
    const el = document.getElementById('stat-kills');
    if (el) animateCounterUp(el, killCount, 'MONSTERS SLAIN: ', '', 2000);
  }

  // Poll intervals
  setInterval(fetchOnlineCount, 30000);
  setInterval(fetchLeaderTop, 60000);
  setInterval(fetchKillCount, 15000);
}

// Start live data after DOM is fully ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootLiveData);
} else {
  bootLiveData();
}

// -------------------------------------------------------
// SMOOTH SCROLL polyfill safety
// -------------------------------------------------------
// Already handled via CSS scroll-behavior: smooth
// and JS scrollIntoView({behavior:'smooth'})
