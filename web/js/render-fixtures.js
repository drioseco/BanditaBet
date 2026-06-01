// ════════════════════════════════════════════════════════════════════
// Fixtures view — todos los partidos por torneo/jornada, con picks de
// los 4 jugadores tipo ticket de cromo.
// ════════════════════════════════════════════════════════════════════
import { getState, setState, hasRes, hasPick, isFut, hoursUntil, mDate, TODAY } from './state.js?v=20260531qa25';
import { CONFIG } from './config.js?v=20260531qa25';
import { attachCountdown, toast } from './game-fx.js?v=20260531qa25';
import { updateFactors as apiUpdateFactors } from './api.js?v=20260531qa25';
import { teamShieldHTML } from './team-logos.js?v=20260531qa25';

// Un partido "tiene cuotas" sólo si Fac L, E y V están cargados y son > 0.
function hasFactors(m) {
  const fl = Number(m.factor_home), fe = Number(m.factor_draw), fv = Number(m.factor_away);
  return Number.isFinite(fl) && fl > 0
      && Number.isFinite(fe) && fe > 0
      && Number.isFinite(fv) && fv > 0;
}

const PLAYERS = CONFIG.PLAYERS;

// Orden de lista — persiste durante la sesión (no global state: es puramente UI)
let sortDesc = true; // true = más reciente primero (default, útil para picks pendientes)

function isUpset(m) {
  if (!hasRes(m)) return false;
  const r = m.home_score > m.away_score ? 'L' : m.home_score < m.away_score ? 'V' : 'E';
  const f = r === 'L' ? m.factor_home : r === 'E' ? m.factor_draw : m.factor_away;
  return f && f >= 3.5;
}

function getConsensus(m) {
  const { picks, players } = getState();
  const counts = {};
  for (const p of players) {
    const pk = picks.find(x => x.match_id === m.id && x.player_id === p.id);
    if (!pk || pk.home_score == null) continue;
    const r = pk.home_score > pk.away_score ? 'L' : pk.home_score < pk.away_score ? 'V' : 'E';
    counts[r] = (counts[r] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length && sorted[0][1] >= 3 ? { result: sorted[0][0], count: sorted[0][1] } : null;
}

function getSoloWinner(m) {
  if (!hasRes(m)) return null;
  const { picks, players } = getState();
  const winners = [];
  for (const p of players) {
    const pk = picks.find(x => x.match_id === m.id && x.player_id === p.id);
    if (pk && (pk.status === 'P' || pk.status === 'P ')) winners.push(p);
  }
  return winners.length === 1 ? winners[0] : null;
}

// Devuelve el nombre de la próxima jornada para una competencia:
// la jornada que tenga el partido pendiente más cercano a hoy. Si no hay
// pendientes, devuelve la última jornada con partidos jugados.
function nextRoundName(compId, matches, rounds) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const pending = matches
    .filter(m => m.competition_id === compId && !hasResLocal(m))
    .map(m => ({ m, d: m.match_date ? new Date(m.match_date + 'T12:00') : null }))
    .filter(x => x.d)
    .sort((a, b) => Math.abs(a.d - today) - Math.abs(b.d - today));
  if (pending.length) {
    const r = rounds.find(rr => rr.id === pending[0].m.round_id);
    return r?.name || null;
  }
  // Fallback: última con resultado
  const played = matches
    .filter(m => m.competition_id === compId && hasResLocal(m))
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
  if (played.length) {
    const r = rounds.find(rr => rr.id === played[0].round_id);
    return r?.name || null;
  }
  return null;
}
function hasResLocal(m) {
  if (m.home_score == null || m.away_score == null) return false;
  const rf = Number(m.result_factor);
  return Number.isFinite(rf) && rf > 0;
}

export function renderFixtures() {
  const { matches, players, currentSheet, rounds } = getState();
  let { currentRound } = getState();
  const data = matches.filter(m => m.competition_id === currentSheet);
  const playerByName = Object.fromEntries(players.map(p => [p.name, p]));

  // Resolver "next" → la próxima jornada (sticky para el primer render
  // y cuando se cambia de competencia).
  if (currentRound === 'all' || currentRound == null) {
    const next = nextRoundName(currentSheet, matches, rounds);
    if (next) {
      currentRound = next;
      setState({ currentRound: next });
    }
  }

  // jornada filters
  const jornadas = [...new Set(rounds
    .filter(r => r.competition_id === currentSheet)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map(r => r.name))];
  const ff = document.getElementById('fec-filters');
  if (ff) {
    ff.innerHTML = '<span class="flt-lbl">Jornada:</span>';
    const all = makeFilter('Todas', currentRound === 'all',
      () => { setState({ currentRound: 'all' }); renderFixtures(); });
    ff.appendChild(all);
    for (const j of jornadas) {
      ff.appendChild(makeFilter(j, currentRound === j,
        () => { setState({ currentRound: j }); renderFixtures(); }));
    }
    const sortBtn = document.createElement('button');
    sortBtn.className = 'ft ft-sort';
    sortBtn.textContent = sortDesc ? '↓ Reciente' : '↑ Antiguo';
    sortBtn.title = sortDesc ? 'Mostrando más reciente primero' : 'Mostrando más antiguo primero';
    sortBtn.onclick = () => { sortDesc = !sortDesc; renderFixtures(); };
    ff.appendChild(sortBtn);
  }

  // sheet filters (Liga / Experto)
  document.querySelectorAll('#s-fixtures .ft[data-sheet]').forEach(b => {
    const isOn = b.dataset.sheet === currentSheet;
    b.classList.toggle('on', isOn);
  });

  // group by round (preservando display_order)
  const ordered = data.slice().sort((a, b) => {
    const ra = rounds.find(r => r.id === a.round_id);
    const rb = rounds.find(r => r.id === b.round_id);
    const da = ra?.display_order ?? 999;
    const db = rb?.display_order ?? 999;
    if (da !== db) return sortDesc ? db - da : da - db;
    return sortDesc
      ? new Date(b.match_date) - new Date(a.match_date)
      : new Date(a.match_date) - new Date(b.match_date);
  });
  const filtered = currentRound === 'all'
    ? ordered
    : ordered.filter(m => {
        const r = rounds.find(rr => rr.id === m.round_id);
        return r?.name === currentRound;
      });

  const list = document.getElementById('fixtures-list');
  if (!list) return;
  list.innerHTML = '';
  let lastRoundId = null;
  for (const m of filtered) {
    const round = rounds.find(r => r.id === m.round_id);
    if (m.round_id !== lastRoundId && round) {
      const hd = document.createElement('div');
      hd.className = 'jornada-hdr';
      hd.textContent = round.name;
      list.appendChild(hd);
      lastRoundId = m.round_id;
    }
    list.appendChild(buildFixtureCard(m, playerByName));
  }
}

function makeFilter(label, on, onClick) {
  const b = document.createElement('button');
  b.className = 'ft' + (on ? ' on' : '');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function buildFixtureCard(m, playerByName) {
  const { picks } = getState();
  const card = document.createElement('div');
  const fut = isFut(m), hr = hasRes(m);
  const h = hoursUntil(m);
  const ds = m.match_date ? new Date(m.match_date + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '—';
  const inds = [];
  if (hr && isUpset(m)) inds.push(`<span class="ind ind-upset">⚡ Sorpresón</span>`);
  const cons = getConsensus(m);
  if (cons && cons.count >= 3) inds.push(`<span class="ind ind-cons">✓ ${cons.count}/4 de acuerdo</span>`);
  const solo = getSoloWinner(m);
  if (solo) inds.push(`<span class="ind ind-solo" style="color:${solo.color};border-color:${solo.color}">★ Sólo lo vio ${solo.name}</span>`);
  if (!hr && h != null && h > 0 && h < 48) inds.push(`<span class="ind ind-urgent">⏰ ${h < 1 ? '¡Ya!' : Math.round(h) + 'h'}</span>`);

  let scoreHTML;
  if (hr) {
    scoreHTML = `<div class="score-cap">${m.home_score}−${m.away_score}</div>
      <div class="score-sub">FT · fac ${m.result_factor != null ? Number(m.result_factor).toFixed(2) : '—'}</div>`;
  } else {
    scoreHTML = `<div class="score-cap pending">${ds}</div><div class="score-sub">${fut ? 'próximo' : 'pendiente'}</div>`;
  }

  const pickCells = PLAYERS.map(name => {
    const player = playerByName[name];
    if (!player) return '';
    const pk = picks.find(x => x.match_id === m.id && x.player_id === player.id);
    const c = player.color;
    const hasP = pk && pk.home_score != null;
    if (!hr) {
      return `<div class="fpick">
        <div class="fpick-hd">${player.avatar_url ? `<img src="${player.avatar_url}" onerror="this.style.display='none'">` : ''}<span style="color:${c}">${name}</span></div>
        <div class="fpick-score" style="color:${hasP ? c : 'rgba(31,26,46,.22)'}">${hasP ? `${pk.home_score}-${pk.away_score}` : '—'}</div>
        <div class="fpick-pts fut">—</div>
      </div>`;
    }
    if (!hasP) {
      return `<div class="fpick">
        <div class="fpick-hd"><span style="color:${c}">${name}</span></div>
        <div class="fpick-score" style="color:var(--bb-tomate)">WO</div>
        <div class="fpick-pts WO">WO</div>
      </div>`;
    }
    const cls = (pk.status === 'P' || pk.status === 'P ') ? 'P' : pk.status === 'Ac' ? 'Ac' : 'miss';
    const lbl = (cls === 'P' || cls === 'Ac') ? `+${Number(pk.points).toFixed(2)}` : '✗';
    return `<div class="fpick">
      <div class="fpick-hd">${player.avatar_url ? `<img src="${player.avatar_url}" onerror="this.style.display='none'">` : ''}<span style="color:${c}">${name}</span></div>
      <div class="fpick-score" style="color:${cls !== 'miss' ? c : 'rgba(31,26,46,.32)'}">${pk.home_score}-${pk.away_score}</div>
      <div class="fpick-pts ${cls}">${lbl}</div>
    </div>`;
  }).join('');

  // Inline editor de cuotas: aparece si el partido NO tiene cuotas, NO se jugó
  // todavía, y hay un jugador logueado.
  const { me } = getState();
  const showFactorsEditor = !hr && !hasFactors(m) && me;
  const factorsHTML = showFactorsEditor ? `
    <div class="fcard-factors" data-match-id="${m.id}">
      <div class="fcf-lbl">Cargar cuotas:</div>
      <div class="fcf-inputs">
        <input type="number" step="0.01" class="fcf-i" data-k="fl" placeholder="Fac L" value="${m.factor_home ?? ''}">
        <input type="number" step="0.01" class="fcf-i" data-k="fe" placeholder="Fac E" value="${m.factor_draw ?? ''}">
        <input type="number" step="0.01" class="fcf-i" data-k="fv" placeholder="Fac V" value="${m.factor_away ?? ''}">
        <button class="fcf-save" data-match-id="${m.id}">★ Guardar</button>
      </div>
    </div>` : '';

  // Strip de cuotas grandes y visibles — la "firma" del juego.
  // Si el partido ya se jugó, resaltamos el factor del resultado (el que se cobra).
  let winnerKey = null;
  if (hr) {
    winnerKey = m.home_score > m.away_score ? 'L' : m.home_score < m.away_score ? 'V' : 'E';
  }
  const oddsHTML = hasFactors(m) ? `
    <div class="fcard-odds${hr ? ' played' : ''}">
      <div class="fco-cell${winnerKey === 'L' ? ' win' : ''}">
        <div class="fco-lbl">${teamShieldHTML(m.home_team, 'sm')}L · ${m.home_team}</div>
        <div class="fco-val">${Number(m.factor_home).toFixed(2)}</div>
      </div>
      <div class="fco-cell${winnerKey === 'E' ? ' win' : ''}">
        <div class="fco-lbl">Empate</div>
        <div class="fco-val">${Number(m.factor_draw).toFixed(2)}</div>
      </div>
      <div class="fco-cell${winnerKey === 'V' ? ' win' : ''}">
        <div class="fco-lbl">${teamShieldHTML(m.away_team, 'sm')}V · ${m.away_team}</div>
        <div class="fco-val">${Number(m.factor_away).toFixed(2)}</div>
      </div>
    </div>` : '';

  card.className = `fcard${fut ? ' future' : ''}${!hr && h != null && h > 0 && h < 12 ? ' urgent' : ''}`;
  card.innerHTML = `
    <div class="fcard-match">
      <div class="fcard-date"><span class="fcd-d">${ds}</span></div>
      <div class="fcard-sb">
        <div class="fcard-home">${teamShieldHTML(m.home_team, 'md')}${m.home_team}</div>
        <div style="text-align:center">${scoreHTML}</div>
        <div class="fcard-away">${m.away_team}${teamShieldHTML(m.away_team, 'md')}</div>
      </div>
      ${hr && m.result_factor != null ? `<div class="fcard-meta"><div class="fcard-fac">${Number(m.result_factor).toFixed(2)}<small>Factor</small></div></div>` : ''}
    </div>
    ${inds.length ? `<div class="fcard-inds">${inds.join('')}</div>` : ''}
    ${oddsHTML}
    ${factorsHTML}
    <div class="fcard-picks">${pickCells}</div>`;

  if (showFactorsEditor) {
    const btn = card.querySelector('.fcf-save');
    btn.onclick = () => saveInlineFactors(m.id, card, btn);
  }

  return card;
}

async function saveInlineFactors(matchId, card, btn) {
  const inputs = card.querySelectorAll('.fcf-i');
  const vals = {};
  inputs.forEach(i => { vals[i.dataset.k] = parseFloat(i.value); });
  const { fl, fe, fv } = vals;
  if (isNaN(fl) || isNaN(fe) || isNaN(fv)) {
    toast('Completá las 3 cuotas (L / E / V)', 'err');
    return;
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Guardando…';
  try {
    const res = await apiUpdateFactors(matchId, {
      factor_home: fl, factor_draw: fe, factor_away: fv,
    });
    if (!res.ok) throw new Error(res.error || 'update_failed');
    toast(`★ Cuotas guardadas — L:${fl} E:${fe} V:${fv}`);
    // merge optimista
    const ms = getState().matches.slice();
    const idx = ms.findIndex(x => x.id === matchId);
    if (idx >= 0) {
      ms[idx] = { ...ms[idx], factor_home: fl, factor_draw: fe, factor_away: fv };
    }
    setState({ matches: ms });
    renderFixtures();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
    btn.disabled = false;
    btn.textContent = original;
  }
}
