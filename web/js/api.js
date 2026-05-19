// ════════════════════════════════════════════════════════════════════
// Cliente HTTP del Apps Script Web App.
// Todos los POST son form-encoded para esquivar el CORS preflight.
// Si CONFIG.API_URL no está configurada, fallback a /data/seed.json.
// ════════════════════════════════════════════════════════════════════
import { CONFIG, API } from './config.js?v=20260516qa10';
import { getState, setState } from './state.js?v=20260516qa10';

async function get(action, params = {}) {
  if (!API()) throw new Error('api_not_configured');
  const url = new URL(API());
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}

async function post(action, params = {}) {
  if (!API()) throw new Error('api_not_configured');
  const body = new URLSearchParams();
  body.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    body.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }
  const res = await fetch(API(), { method: 'POST', body });
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}

// ── Bootstrap ────────────────────────────────────────────────────────
export async function bootstrapState() {
  setState({ loading: true, error: null });
  try {
    if (!API()) throw new Error('no_api_url');
    const data = await get('state');
    return ingestServerState(data);
  } catch (e) {
    console.warn('[api] backend Apps Script no disponible, usando seed.json:', e.message);
    try {
      const seed = await fetch('./data/seed.json').then(r => r.json());
      return ingestServerState({ ...seed, _seed: true });
    } catch (e2) {
      setState({ loading: false, error: 'No se pudo cargar la data inicial. Revisá CONFIG.API_URL en web/js/config.js.' });
      throw e2;
    }
  }
}

export function ingestServerState(data) {
  setState({
    loading:       false,
    error:         null,
    me:            data.me || null,
    players:       data.players      || [],
    competitions:  data.competitions || [],
    rounds:        data.rounds       || [],
    matches:       data.matches      || [],
    picks:         data.picks        || [],
    leaderboard:   data.leaderboard  || [],
    insights:      data.insights     || [],
    lastSyncedAt:  data.last_synced_at || null,
    syncSources:   data.sync_sources   || (data._seed ? 'seed.json (offline)' : null),
  });
  computeFreshness();
  return data;
}

export async function refreshSyncStatus() {
  try {
    const r = await get('sync-status').catch(() => null);
    if (!r) return;
    setState({
      lastSyncedAt: r.last_synced_at,
      syncSources:  r.source,
    });
    computeFreshness();
  } catch {}
}

function computeFreshness() {
  const ts = getState().lastSyncedAt;
  if (!ts) return setState({ syncFreshness: 'stale' });
  const minutes = (Date.now() - new Date(ts).getTime()) / 60000;
  setState({ syncFreshness: minutes < 30 ? 'fresh' : minutes < 24*60 ? 'stale' : 'error' });
}

// ── Operaciones ──────────────────────────────────────────────────────
export async function savePicks(playerName, picksArr) {
  // picks: [{ matchId, home_score, away_score }]
  return post('savePicks', { player: playerName, picks: picksArr });
}

export async function setMatchResult(matchId, { home_score, away_score, factor }) {
  const params = { matchId, home_score, away_score };
  if (factor != null) params.factor = factor;
  return post('setResult', params);
}

export async function addMatch(payload) {
  return post('addMatch', payload);
}

export async function updateFactors(matchId, { factor_home, factor_draw, factor_away }) {
  const params = { matchId };
  if (factor_home != null) params.factor_home = factor_home;
  if (factor_draw != null) params.factor_draw = factor_draw;
  if (factor_away != null) params.factor_away = factor_away;
  return post('updateFactors', params);
}
