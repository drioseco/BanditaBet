// ════════════════════════════════════════════════════════════════════
// Hub de fútbol (piloto · qa26) — tablas + simulador de eliminatorias.
// Datos vía ?action=hub del Apps Script (ESPN normalizado + cacheado).
// Independiente de la polla.
//  · F1: standings de Liga/Libertadores/Sudamericana.
//  · F3/F5: simulador de bracket para las copas, proyectado desde los
//    grupos actuales (top 2 clasifican). El sorteo real 2026 aún no existe.
// ════════════════════════════════════════════════════════════════════
import { getHub, askStats } from './api.js?v=20260607qa44';

let _comp = 'liga';
let _mode = 'tabla';        // 'tabla' | 'bracket'
let _view = 'datos';        // 'datos' | 'ia'
let _wired = false;
let _iaWired = false;
let _groupsCache = {};       // comp → groups (para no refetchear al togglear modo)
let _bracket = null;         // estado del simulador

const HAS_KNOCKOUT = { liga: false, liberta: true, sudamer: true };

export function renderHub() {
  if (!_wired) wire();
  applyView();
  if (_view === 'datos') { syncToolbar(); load(); }
  else renderAsk();
}

function wire() {
  document.querySelectorAll('#hub-views .ft[data-view]').forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.view === _view) return;
      _view = btn.dataset.view;
      renderHub();
    };
  });
  document.querySelectorAll('#hub-comps .hub-comp').forEach(btn => {
    btn.onclick = () => {
      if (btn.classList.contains('on')) return;
      document.querySelectorAll('#hub-comps .hub-comp').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      _comp = btn.dataset.comp;
      if (!HAS_KNOCKOUT[_comp]) _mode = 'tabla';
      _bracket = null;
      syncToolbar();
      load();
    };
  });
  const refresh = document.getElementById('hub-refresh');
  if (refresh) refresh.onclick = () => { _groupsCache = {}; _bracket = null; load(true); };
  _wired = true;
}

// Muestra/oculta los paneles Datos vs IA y marca el tab activo.
function applyView() {
  document.querySelectorAll('#hub-views .ft[data-view]').forEach(b =>
    b.classList.toggle('on', b.dataset.view === _view));
  const datos = document.getElementById('hub-datos');
  const ia = document.getElementById('hub-ia');
  if (datos) datos.classList.toggle('hidden', _view !== 'datos');
  if (ia)    ia.classList.toggle('hidden', _view !== 'ia');
}

// ── Vista "Pregúntale IA" (qa33) ─────────────────────────────────────
const ASK_EXAMPLES = [
  '¿Quién es el goleador histórico de Colo-Colo?',
  '¿Cuándo fue el último Superclásico y cómo terminó?',
  '¿Qué equipos chilenos ganaron la Copa Libertadores?',
];

function renderAsk() {
  const root = document.getElementById('hub-ia');
  if (!root) return;
  if (!root.dataset.built) {
    root.innerHTML = `
      <div class="ask-card">
        <div class="ask-intro">Preguntá sobre fútbol chileno, copas o la selección. Responde con datos y fuentes.</div>
        <textarea id="ask-input" class="ask-input" rows="2" maxlength="500"
          placeholder="Ej: ¿Quién es el goleador histórico de la U?"></textarea>
        <div class="ask-row">
          <div class="ask-chips" id="ask-chips">
            ${ASK_EXAMPLES.map(e => `<button class="ask-chip" type="button">${e}</button>`).join('')}
          </div>
          <button id="ask-send" class="ask-send" type="button">Preguntar</button>
        </div>
        <div id="ask-answer"></div>
      </div>`;
    root.dataset.built = '1';
  }
  if (!_iaWired) wireAsk();
}

function wireAsk() {
  const input = document.getElementById('ask-input');
  const send = document.getElementById('ask-send');
  document.querySelectorAll('#ask-chips .ask-chip').forEach(c => {
    c.onclick = () => { input.value = c.textContent; input.focus(); };
  });
  send.onclick = () => submitAsk();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAsk(); }
  });
  _iaWired = true;
}

async function submitAsk() {
  const input = document.getElementById('ask-input');
  const send = document.getElementById('ask-send');
  const out = document.getElementById('ask-answer');
  const q = (input.value || '').trim();
  if (!q) return;
  send.disabled = true;
  out.innerHTML = `<div class="ask-loading"><span class="ask-spin"></span> Buscando y pensando…</div>`;
  try {
    const r = await askStats(q);
    if (!r || r.ok === false) {
      const msg = r && r.error === 'ai_not_configured'
        ? 'El agente aún no está configurado (falta la API key de Anthropic).'
        : r && r.error === 'ai_daily_limit'
        ? 'Se alcanzó el límite de consultas por hoy. Probá mañana.'
        : `No se pudo responder${r && r.detail ? ': ' + r.detail : '.'}`;
      out.innerHTML = `<div class="ask-err">${msg}</div>`;
      return;
    }
    const ans = (r.answer || 'Sin respuesta.').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    const srcs = (r.sources || []).slice(0, 6);
    const srcHtml = srcs.length ? `
      <div class="ask-sources">
        <div class="ask-sources-h">Fuentes</div>
        ${srcs.map(s => `<a class="ask-src" href="${s.url}" target="_blank" rel="noopener">${(s.title || s.url).replace(/</g,'&lt;')}</a>`).join('')}
      </div>` : '';
    out.innerHTML = `<div class="ask-bubble">${ans}</div>${srcHtml}${r.cached ? '<div class="ask-cached">· respuesta cacheada</div>' : ''}`;
  } catch (e) {
    out.innerHTML = `<div class="ask-err">Error de red: ${e.message}</div>`;
  } finally {
    send.disabled = false;
  }
}

// Muestra/oculta el toggle Tabla/Eliminatorias según la competición.
function syncToolbar() {
  let modeWrap = document.getElementById('hub-modes');
  const comps = document.getElementById('hub-comps');
  if (!comps) return;
  if (!modeWrap) {
    modeWrap = document.createElement('div');
    modeWrap.id = 'hub-modes';
    modeWrap.className = 'hub-modes';
    modeWrap.innerHTML = `
      <button class="hub-mode" data-mode="tabla">Tabla</button>
      <button class="hub-mode" data-mode="bracket">Eliminatorias</button>`;
    comps.after(modeWrap);
    modeWrap.querySelectorAll('.hub-mode').forEach(b => {
      b.onclick = () => {
        if (b.classList.contains('on')) return;
        _mode = b.dataset.mode;
        syncToolbar();
        load();
      };
    });
  }
  modeWrap.style.display = HAS_KNOCKOUT[_comp] ? 'flex' : 'none';
  modeWrap.querySelectorAll('.hub-mode').forEach(b =>
    b.classList.toggle('on', b.dataset.mode === _mode));
}

async function load(fresh = false) {
  const root = document.getElementById('hub-content');
  if (!root) return;
  root.innerHTML = `<div class="hub-loading">Cargando ${_mode === 'bracket' ? 'eliminatorias' : 'tabla'}…</div>`;
  try {
    let groups = _groupsCache[_comp];
    if (!groups || fresh) {
      const r = await getHub('standings', _comp, { fresh });
      if (!r || r.ok === false) throw new Error((r && r.error) || 'sin datos');
      groups = r.groups || [];
      _groupsCache[_comp] = groups;
      _lastMeta = r;
    }
    if (!groups.length) {
      root.innerHTML = `<div class="hub-empty">Todavía no hay datos para esta competición.<br><span class="hub-empty-sub">Puede que no haya arrancado o que la fuente aún no publique posiciones.</span></div>`;
      return;
    }
    if (_mode === 'bracket') {
      renderBracketUI(root, groups);
    } else {
      const single = groups.length === 1;
      root.innerHTML = groups.map(g => groupTable(g, single)).join('');
      root.insertAdjacentHTML('beforeend', footer(_lastMeta || {}));
    }
  } catch (e) {
    root.innerHTML = `<div class="hub-empty">No se pudo cargar.<br><span class="hub-empty-sub">${e.message}</span></div>`;
  }
}
let _lastMeta = null;

function groupTable(g, single) {
  const head = single ? '' : `<div class="hub-group-name">${g.name || 'Grupo'}</div>`;
  const rows = (g.table || []).map(r => row(r)).join('');
  return `
    <div class="hub-tablecard">
      ${head}
      <table class="hub-table">
        <thead>
          <tr>
            <th class="hub-c-pos">#</th>
            <th class="hub-c-team">Equipo</th>
            <th>PJ</th><th>G</th><th>E</th><th>P</th>
            <th class="hub-hide-sm">GF</th><th class="hub-hide-sm">GC</th>
            <th>DG</th><th class="hub-c-pts">Pts</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function row(r) {
  const crest = r.crest
    ? `<img class="hub-crest" src="${r.crest}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : '<span class="hub-crest hub-crest-empty"></span>';
  const dg = (r.dg > 0 ? '+' : '') + (r.dg ?? 0);
  return `
    <tr>
      <td class="hub-c-pos">${r.pos ?? ''}</td>
      <td class="hub-c-team">${crest}<span class="hub-team-name">${r.team || ''}</span></td>
      <td>${num(r.pj)}</td><td>${num(r.g)}</td><td>${num(r.e)}</td><td>${num(r.p)}</td>
      <td class="hub-hide-sm">${num(r.gf)}</td><td class="hub-hide-sm">${num(r.gc)}</td>
      <td>${dg}</td>
      <td class="hub-c-pts">${num(r.pts)}</td>
    </tr>`;
}

function num(v) { return (v == null) ? '–' : v; }

function footer(r) {
  let when = '';
  if (r.fetched_at) {
    const d = new Date(r.fetched_at);
    when = d.toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const cached = r.cached ? ' · desde caché' : '';
  return `<div class="hub-footer">Fuente: ESPN${cached}${when ? ' · actualizado ' + when : ''}. Datos referenciales.</div>`;
}

// ════════════════════════════════════════════════════════════════════
// SIMULADOR DE ELIMINATORIAS (proyección desde grupos)
// Top 2 de cada grupo → 16 clasificados → octavos→final. El usuario
// elige el ganador de cada llave y el cuadro avanza. 100% client-side.
// ════════════════════════════════════════════════════════════════════
const ROUND_LABELS = { r16: 'Octavos', qf: 'Cuartos', sf: 'Semis', final: 'Final' };

function qualifiers(groups) {
  // Ordena grupos por nombre (Group A, B, ...) y toma 1° y 2° de cada uno.
  const sorted = [...groups].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const W = [], R = [];
  for (const g of sorted) {
    const t = g.table || [];
    if (t[0]) W.push({ ...t[0], grp: g.name, seed: '1' + glabel(g.name) });
    if (t[1]) R.push({ ...t[1], grp: g.name, seed: '2' + glabel(g.name) });
  }
  return { W, R };
}
function glabel(name) {
  const m = (name || '').match(/([A-H])\s*$/i);
  return m ? m[1].toUpperCase() : '?';
}

// Construye octavos con cruce que evita rematch del mismo grupo:
// 1A-2B, 1C-2D, 1E-2F, 1G-2H, 1B-2A, 1D-2C, 1F-2E, 1H-2G
function buildBracket(groups) {
  const { W, R } = qualifiers(groups);
  const n = Math.min(W.length, R.length);
  if (n < 2) return null;
  const pairs = [];
  // Reordenar para el cruce clásico; si no hay 8 grupos, cruzamos lo disponible.
  const order = [[0,1],[2,3],[4,5],[6,7],[1,0],[3,2],[5,4],[7,6]];
  for (const [wi, ri] of order) {
    if (W[wi] && R[ri]) pairs.push(tie(W[wi], R[ri]));
  }
  // fallback si <8 grupos: emparejar W[i] vs R[i]
  if (!pairs.length) for (let i = 0; i < n; i++) pairs.push(tie(W[i], R[i]));
  // Necesitamos potencia de 2; recortar al múltiplo más cercano (8/4/2)
  let size = 8; while (size > pairs.length) size /= 2;
  return { r16: pairs.slice(0, size), qf: [], sf: [], final: [], champion: null };
}
function tie(a, b) { return { a: lite(a), b: lite(b), winner: null }; }
function lite(t) { return t ? { team: t.team, crest: t.crest, seed: t.seed } : null; }

// Reconstruye rondas siguientes a partir de los ganadores actuales.
function advance(bk) {
  const rounds = ['r16', 'qf', 'sf', 'final'];
  for (let i = 0; i < rounds.length - 1; i++) {
    const cur = bk[rounds[i]], next = rounds[i + 1];
    const winners = cur.map(t => t.winner);
    const newTies = [];
    for (let j = 0; j < winners.length; j += 2) {
      const a = winners[j], b = winners[j + 1];
      // preservar winner previo si los participantes no cambiaron
      const prev = bk[next][j / 2];
      const keepW = prev && prev.winner &&
        sameTeam(prev.a, a) && sameTeam(prev.b, b) ? prev.winner : null;
      newTies.push({ a, b, winner: keepW });
    }
    bk[next] = newTies;
  }
  bk.champion = bk.final[0] && bk.final[0].winner ? bk.final[0].winner : null;
  return bk;
}
function sameTeam(x, y) { return (x && y && x.team === y.team) || (!x && !y); }

function renderBracketUI(root, groups) {
  if (!_bracket) _bracket = buildBracket(groups);
  if (!_bracket) {
    root.innerHTML = `<div class="hub-empty">Aún no hay suficientes grupos cerrados para proyectar el cuadro.</div>`;
    return;
  }
  advance(_bracket);
  root.innerHTML = `
    <div class="brk-note">
      🔮 <strong>Simulador.</strong> Cuadro proyectado con los <strong>2 mejores de cada grupo</strong> de la tabla actual
      (el sorteo oficial 2026 aún no se realiza). Tocá un equipo para hacerlo ganar la llave y avanzar.
    </div>
    <div class="brk-toolbar">
      <button class="brk-btn" id="brk-seed">⚡ Autocompletar (gana mejor sembrado)</button>
      <button class="brk-btn brk-btn-ghost" id="brk-reset">↺ Reiniciar</button>
      <span class="brk-champ" id="brk-champ"></span>
    </div>
    <div class="brk-wrap">
      ${['r16','qf','sf','final'].map(rk => brkColumn(rk, _bracket[rk])).join('')}
      ${brkChampionCol()}
    </div>`;

  root.querySelectorAll('[data-pick]').forEach(el => {
    el.onclick = () => {
      const [rk, ti, side] = el.dataset.pick.split(':');
      const t = _bracket[rk][+ti];
      const chosen = side === 'a' ? t.a : t.b;
      if (!chosen) return;
      t.winner = (t.winner && t.winner.team === chosen.team) ? null : chosen;
      load();
    };
  });
  document.getElementById('brk-reset').onclick = () => { _bracket = buildBracket(groups); load(); };
  document.getElementById('brk-seed').onclick = () => { autoSeed(_bracket); load(); };
  paintChampion();
}

function autoSeed(bk) {
  // gana el de mejor siembra (1X > 2X; entre dos, letra menor)
  const rank = s => {
    if (!s) return 99;
    const pos = s[0] === '1' ? 0 : 10;
    return pos + (s.charCodeAt(1) - 65);
  };
  for (const rk of ['r16','qf','sf','final']) {
    advance(bk);
    bk[rk].forEach(t => {
      if (!t.a || !t.b) { t.winner = t.a || t.b; return; }
      t.winner = rank(t.a.seed) <= rank(t.b.seed) ? t.a : t.b;
    });
  }
  advance(bk);
}

function brkColumn(rk, ties) {
  const cards = (ties || []).map((t, i) => brkTie(rk, i, t)).join('');
  return `<div class="brk-col"><div class="brk-col-h">${ROUND_LABELS[rk]}</div>${cards || '<div class="brk-empty">—</div>'}</div>`;
}

function brkTie(rk, i, t) {
  return `<div class="brk-tie">
    ${brkSlot(rk, i, 'a', t.a, t.winner)}
    ${brkSlot(rk, i, 'b', t.b, t.winner)}
  </div>`;
}

function brkSlot(rk, i, side, team, winner) {
  if (!team) return `<div class="brk-slot brk-slot-tbd">Por definir</div>`;
  const won = winner && winner.team === team.team;
  const lost = winner && winner.team !== team.team;
  const crest = team.crest
    ? `<img class="brk-crest" src="${team.crest}" alt="" onerror="this.style.visibility='hidden'">`
    : '<span class="brk-crest"></span>';
  return `<div class="brk-slot ${won ? 'brk-won' : ''} ${lost ? 'brk-lost' : ''}" data-pick="${rk}:${i}:${side}">
    ${crest}<span class="brk-team">${team.team}</span><span class="brk-seed">${team.seed || ''}</span>
  </div>`;
}

function brkChampionCol() {
  return `<div class="brk-col brk-col-champ"><div class="brk-col-h">Campeón</div>
    <div class="brk-champion" id="brk-champion"><span class="brk-trophy">🏆</span><div class="brk-champion-name" id="brk-champion-name">¿…?</div></div>
  </div>`;
}

function paintChampion() {
  const c = _bracket.champion;
  const nameEl = document.getElementById('brk-champion-name');
  const topEl = document.getElementById('brk-champ');
  const box = document.getElementById('brk-champion');
  if (c) {
    if (nameEl) nameEl.textContent = c.team;
    if (topEl) topEl.textContent = '🏆 ' + c.team;
    if (box) box.classList.add('brk-champion-set');
  } else {
    if (nameEl) nameEl.textContent = '¿…?';
    if (topEl) topEl.textContent = '';
    if (box) box.classList.remove('brk-champion-set');
  }
}
