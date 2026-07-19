// ════════════════════════════════════════════════════════════════════
// Game FX · confetti, badges, countdowns, live pulse, toast, unlock
// Todo lo que hace que esto se sienta juego y no dashboard.
// ════════════════════════════════════════════════════════════════════
import { CONFIG } from './config.js?v=20260607qa44';
import { getState, hasRes } from './state.js?v=20260607qa44';

// ── Confetti ────────────────────────────────────────────────────────
const CONFETTI_THEMES = ['t-cobalt', 't-maroon', 't-pasto', 't-tomate', 't-rosa', 't-holo', ''];
const CONFETTI_SHAPES = ['', 'shape-circle', 'shape-star'];

export function fireConfetti({ count = 80, originX = 0.5 } = {}) {
  if (!CONFIG.FEATURES.CONFETTI) return;
  let stage = document.querySelector('.bb-confetti-stage');
  if (!stage) {
    stage = document.createElement('div');
    stage.className = 'bb-confetti-stage';
    document.body.appendChild(stage);
  }
  const W = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'bb-confetti-piece '
      + CONFETTI_THEMES[Math.floor(Math.random() * CONFETTI_THEMES.length)] + ' '
      + CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)];
    const x = (originX * W) + (Math.random() - 0.5) * W * 0.6;
    piece.style.left = x + 'px';
    piece.style.animationDelay = (Math.random() * 0.3) + 's';
    piece.style.animationDuration = (1.2 + Math.random() * 0.8) + 's';
    stage.appendChild(piece);
    setTimeout(() => piece.remove(), 2400);
  }
}

// ── Toast ───────────────────────────────────────────────────────────
export function toast(msg, kind = 'ok') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast' + (kind === 'err' ? ' err' : '') + ' show';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.className = 'toast' + (kind === 'err' ? ' err' : ''), 3200);
}

// ── Unlock banner (logro desbloqueado) ──────────────────────────────
export function showUnlock(title, sub) {
  if (!CONFIG.FEATURES.BADGES) return;
  const div = document.createElement('div');
  div.className = 'bb-unlock';
  div.innerHTML = `
    <div class="bb-unlock-ico">★</div>
    <div>${title}<div class="bb-unlock-sub">${sub || 'Logro desbloqueado'}</div></div>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4200);
}

// ── Countdown component (texto live) ────────────────────────────────
const countdowns = new Set();
export function attachCountdown(el, target) {
  if (!CONFIG.FEATURES.COUNTDOWN) return;
  const obj = { el, target: new Date(target).getTime() };
  countdowns.add(obj);
  tickCountdowns();
}
function tickCountdowns() {
  const now = Date.now();
  for (const c of countdowns) {
    if (!c.el.isConnected) { countdowns.delete(c); continue; }
    const ms = c.target - now;
    const urgent = ms > 0 && ms < 60 * 60 * 1000;
    c.el.classList.toggle('urgent', urgent);
    c.el.innerHTML = formatCountdown(ms);
  }
  setTimeout(tickCountdowns, 1000);
}
function formatCountdown(ms) {
  if (ms <= 0) return '<span class="bb-cd-l">en curso</span><span class="bb-cd-n">●</span>';
  const totalSec = Math.floor(ms / 1000);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600) / 60);
  const secs  = totalSec % 60;
  if (days > 0)  return `<span class="bb-cd-n">${days}<span class="bb-cd-l">d</span> ${hours}<span class="bb-cd-l">h</span></span>`;
  if (hours > 0) return `<span class="bb-cd-n">${hours}<span class="bb-cd-l">h</span> ${String(mins).padStart(2,'0')}<span class="bb-cd-l">m</span></span>`;
  return `<span class="bb-cd-n">${mins}<span class="bb-cd-l">m</span> ${String(secs).padStart(2,'0')}<span class="bb-cd-l">s</span></span>`;
}

// ── Sync freshness pill (en el header) ──────────────────────────────
export function renderSyncPill(target) {
  if (!target) return;
  const { lastSyncedAt, syncFreshness, syncSources } = getState();
  const cls = syncFreshness === 'fresh' ? '' : syncFreshness === 'stale' ? ' stale' : ' error';
  const label = lastSyncedAt
    ? `Sync ${timeAgo(lastSyncedAt)}`
    : 'Sin sync';
  target.innerHTML = `<span class="bb-sync-pill${cls}" title="Última sincronización del Sheet · ${syncSources || ''}">
    <span class="bb-sync-dot"></span>${label}
  </span>`;
}
function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// ── Live pulse (cuando hay partidos en curso) ───────────────────────
export function renderLivePill(target, liveMatches) {
  if (!target) return;
  if (!liveMatches?.length) { target.innerHTML = ''; return; }
  target.innerHTML = `<span class="bb-live">EN VIVO · ${liveMatches.length}</span>`;
}

// ── Badges (logros) ─────────────────────────────────────────────────
export const BADGE_DEFS = {
  pleno_solo:   { ico: '★',  title: 'Pleno solo',         klass: 't-solo'    },
  pleno:        { ico: '◎',  title: 'Pleno',              klass: 't-pleno'   },
  doblete:      { ico: '⚡', title: 'Doblete',            klass: 't-pleno'   },
  hat_trick:    { ico: '🎩', title: 'Hat-trick',          klass: 't-perfect' },
  streak_3:     { ico: '🔥', title: 'Racha x3',           klass: 't-streak'  },
  streak_5:     { ico: '🔥', title: 'Racha x5',           klass: 't-streak'  },
  perfect_round:{ ico: '👑', title: 'Jornada perfecta',   klass: 't-perfect' },
  goleador:     { ico: '⚽', title: 'El goleador',        klass: 't-streak'  },
  zero_wo:      { ico: '🏅', title: 'Sin un solo WO',     klass: 't-zero-wo' },
};

export function renderBadge(key, { unlocked = true, large = false } = {}) {
  const def = BADGE_DEFS[key];
  if (!def) return '';
  return `<span class="bb-badge ${def.klass}${unlocked ? ' unlocked' : ' locked'}">
    <span class="bb-badge-ico">${def.ico}</span>${def.title}
  </span>`;
}

// Detecta logros comparando picks/matches. Devuelve array de badge keys.
export function computeBadgesFor(playerId) {
  const { matches, picks } = getState();
  const myPicks = picks.filter(p => p.player_id === playerId);
  const badges = new Set();
  let streak = 0, maxStreak = 0, totalWo = 0;

  const sorted = matches
    .filter(hasRes)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  // Agrupar por jornada para doblete / hat-trick / jornada perfecta
  const byRound = {};
  for (const m of sorted) {
    const key = `${m.competition_id || 'liga'}::${m.round_id || '—'}`;
    if (!byRound[key]) byRound[key] = [];
    byRound[key].push(m);
  }

  for (const m of sorted) {
    const pk = myPicks.find(p => p.match_id === m.id);
    if (!pk || pk.home_score == null) { streak = 0; totalWo++; continue; }
    const isP  = pk.status === 'P' || pk.status === 'P ';
    const hit  = isP || pk.status === 'Ac';
    if (isP) {
      badges.add('pleno');
      const otherPlenos = picks.filter(p =>
        p.match_id === m.id && p.player_id !== playerId &&
        (p.status === 'P' || p.status === 'P ')
      );
      if (otherPlenos.length === 0) badges.add('pleno_solo');
      // Goleador: pleno exacto en partido con 4+ goles reales
      if ((Number(m.home_score) + Number(m.away_score)) >= 4) badges.add('goleador');
    }
    if (hit) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  if (maxStreak >= 3) badges.add('streak_3');
  if (maxStreak >= 5) badges.add('streak_5');
  if (totalWo === 0 && sorted.length > 0) badges.add('zero_wo');

  for (const rMatches of Object.values(byRound)) {
    const rPlenos = rMatches.filter(m => {
      const pk = myPicks.find(p => p.match_id === m.id);
      return pk && (pk.status === 'P' || pk.status === 'P ');
    }).length;
    const allHit = rMatches.length > 0 && rMatches.every(m => {
      const pk = myPicks.find(p => p.match_id === m.id);
      return pk && pk.home_score != null &&
        (pk.status === 'P' || pk.status === 'P ' || pk.status === 'Ac');
    });
    if (rPlenos >= 2) badges.add('doblete');
    if (rPlenos >= 3) badges.add('hat_trick');
    if (allHit) badges.add('perfect_round');
  }

  return [...badges];
}

// ── XP + Niveles ─────────────────────────────────────────────────────
export const LEVEL_DEFS = [
  { min: 0,   name: 'Promesa',  ico: '⚽' },
  { min: 30,  name: 'Puntero',  ico: '🥇' },
  { min: 80,  name: 'Crack',    ico: '⚡' },
  { min: 160, name: 'Figurita', ico: '★'  },
  { min: 300, name: 'Leyenda',  ico: '👑' },
];

export function computeXPFor(playerId) {
  const { matches, picks } = getState();
  const myPicks = picks.filter(p => p.player_id === playerId);
  let xp = 0;
  let streak = 0, maxStreak = 0;

  const sorted = matches
    .filter(hasRes)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  for (const m of sorted) {
    const pk = myPicks.find(p => p.match_id === m.id);
    if (!pk || pk.home_score == null) { streak = 0; continue; }
    const isP = pk.status === 'P' || pk.status === 'P ';
    const isAc = pk.status === 'Ac';
    if (isP) {
      xp += 10;
      const solos = picks.filter(p =>
        p.match_id === m.id && p.player_id !== playerId &&
        (p.status === 'P' || p.status === 'P ')
      );
      if (solos.length === 0) xp += 5;
      if ((Number(m.home_score) + Number(m.away_score)) >= 4) xp += 3;
    } else if (isAc) {
      xp += 5;
    }
    if (isP || isAc) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  if (maxStreak >= 3) xp += 5;
  if (maxStreak >= 5) xp += 15;

  const lvIdx = LEVEL_DEFS.slice().reverse().findIndex(l => xp >= l.min);
  const level = LEVEL_DEFS[LEVEL_DEFS.length - 1 - lvIdx];
  const lvPos = LEVEL_DEFS.indexOf(level);
  const next  = LEVEL_DEFS[lvPos + 1] || null;
  const progress = next ? (xp - level.min) / (next.min - level.min) : 1;

  return { xp, level, next, progress: Math.min(progress, 1) };
}

// ── Misiones ─────────────────────────────────────────────────────────
export const MISSION_DEFS = [
  {
    id: 'primera_sangre',
    title: 'Primera sangre',
    desc: 'Tu primer pleno exacto',
    ico: '🎯',
    total: 1,
    check(myPicks) {
      const n = myPicks.filter(p => p.status === 'P' || p.status === 'P ').length;
      return { progress: Math.min(n, 1), done: n >= 1 };
    },
  },
  {
    id: 'doblete',
    title: 'Doblete',
    desc: '2 plenos en la misma jornada',
    ico: '⚡',
    total: 2,
    check(myPicks, matches) {
      const byRound = {};
      for (const m of matches.filter(hasRes)) {
        const pk = myPicks.find(p => p.match_id === m.id);
        if (!pk || !(pk.status === 'P' || pk.status === 'P ')) continue;
        byRound[m.round_id] = (byRound[m.round_id] || 0) + 1;
      }
      const max = Math.max(0, ...Object.values(byRound));
      return { progress: Math.min(max, 2), done: max >= 2 };
    },
  },
  {
    id: 'hat_trick',
    title: 'Hat-trick',
    desc: '3 plenos en la misma jornada',
    ico: '🎩',
    total: 3,
    check(myPicks, matches) {
      const byRound = {};
      for (const m of matches.filter(hasRes)) {
        const pk = myPicks.find(p => p.match_id === m.id);
        if (!pk || !(pk.status === 'P' || pk.status === 'P ')) continue;
        byRound[m.round_id] = (byRound[m.round_id] || 0) + 1;
      }
      const max = Math.max(0, ...Object.values(byRound));
      return { progress: Math.min(max, 3), done: max >= 3 };
    },
  },
  {
    id: 'racha_3',
    title: 'Racha x3',
    desc: '3 aciertos consecutivos',
    ico: '🔥',
    total: 3,
    check(myPicks, matches) {
      let streak = 0, max = 0;
      const sorted = matches.filter(hasRes).sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
      for (const m of sorted) {
        const pk = myPicks.find(p => p.match_id === m.id);
        const hit = pk && pk.home_score != null && (pk.status === 'P' || pk.status === 'P ' || pk.status === 'Ac');
        if (hit) { streak++; max = Math.max(max, streak); } else streak = 0;
      }
      return { progress: Math.min(max, 3), done: max >= 3 };
    },
  },
  {
    id: 'racha_5',
    title: 'Racha x5',
    desc: '5 aciertos consecutivos',
    ico: '🔥🔥',
    total: 5,
    check(myPicks, matches) {
      let streak = 0, max = 0;
      const sorted = matches.filter(hasRes).sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
      for (const m of sorted) {
        const pk = myPicks.find(p => p.match_id === m.id);
        const hit = pk && pk.home_score != null && (pk.status === 'P' || pk.status === 'P ' || pk.status === 'Ac');
        if (hit) { streak++; max = Math.max(max, streak); } else streak = 0;
      }
      return { progress: Math.min(max, 5), done: max >= 5 };
    },
  },
  {
    id: 'pleno_solo',
    title: 'Ojo clínico',
    desc: 'Nadie más acertó el marcador exacto',
    ico: '★',
    total: 1,
    check(myPicks, matches, allPicks, playerId) {
      const hasSolo = matches.filter(hasRes).some(m => {
        const pk = myPicks.find(p => p.match_id === m.id);
        if (!pk || !(pk.status === 'P' || pk.status === 'P ')) return false;
        return !allPicks.some(p => p.match_id === m.id && p.player_id !== playerId && (p.status === 'P' || p.status === 'P '));
      });
      return { progress: hasSolo ? 1 : 0, done: hasSolo };
    },
  },
  {
    id: 'jornada_perfecta',
    title: 'Jornada perfecta',
    desc: 'Todos los picks de una jornada: P o Ac',
    ico: '👑',
    total: 1,
    check(myPicks, matches) {
      const byRound = {};
      for (const m of matches.filter(hasRes)) {
        if (!byRound[m.round_id]) byRound[m.round_id] = [];
        byRound[m.round_id].push(m);
      }
      const done = Object.values(byRound).some(rms =>
        rms.length > 0 && rms.every(m => {
          const pk = myPicks.find(p => p.match_id === m.id);
          return pk && pk.home_score != null && (pk.status === 'P' || pk.status === 'P ' || pk.status === 'Ac');
        })
      );
      return { progress: done ? 1 : 0, done };
    },
  },
  {
    id: 'goleador',
    title: 'El goleador',
    desc: 'Pleno exacto en partido con 4+ goles',
    ico: '⚽',
    total: 1,
    check(myPicks, matches) {
      const done = matches.filter(hasRes).some(m => {
        const pk = myPicks.find(p => p.match_id === m.id);
        return pk && (pk.status === 'P' || pk.status === 'P ') &&
          (Number(m.home_score) + Number(m.away_score)) >= 4;
      });
      return { progress: done ? 1 : 0, done };
    },
  },
  {
    id: 'centurion',
    title: 'Centurión',
    desc: 'Acumular 100 XP',
    ico: '💯',
    total: 100,
    check(myPicks, matches, allPicks, playerId) {
      const { xp } = computeXPFor(playerId);
      return { progress: Math.min(xp, 100), done: xp >= 100 };
    },
  },
];

export function computeMissionsFor(playerId) {
  const { matches, picks } = getState();
  const myPicks = picks.filter(p => p.player_id === playerId);
  return MISSION_DEFS.map(def => ({
    ...def,
    ...def.check(myPicks, matches, picks, playerId),
  }));
}
