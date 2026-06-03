// ════════════════════════════════════════════════════════════════════
// State global de la app — single source of truth en el cliente.
// Cada vista (home/fixtures/picks/stats/admin) lee de aquí.
// Cuando llega data del backend o el usuario edita un pick, mutamos
// state y disparamos un evento 'bb:state' para que las vistas activas
// se re-rendericen.
// ════════════════════════════════════════════════════════════════════

const initial = {
  loading:          true,
  error:            null,

  // user info
  me:               null,    // { id, name, is_admin } o null si no logueado
  picker:           null,    // jugador actualmente "elegido" en la UI (nombre)

  // data
  players:          [],
  competitions:     [],
  rounds:           [],
  matches:          [],      // formato canónico (ver normalize.js)
  picks:            [],
  leaderboard:      [],
  insights:         [],      // momentos / solo-plenos derivados client-side

  // sync metadata
  lastSyncedAt:     null,
  syncSources:      null,
  syncFreshness:    'fresh',  // 'fresh' | 'stale' | 'error'

  // ui
  currentView:      'home',
  currentSheet:     'liga',     // en fixtures
  currentRound:     'all',      // en fixtures
  currentPickSheet: 'liga',     // en picks
  homeScope:        'general',  // en home: 'general' | 'liga' | 'exp:<torneo>'

  // achievements
  badges:           {},         // { Dari: ['t-pleno','t-streak'], ... }
};

let state = { ...initial };

const listeners = new Set();

export function getState() { return state; }

export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error(e); }
  }
  document.dispatchEvent(new CustomEvent('bb:state', { detail: state }));
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ── Helpers que las vistas comparten ─────────────────────────────────
export const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

export const mDate = (m) => {
  if (!m.match_date) return null;
  const d = new Date(m.match_date + 'T12:00');
  d.setHours(0,0,0,0);
  return d;
};
export const isFut    = (m) => { const d = mDate(m); return d && d > TODAY; };

// Un partido cuenta como "jugado" sólo si tiene `result_factor` cargado
// (positivo). El Sheet a veces tiene 0-0 con result "E" como placeholder
// para los partidos pendientes — sin factor, no se jugó.
export const hasRes   = (m) => {
  if (m.home_score === null || m.home_score === undefined) return false;
  if (m.away_score === null || m.away_score === undefined) return false;
  const rf = Number(m.result_factor);
  return Number.isFinite(rf) && rf > 0;
};

export const hasPick  = (m, playerId) => {
  const p = (state.picks || []).find(pk => pk.match_id === m.id && pk.player_id === playerId);
  return !!p && p.home_score != null && p.away_score != null;
};
export const getPick  = (m, playerId) =>
  (state.picks || []).find(pk => pk.match_id === m.id && pk.player_id === playerId);

export const getPlayerByName = (name) => state.players.find(p => p.name === name);
export const getPlayerById   = (id)   => state.players.find(p => p.id === id);

export const playerColor = (name) => {
  const p = getPlayerByName(name);
  return p?.color || '#1F1A2E';
};

export const fmtPts = (n) => {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toFixed(2).replace(/\.?0+$/, '') || '0';
};

// hex → "r,g,b" para usar en rgba()
export const h2r = (h) => [
  parseInt(h.slice(1,3), 16),
  parseInt(h.slice(3,5), 16),
  parseInt(h.slice(5,7), 16),
].join(',');

// horas hasta el partido (puede ser negativo si ya empezó)
export const hoursUntil = (m) => {
  if (!m.match_date) return null;
  const dt = new Date(m.match_date + 'T' + (m.match_time || '12:00'));
  return (dt - new Date()) / 3600000;
};

// estado del partido para la UI
export const matchPhase = (m) => {
  const h = hoursUntil(m);
  if (hasRes(m)) return 'finished';
  if (h == null) return 'scheduled';
  if (h < 0 && h > -3) return 'live';     // partido en curso (ventana 3h)
  if (h <= 0) return 'awaiting';           // jugado pero sin marcador cargado
  if (h < 1) return 'imminent';            // < 1h
  if (h < 24) return 'today';
  return 'scheduled';
};

// agrupador genérico
export const groupBy = (arr, key) => arr.reduce((acc, x) => {
  const k = typeof key === 'function' ? key(x) : x[key];
  (acc[k] = acc[k] || []).push(x);
  return acc;
}, {});
