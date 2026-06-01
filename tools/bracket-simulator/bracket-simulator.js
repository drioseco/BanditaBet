// ════════════════════════════════════════════════════════════════════
// bracket-simulator.js — Simulador de eliminatorias (single-elimination)
// ────────────────────────────────────────────────────────────────────
// Herramienta vanilla JS, sin dependencias, autocontenida (inyecta su
// propio CSS). Copiá esta carpeta a cualquier proyecto.
//
// USO:
//   import { createBracketSimulator } from './bracket-simulator.js';
//   const sim = createBracketSimulator(document.getElementById('app'), {
//     groups: [{ name:'Group A', table:[{team:'Flamengo', crest:'...'}, {...}] }, ...],
//     qualifyPerGroup: 2,            // cuántos avanzan por grupo (default 2)
//     title: 'Simulador',
//     note: 'Tocá un equipo para hacerlo avanzar.',
//     onChampion: (team) => console.log('campeón', team),
//   });
//   sim.autoFill();   sim.reset();   sim.getState();   sim.destroy();
//
// También acepta entrants directos en vez de grupos:
//   createBracketSimulator(el, { entrants: [{team, crest, seed}, ... (8/16/32)] })
//
// Sin build, sin npm. Theming vía variables CSS --bsim-* (ver README).
// ════════════════════════════════════════════════════════════════════

const DEFAULT_LABELS = { 16: 'Octavos', 8: 'Cuartos', 4: 'Semis', 2: 'Final' };

export function createBracketSimulator(container, config = {}) {
  if (!container) throw new Error('bracket-simulator: falta el contenedor');
  injectStyles();

  const cfg = {
    qualifyPerGroup: 2,
    seeding: 'auto',                 // 'auto' | 'cross' | 'as-is'
    title: 'Simulador de eliminatorias',
    note: 'Tocá un equipo para hacerlo ganar la llave y avanzar.',
    championLabel: 'Campeón',
    labels: {},                      // override de { 16:'…', 8:'…', ... }
    showControls: true,
    onChange: null,
    onChampion: null,
    ...config,
  };

  let entrants = [];
  let rounds = [];                   // [[{a,b,winner}, ...], ...]
  let champion = null;
  let lastChampionTeam = undefined;

  function setData(data = {}) {
    Object.assign(cfg, data);
    entrants = buildEntrants(cfg);
    build();
    render();
  }

  function build() {
    const first = firstRound(entrants, cfg);
    rounds = [first];
    let n = first.length;
    while (n > 1) { rounds.push(emptyRound(n / 2)); n = n / 2; }
    propagate();
  }

  function propagate() {
    for (let i = 0; i < rounds.length - 1; i++) {
      const cur = rounds[i], nextIdx = i + 1;
      const winners = cur.map(t => t.winner);
      const next = [];
      for (let j = 0; j < winners.length; j += 2) {
        const a = winners[j] || null, b = winners[j + 1] || null;
        const prev = rounds[nextIdx][j / 2];
        const keep = prev && prev.winner && same(prev.a, a) && same(prev.b, b) ? prev.winner : null;
        next.push({ a, b, winner: keep });
      }
      rounds[nextIdx] = next;
    }
    const lastTie = rounds[rounds.length - 1][0];
    champion = lastTie && lastTie.winner ? lastTie.winner : null;
    if (cfg.onChange) cfg.onChange(getState());
    const t = champion ? champion.team : null;
    if (t !== lastChampionTeam) { lastChampionTeam = t; if (cfg.onChampion) cfg.onChampion(champion); }
  }

  function pick(ri, ti, side) {
    const tie = rounds[ri] && rounds[ri][ti];
    if (!tie) return;
    const chosen = side === 'a' ? tie.a : tie.b;
    if (!chosen) return;
    tie.winner = (tie.winner && tie.winner.team === chosen.team) ? null : chosen;
    propagate();
    render();
  }

  function autoFill() {
    for (let i = 0; i < rounds.length; i++) {
      propagate();
      rounds[i].forEach(t => {
        if (!t.a || !t.b) { t.winner = t.a || t.b || null; return; }
        t.winner = (rankOf(t.a) <= rankOf(t.b)) ? t.a : t.b;
      });
    }
    propagate();
    render();
  }

  function reset() { build(); render(); }

  function getState() {
    return {
      champion: champion ? { ...champion } : null,
      rounds: rounds.map(r => r.map(t => ({
        a: t.a ? { ...t.a } : null,
        b: t.b ? { ...t.b } : null,
        winner: t.winner ? { ...t.winner } : null,
      }))),
    };
  }

  function destroy() { container.innerHTML = ''; container.__bsim = null; }

  // ── Render ────────────────────────────────────────────────────────
  function render() {
    const cols = rounds.map((ties, ri) => column(ti(ri), ties, ri)).join('');
    container.innerHTML = `
      <div class="bsim">
        ${header()}
        ${cfg.showControls ? controls() : ''}
        <div class="bsim-board">
          ${cols}
          ${championCol()}
        </div>
      </div>`;
    wire();
  }

  function header() {
    if (!cfg.title && !cfg.note) return '';
    return `<div class="bsim-head">
      ${cfg.title ? `<h3 class="bsim-title">${esc(cfg.title)}</h3>` : ''}
      ${cfg.note ? `<p class="bsim-note">${cfg.note}</p>` : ''}
    </div>`;
  }

  function controls() {
    const champ = champion ? `🏆 ${esc(champion.team)}` : '';
    return `<div class="bsim-bar">
      <button class="bsim-btn" data-act="autofill">⚡ Autocompletar</button>
      <button class="bsim-btn bsim-btn-ghost" data-act="reset">↺ Reiniciar</button>
      <span class="bsim-champ-inline">${champ}</span>
    </div>`;
  }

  function column(label, ties, ri) {
    const cards = (ties || []).map((t, i) => tieCard(ri, i, t)).join('') || '<div class="bsim-tbd-col">—</div>';
    return `<div class="bsim-col"><div class="bsim-col-h">${esc(label)}</div>${cards}</div>`;
  }

  function tieCard(ri, i, t) {
    return `<div class="bsim-tie">${slot(ri, i, 'a', t.a, t.winner)}${slot(ri, i, 'b', t.b, t.winner)}</div>`;
  }

  function slot(ri, i, side, team, winner) {
    if (!team) return `<div class="bsim-slot bsim-tbd">Por definir</div>`;
    const won = winner && winner.team === team.team;
    const lost = winner && winner.team !== team.team;
    const crest = team.crest
      ? `<img class="bsim-crest" src="${esc(team.crest)}" alt="" onerror="this.style.visibility='hidden'">`
      : '<span class="bsim-crest"></span>';
    return `<div class="bsim-slot ${won ? 'bsim-won' : ''} ${lost ? 'bsim-lost' : ''}" data-pick="${ri}:${i}:${side}">
      ${crest}<span class="bsim-team">${esc(team.team)}</span><span class="bsim-seed">${esc(team.seed || '')}</span>
    </div>`;
  }

  function championCol() {
    const set = champion ? 'bsim-champion-set' : '';
    const name = champion ? esc(champion.team) : '¿…?';
    return `<div class="bsim-col bsim-col-champ">
      <div class="bsim-col-h">${esc(cfg.championLabel)}</div>
      <div class="bsim-champion ${set}"><span class="bsim-trophy">🏆</span><div class="bsim-champion-name">${name}</div></div>
    </div>`;
  }

  function wire() {
    const root = container.querySelector('.bsim');
    if (!root) return;
    root.onclick = (e) => {
      const slotEl = e.target.closest('[data-pick]');
      if (slotEl) { const [ri, i, s] = slotEl.dataset.pick.split(':'); return pick(+ri, +i, s); }
      const btn = e.target.closest('[data-act]');
      if (btn) { if (btn.dataset.act === 'autofill') autoFill(); else reset(); }
    };
  }

  // label de una ronda según cuántos equipos entran
  function ti(ri) {
    const teamsInRound = rounds[ri].length * 2;
    const labels = { ...DEFAULT_LABELS, ...cfg.labels };
    return labels[teamsInRound] || `Ronda de ${teamsInRound}`;
  }

  container.__bsim = { reset, autoFill, getState, setData, destroy };
  setData({});
  return container.__bsim;
}

// ── Helpers de datos ──────────────────────────────────────────────────
function buildEntrants(cfg) {
  if (cfg.entrants && cfg.entrants.length) {
    return cfg.entrants.map((e, idx) => ({ team: e.team, crest: e.crest || null, seed: e.seed ?? '', rank: e.rank ?? idx }));
  }
  const perGroup = cfg.qualifyPerGroup || 2;
  const groups = [...(cfg.groups || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const ents = [];
  groups.forEach((g, gi) => {
    (g.table || []).slice(0, perGroup).forEach((t, pos) => {
      ents.push({
        team: t.team, crest: t.crest || null,
        seed: (pos + 1) + glabel(g.name),
        rank: pos * 100 + gi,            // todos los 1° rankean antes que los 2°
        _grp: g.name, _pos: pos,
      });
    });
  });
  return ents;
}

function firstRound(ents, cfg) {
  const size = pow2Floor(ents.length);
  const isGroups = ents.length && ents.every(e => e._grp != null);
  const balanced = isGroups &&
    ents.filter(e => e._pos === 0).length === ents.filter(e => e._pos === 1).length;
  const useCross = (cfg.seeding === 'cross') ||
    (cfg.seeding === 'auto' && balanced && ents.length === 16);

  if (useCross) {
    const W = ents.filter(e => e._pos === 0);
    const R = ents.filter(e => e._pos === 1);
    const order = [[0, 1], [2, 3], [4, 5], [6, 7], [1, 0], [3, 2], [5, 4], [7, 6]];
    const pairs = [];
    for (const [wi, ri] of order) if (W[wi] && R[ri]) pairs.push(mkTie(W[wi], R[ri]));
    if (pairs.length) return pairs;
  }
  // genérico: recortar a potencia de 2 y emparejar 0-1, 2-3, …
  const list = ents.slice(0, size);
  const pairs = [];
  for (let i = 0; i < list.length; i += 2) pairs.push(mkTie(list[i], list[i + 1]));
  return pairs;
}

function emptyRound(n) { const r = []; for (let i = 0; i < n; i++) r.push({ a: null, b: null, winner: null }); return r; }
function mkTie(a, b) { return { a: lite(a), b: lite(b), winner: null }; }
function lite(t) { return t ? { team: t.team, crest: t.crest || null, seed: t.seed || '', rank: t.rank ?? 999 } : null; }
function rankOf(t) { return (t && typeof t.rank === 'number') ? t.rank : 999; }
function same(x, y) { return (x && y && x.team === y.team) || (!x && !y); }
function glabel(name) { const m = String(name || '').match(/([A-Z])\s*$/i); return m ? m[1].toUpperCase() : ''; }
function pow2Floor(n) { let p = 1; while (p * 2 <= n) p *= 2; return Math.max(p, 2); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ── CSS autoinyectado (idempotente) ───────────────────────────────────
let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected || document.getElementById('bsim-styles')) { _stylesInjected = true; return; }
  const el = document.createElement('style');
  el.id = 'bsim-styles';
  el.textContent = CSS;
  document.head.appendChild(el);
  _stylesInjected = true;
}

const CSS = `
.bsim {
  --bsim-accent: #7f1d2a;
  --bsim-ink: #1f1a2e;
  --bsim-bg: #f4ecd8;
  --bsim-line: rgba(31,26,46,.18);
  --bsim-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --bsim-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: var(--bsim-ink); font-family: var(--bsim-font);
}
.bsim * { box-sizing: border-box; }
.bsim-title { font-size: 1.4rem; margin: 0 0 4px; }
.bsim-note {
  font-family: var(--bsim-mono); font-size: .72rem; line-height: 1.5;
  background: color-mix(in srgb, var(--bsim-accent) 10%, transparent);
  border-left: 3px solid var(--bsim-accent); padding: 9px 11px; margin: 0 0 14px;
}
.bsim-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.bsim-btn {
  font-family: var(--bsim-mono); font-size: .62rem; font-weight: 700;
  letter-spacing: .5px; text-transform: uppercase; cursor: pointer;
  background: var(--bsim-ink); color: var(--bsim-bg); border: none;
  padding: 7px 12px; border-radius: 3px; box-shadow: 2px 2px 0 var(--bsim-accent);
}
.bsim-btn:active { transform: translate(1px,1px); box-shadow: none; }
.bsim-btn-ghost { background: transparent; color: var(--bsim-ink); border: 1.5px solid var(--bsim-ink); box-shadow: none; }
.bsim-champ-inline { font-weight: 700; color: var(--bsim-accent); margin-left: auto; }
.bsim-board { display: flex; gap: 18px; overflow-x: auto; padding-bottom: 12px; align-items: stretch; }
.bsim-col { min-width: 170px; display: flex; flex-direction: column; gap: 12px; justify-content: space-around; }
.bsim-col-champ { min-width: 150px; justify-content: center; }
.bsim-col-h {
  font-family: var(--bsim-mono); font-size: .58rem; font-weight: 700;
  letter-spacing: 2px; text-transform: uppercase; opacity: .55; text-align: center; padding-bottom: 4px;
}
.bsim-tie { border: 1.5px solid var(--bsim-ink); background: var(--bsim-bg); box-shadow: 2px 2px 0 var(--bsim-ink); overflow: hidden; }
.bsim-slot {
  display: flex; align-items: center; gap: 7px; padding: 7px 8px; cursor: pointer;
  font-family: var(--bsim-mono); font-size: .72rem; border-bottom: 1px dashed var(--bsim-line);
}
.bsim-tie .bsim-slot:last-child { border-bottom: none; }
.bsim-slot:hover { background: color-mix(in srgb, var(--bsim-accent) 12%, transparent); }
.bsim-tbd { color: color-mix(in srgb, var(--bsim-ink) 40%, transparent); cursor: default; font-style: italic; }
.bsim-tbd:hover { background: none; }
.bsim-won { background: var(--bsim-accent); color: var(--bsim-bg); font-weight: 700; }
.bsim-won:hover { background: var(--bsim-accent); }
.bsim-lost { opacity: .42; }
.bsim-crest { width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; }
.bsim-team { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bsim-seed { font-size: .55rem; opacity: .55; }
.bsim-won .bsim-seed { opacity: .8; }
.bsim-tbd-col { opacity: .4; text-align: center; font-family: var(--bsim-mono); }
.bsim-champion { border: 2.5px dashed var(--bsim-ink); padding: 18px 12px; text-align: center; background: var(--bsim-bg); }
.bsim-champion-set {
  border-style: solid; border-color: var(--bsim-accent);
  background: var(--bsim-accent); color: var(--bsim-bg); box-shadow: 3px 3px 0 var(--bsim-ink);
}
.bsim-trophy { font-size: 1.8rem; display: block; margin-bottom: 6px; }
.bsim-champion-name { font-size: 1.05rem; font-weight: 700; line-height: 1.1; }
@media (max-width: 600px) { .bsim-col { min-width: 150px; } }
`;
