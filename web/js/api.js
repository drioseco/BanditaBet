// ════════════════════════════════════════════════════════════════════
// Cliente HTTP del Apps Script Web App.
// Todos los POST son form-encoded para esquivar el CORS preflight.
// Si CONFIG.API_URL no está configurada, fallback a /data/seed.json.
// ════════════════════════════════════════════════════════════════════
import { CONFIG, API } from './config.js?v=20260603qa33';
import { getState, setState } from './state.js?v=20260603qa33';

// ── (qa30) PIN de admin eliminado ───────────────────────────────────
// Las acciones de Gestión ya no requieren PIN; postAdmin es un alias de post.
const postAdmin = post;

// fetch con timeout (qa29): un request colgado no debe trabar la app 60s.
async function fetchTO(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function get(action, params = {}) {
  if (!API()) throw new Error('api_not_configured');
  const url = new URL(API());
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetchTO(url.toString());
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
  const res = await fetchTO(API(), { method: 'POST', body });
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}

// ── Caché de estado en cliente (qa29 · stale-while-revalidate) ───────
const STATE_CACHE_KEY = 'bb_state_cache';

function saveStateCache(data) {
  try { localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(data)); } catch {}
}
function loadStateCache() {
  try { const raw = localStorage.getItem(STATE_CACHE_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

// Pinta al instante desde la caché local si existe (la llama app.js antes del
// fetch). Devuelve true si había caché usable.
export function primeFromCache() {
  const cached = loadStateCache();
  if (cached && (cached.players || []).length) {
    ingestServerState({ ...cached, _cached: true });
    return true;
  }
  return false;
}

// ── Bootstrap ────────────────────────────────────────────────────────
export async function bootstrapState() {
  const hadCache = (loadStateCache() || {}).players != null;
  if (!hadCache) setState({ loading: true, error: null });
  try {
    if (!API()) throw new Error('no_api_url');
    const data = await get('state');
    saveStateCache(data);            // guardar para la próxima visita
    return ingestServerState(data);  // re-render con data fresca
  } catch (e) {
    console.warn('[api] backend no disponible:', e.message);
    if (hadCache) return;            // ya pintamos algo usable desde caché
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
  return postAdmin('setResult', params);
}

export async function addMatch(payload) {
  return postAdmin('addMatch', payload);
}

export async function updateFactors(matchId, { factor_home, factor_draw, factor_away }) {
  const params = { matchId };
  if (factor_home != null) params.factor_home = factor_home;
  if (factor_draw != null) params.factor_draw = factor_draw;
  if (factor_away != null) params.factor_away = factor_away;
  return postAdmin('updateFactors', params);
}

// qa17 — Importar resultados desde API-Football (sandbox)
export async function fetchResults({ from, to } = {}) {
  return postAdmin('fetchResults', { from: from || '', to: to || '' });
}
export async function clearSandbox() {
  return postAdmin('clearSandbox', {});
}

// qa21 — Propuestas de cuotas desde API externa
export async function fetchOdds({ from, to } = {}) {
  return postAdmin('fetchOdds', { from: from || '', to: to || '' });
}

// qa26 — Hub de fútbol (datos oficiales ESPN, solo lectura)
export async function getHub(kind, comp, { fresh } = {}) {
  return get('hub', { kind, comp, ...(fresh ? { fresh: '1' } : {}) });
}

// qa33 — Agente IA de estadísticas. POST para no exponer la pregunta en la URL.
export async function askStats(q) {
  return post('hubAsk', { q });
}
