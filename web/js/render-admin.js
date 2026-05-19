// Admin view — cargar resultados, agregar fixtures, info de sync.
import { getState, setState } from './state.js?v=20260516qa10';
import { setMatchResult, addMatch as apiAddMatch, updateFactors as apiUpdateFactors, refreshSyncStatus } from './api.js?v=20260516qa10';
import { toast, fireConfetti } from './game-fx.js?v=20260516qa10';

export function renderAdmin() {
  fillRoundSel('a');
  fillRoundSel('f');
  refreshSyncStatus();

  const helpEl = document.getElementById('sync-help-info');
  if (helpEl) {
    const { lastSyncedAt, syncSources, syncFreshness } = getState();
    helpEl.innerHTML = lastSyncedAt
      ? `<strong>Última sincronización:</strong> ${new Date(lastSyncedAt).toLocaleString('es-CL')} (${syncFreshness}). Fuente: ${syncSources || '—'}.`
      : `<strong>Aún no hay sincronizaciones registradas.</strong> Configurá el Apps Script en el Sheet (ver <code>apps-script/README.md</code>) para que los cambios lleguen acá automáticamente.`;
  }

  // wire up botones (solo una vez)
  if (!renderAdmin._wired) {
    document.getElementById('a-sheet').onchange = () => { fillRoundSel('a'); clearMatchList('a'); };
    document.getElementById('a-round').onchange = () => fillMatchList('a');
    document.getElementById('btn-save-result').onclick = saveResult;
    document.getElementById('btn-add-match').onclick = addMatchHandler;
    document.getElementById('f-sheet').onchange = () => { fillRoundSel('f'); clearMatchList('f'); };
    document.getElementById('f-round').onchange = () => fillMatchList('f');
    document.getElementById('f-only-empty').onchange = () => fillMatchList('f');
    document.getElementById('btn-update-factors').onclick = updateFactorsHandler;
    renderAdmin._wired = true;
  }
}

// ── Filtro jornada → lista clickeable (reemplaza el dropdown infinito) ──
function fillRoundSel(prefix) {
  const compId = document.getElementById(prefix + '-sheet').value;
  const { matches, rounds } = getState();
  const sel = document.getElementById(prefix + '-round');
  const prev = sel.value;

  // Solo jornadas que tienen al menos un partido en esta competencia
  const matchedRoundIds = new Set(matches.filter(m => m.competition_id === compId).map(m => m.round_id));
  const compRounds = rounds
    .filter(r => r.competition_id === compId && matchedRoundIds.has(r.id))
    .sort((a, b) => (b.display_order ?? 0) - (a.display_order ?? 0));

  sel.innerHTML = '<option value="">— elegí jornada —</option>';
  for (const r of compRounds) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.name;
    sel.appendChild(o);
  }

  // Default: la próxima jornada con partidos pendientes (sin resultado)
  const nextRoundId = pickDefaultRound(compId);
  if (prev && [...sel.options].some(o => o.value === prev)) {
    sel.value = prev;
  } else if (nextRoundId) {
    sel.value = nextRoundId;
  }
  fillMatchList(prefix);
}

function pickDefaultRound(compId) {
  const { matches, rounds } = getState();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Partido pendiente más cercano a hoy
  const pending = matches
    .filter(m => m.competition_id === compId && (m.home_score == null || m.away_score == null))
    .map(m => ({ m, d: m.match_date ? new Date(m.match_date + 'T12:00') : null }))
    .filter(x => x.d)
    .sort((a, b) => Math.abs(a.d - today) - Math.abs(b.d - today));
  return pending.length ? pending[0].m.round_id : null;
}

function clearMatchList(prefix) {
  const list = document.getElementById(prefix + '-match-list');
  list.innerHTML = '<div class="mp-empty">Elegí una jornada arriba</div>';
  document.getElementById(prefix + '-match').value = '';
}

function fillMatchList(prefix) {
  const compId = document.getElementById(prefix + '-sheet').value;
  const roundId = document.getElementById(prefix + '-round').value;
  const list = document.getElementById(prefix + '-match-list');
  if (!roundId) { clearMatchList(prefix); return; }

  const onlyEmpty = prefix === 'f' && document.getElementById('f-only-empty')?.checked;
  const { matches, rounds } = getState();
  const data = matches
    .filter(m => m.competition_id === compId && m.round_id === roundId)
    .filter(m => !onlyEmpty || !mHasFactors(m))
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  if (!data.length) {
    list.innerHTML = `<div class="mp-empty">${onlyEmpty ? 'Esta jornada ya tiene todas las cuotas cargadas ✓' : 'Sin partidos en esta jornada'}</div>`;
    document.getElementById(prefix + '-match').value = '';
    return;
  }

  list.innerHTML = '';
  for (const m of data) {
    const row = document.createElement('div');
    row.className = 'mp-row';
    row.dataset.matchId = m.id;
    const ds = m.match_date ? new Date(m.match_date + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '—';
    const hasF = mHasFactors(m);
    const hasR = m.home_score != null && m.away_score != null;
    const badge = hasR
      ? `<span class="mp-badge mp-badge-r">${m.home_score}−${m.away_score}</span>`
      : hasF ? `<span class="mp-badge mp-badge-f">${Number(m.factor_home).toFixed(2)}/${Number(m.factor_draw).toFixed(2)}/${Number(m.factor_away).toFixed(2)}</span>`
             : `<span class="mp-badge mp-badge-empty">sin cuotas</span>`;
    row.innerHTML = `
      <span class="mp-date">${ds}</span>
      <span class="mp-teams">${m.home_team} <em>vs</em> ${m.away_team}</span>
      ${badge}`;
    row.onclick = () => selectMatch(prefix, m.id);
    list.appendChild(row);
  }
  document.getElementById(prefix + '-match').value = '';
}

function selectMatch(prefix, matchId) {
  document.getElementById(prefix + '-match').value = matchId;
  // marcar visualmente
  const list = document.getElementById(prefix + '-match-list');
  list.querySelectorAll('.mp-row').forEach(r => {
    r.classList.toggle('on', r.dataset.matchId === matchId);
  });
  // poblar inputs del card correspondiente
  const m = getState().matches.find(x => x.id === matchId);
  if (!m) return;
  if (prefix === 'a') {
    document.getElementById('a-hs').value = m.home_score ?? '';
    document.getElementById('a-as').value = m.away_score ?? '';
    document.getElementById('a-factor').value = '';
  } else {
    document.getElementById('f-fl').value = m.factor_home ?? '';
    document.getElementById('f-fe').value = m.factor_draw ?? '';
    document.getElementById('f-fv').value = m.factor_away ?? '';
  }
}

function mHasFactors(m) {
  const fl = Number(m.factor_home), fe = Number(m.factor_draw), fv = Number(m.factor_away);
  return Number.isFinite(fl) && fl > 0 && Number.isFinite(fe) && fe > 0 && Number.isFinite(fv) && fv > 0;
}

async function saveResult() {
  const matchId = document.getElementById('a-match').value;
  if (!matchId) { toast('Selecciona un fixture', 'err'); return; }
  const current = getState().matches.find(x => x.id === matchId);
  const home_score = parseInt(document.getElementById('a-hs').value);
  const away_score = parseInt(document.getElementById('a-as').value);
  const factor = parseFloat(document.getElementById('a-factor').value);
  if (isNaN(home_score) || isNaN(away_score)) { toast('Ingresa el marcador', 'err'); return; }
  try {
    const res = await setMatchResult(matchId, {
      home_score, away_score,
      ...(isNaN(factor) ? {} : { factor }),
    });
    toast(`★ ${current?.home_team || 'Local'} ${home_score}−${away_score} ${current?.away_team || 'Visita'}`);
    fireConfetti({ count: 50 });
    // optimistic merge
    const ms = getState().matches.slice();
    const idx = ms.findIndex(x => x.id === matchId);
    if (idx >= 0) {
      ms[idx] = {
        ...ms[idx],
        home_score,
        away_score,
        result: res.result,
        result_factor: res.result_factor,
        status: res.result_factor ? 'finished' : ms[idx].status,
      };
    }
    setState({ matches: ms });
    fillMatchList('a');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

async function updateFactorsHandler() {
  const matchId = document.getElementById('f-match').value;
  if (!matchId) { toast('Selecciona un fixture', 'err'); return; }
  const fl = parseFloat(document.getElementById('f-fl').value);
  const fe = parseFloat(document.getElementById('f-fe').value);
  const fv = parseFloat(document.getElementById('f-fv').value);
  if (isNaN(fl) && isNaN(fe) && isNaN(fv)) { toast('Ingresa al menos una cuota', 'err'); return; }
  try {
    const res = await apiUpdateFactors(matchId, {
      factor_home: isNaN(fl) ? null : fl,
      factor_draw: isNaN(fe) ? null : fe,
      factor_away: isNaN(fv) ? null : fv,
    });
    if (!res.ok) throw new Error(res.error || 'update_failed');
    toast(`★ Cuotas actualizadas — L:${fl} E:${fe} V:${fv}`);
    // merge optimista en state
    const ms = getState().matches.slice();
    const idx = ms.findIndex(x => x.id === matchId);
    if (idx >= 0) {
      ms[idx] = {
        ...ms[idx],
        ...(isNaN(fl) ? {} : { factor_home: fl }),
        ...(isNaN(fe) ? {} : { factor_draw: fe }),
        ...(isNaN(fv) ? {} : { factor_away: fv }),
      };
    }
    setState({ matches: ms });
    // refrescar la lista (puede que el partido ya no aparezca con "solo sin cuotas")
    fillMatchList('f');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

async function addMatchHandler() {
  const compId  = document.getElementById('n-sheet').value;
  const home    = document.getElementById('n-home').value.trim();
  const away    = document.getElementById('n-away').value.trim();
  const date    = document.getElementById('n-date').value;
  const round   = document.getElementById('n-fecha').value.trim();
  const fl      = parseFloat(document.getElementById('n-fl').value);
  const fe      = parseFloat(document.getElementById('n-fe').value);
  const fv      = parseFloat(document.getElementById('n-fv').value);
  if (!home || !away || !date) { toast('Completa los campos', 'err'); return; }
  try {
    const res = await apiAddMatch({
      competition_id: compId,
      round_name:     round || 'Sin asignar',
      match_date:     date,
      home_team:      home,
      away_team:      away,
      factor_home:    isNaN(fl) ? null : fl,
      factor_draw:    isNaN(fe) ? null : fe,
      factor_away:    isNaN(fv) ? null : fv,
    });
    toast(`✓ ${home} vs ${away} agregado`);
    setState({ matches: [...getState().matches, res.match] });
    ['n-home','n-away','n-fecha','n-fl','n-fe','n-fv'].forEach(id => document.getElementById(id).value = '');
    fillRoundSel('a');
    fillRoundSel('f');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}
