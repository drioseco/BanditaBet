// Admin view — cargar resultados, agregar fixtures, info de sync.
import { getState, setState } from './state.js?v=20260606qa40';
import { setMatchResult, addMatch as apiAddMatch, updateFactors as apiUpdateFactors, fetchResults as apiFetchResults, fetchOdds as apiFetchOdds, clearSandbox as apiClearSandbox, refreshSyncStatus, varOverride as apiVarOverride } from './api.js?v=20260606qa40';
import { toast, fireConfetti } from './game-fx.js?v=20260606qa40';

// (qa30) PIN de admin eliminado: Gestión abierta, sin prompt.
async function handleAdminError(e) {
  toast('Error: ' + e.message, 'err');
  return false;
}

export function renderAdmin() {
  fillRoundSel('a');
  fillRoundSel('f');
  fillRoundSel('v');
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
    document.getElementById('btn-fetch-results').onclick = importResultsHandler;
    document.getElementById('btn-clear-sandbox').onclick = clearSandboxHandler;
    document.getElementById('btn-fetch-odds').onclick = fetchOddsHandler;
    // qa40 — Modo VAR
    document.getElementById('v-sheet').onchange = () => { fillRoundSel('v'); clearMatchList('v'); };
    document.getElementById('v-round').onchange = () => fillMatchList('v');
    document.getElementById('v-player').onchange = prefillVarPick;
    document.getElementById('btn-var-unlock').onclick = varUnlock;
    document.getElementById('var-code').onkeydown = (e) => { if (e.key === 'Enter') varUnlock(); };
    document.getElementById('btn-var-apply').onclick = varApply;
    renderAdmin._wired = true;
  }
}

// ── qa17: Importar resultados desde API (sandbox) ──────────────────
function ymdISO_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function importResultsHandler() {
  const fromDays = parseInt(document.getElementById('i-from').value, 10);
  const toDays   = parseInt(document.getElementById('i-to').value, 10);
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - fromDays);
  const to   = new Date(now); to.setDate(to.getDate() + toDays);
  const btn = document.getElementById('btn-fetch-results');
  const resEl = document.getElementById('i-result');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '⏳ Importando…';
  resEl.style.display = 'block';
  resEl.innerHTML = '<strong>Consultando API-Football…</strong>';
  try {
    const r = await apiFetchResults({ from: ymdISO_(from), to: ymdISO_(to) });
    if (!r.ok) {
      const hint = r.hint ? ` <em>${r.hint}</em>` : '';
      resEl.innerHTML = `<strong style="color:var(--bb-tomate)">Error:</strong> ${r.error}.${hint}`;
      return;
    }
    const unmatched = (r.unmatched || []).join(', ') || '—';
    const futureLine = r.future != null
      ? `📅 ${r.future} partidos futuros (programados, sin resultado todavía)<br>`
      : '';
    resEl.innerHTML = `
      <strong>✓ Importados ${r.fetched} fixtures a <code>${r.sandbox_sheet}</code></strong><br>
      📋 ${r.matched} matched contra Liga · <b>${r.would_update}</b> would_update · ${r.already_filled} ya tenían score<br>
      ${futureLine}
      ❌ Sin matchear (jugados pero ausentes del Sheet): <em>${unmatched}</em><br>
      Abrí la pestaña <code>${r.sandbox_sheet}</code> en el Sheet para revisar fila por fila.
    `;
    toast(`★ ${r.fetched} fixtures importados a sandbox`);
  } catch (e) {
    resEl.innerHTML = `<strong style="color:var(--bb-tomate)">Falló:</strong> ${e.message}`;
    await handleAdminError(e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// qa21 — Propuestas de cuotas
async function fetchOddsHandler() {
  const btn = document.getElementById('btn-fetch-odds');
  const container = document.getElementById('o-proposals');
  const fromDays = parseInt(document.getElementById('o-from').value, 10);
  const toDays   = parseInt(document.getElementById('o-to').value, 10);
  const today = new Date();
  const from = ymdISO_(new Date(today.getTime() - fromDays * 86400000));
  const to   = ymdISO_(new Date(today.getTime() + toDays * 86400000));

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Consultando…';
  container.innerHTML = '';
  try {
    const r = await apiFetchOdds({ from, to });
    if (!r.ok) {
      container.innerHTML = `<div class="sync-help"><strong style="color:var(--bb-tomate)">Error:</strong> ${r.error}</div>`;
      return;
    }
    const props = r.proposals || [];
    if (!props.length) {
      container.innerHTML = `<div class="sync-help">No hay propuestas. ${r.skipped_no_odds} partidos sin odds disponibles, ${r.skipped_unmatched} sin matchear.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="sync-help"><strong>${props.length} propuestas</strong> · fuente: ${r.source} · skipped: ${r.skipped_no_odds} sin odds, ${r.skipped_unmatched} sin match</div>
      <div class="prop-list">
        ${props.map(p => renderProposal_(p)).join('')}
      </div>`;
    container.querySelectorAll('[data-apply]').forEach(btn => {
      btn.onclick = () => applyProposalHandler(btn);
    });
  } catch (e) {
    container.innerHTML = `<div class="sync-help"><strong style="color:var(--bb-tomate)">Falló:</strong> ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function renderProposal_(p) {
  const cur = p.current || {};
  const prop = p.proposal || {};
  const fmt = v => v == null ? '—' : Number(v).toFixed(2);
  const hasOld = cur.fl != null || cur.fe != null || cur.fv != null;
  return `
    <div class="prop-row" data-match-id="${p.match_id}"
         data-fl="${prop.fl ?? ''}" data-fe="${prop.fe ?? ''}" data-fv="${prop.fv ?? ''}">
      <div class="prop-info">
        <div class="prop-date">${p.match_date}</div>
        <div class="prop-teams">${p.home_team} <em>vs</em> ${p.away_team}</div>
      </div>
      <div class="prop-odds">
        <div class="prop-cell"><b>${fmt(prop.fl)}</b><small>Fac L</small></div>
        <div class="prop-cell"><b>${fmt(prop.fe)}</b><small>Empate</small></div>
        <div class="prop-cell"><b>${fmt(prop.fv)}</b><small>Fac V</small></div>
      </div>
      ${hasOld ? `<div class="prop-current">Actual: L:${fmt(cur.fl)} E:${fmt(cur.fe)} V:${fmt(cur.fv)}</div>` : '<div class="prop-current prop-empty">Sin cuotas cargadas</div>'}
      <button class="btn-a prop-apply" data-apply="1">★ Aplicar al fixture</button>
    </div>`;
}

async function applyProposalHandler(btn) {
  const row = btn.closest('.prop-row');
  const matchId = row.dataset.matchId;
  const fl = parseFloat(row.dataset.fl);
  const fe = parseFloat(row.dataset.fe);
  const fv = parseFloat(row.dataset.fv);
  const teams = row.querySelector('.prop-teams')?.textContent || matchId;
  if (!confirm(`¿Aplicar cuotas L:${fl} E:${fe} V:${fv} a ${teams}?`)) return;
  btn.disabled = true;
  btn.textContent = '⏳';
  try {
    const res = await apiUpdateFactors(matchId, {
      factor_home: isNaN(fl) ? null : fl,
      factor_draw: isNaN(fe) ? null : fe,
      factor_away: isNaN(fv) ? null : fv,
    });
    if (!res.ok) throw new Error(res.error || 'update_failed');
    toast(`★ Cuotas aplicadas — L:${fl} E:${fe} V:${fv}`);
    // merge optimista en state
    const ms = getState().matches.slice();
    const idx = ms.findIndex(x => x.id === matchId);
    if (idx >= 0) {
      ms[idx] = { ...ms[idx], factor_home: fl, factor_draw: fe, factor_away: fv };
    }
    setState({ matches: ms });
    btn.textContent = '✓ Aplicado';
    btn.style.background = 'var(--bb-pasto)';
  } catch (e) {
    await handleAdminError(e);
    btn.disabled = false;
    btn.textContent = '★ Aplicar al fixture';
  }
}

async function clearSandboxHandler() {
  if (!confirm('¿Limpiar la hoja _API_test? (no afecta Liga de Primera)')) return;
  const btn = document.getElementById('btn-clear-sandbox');
  btn.disabled = true;
  try {
    const r = await apiClearSandbox();
    toast(r.ok ? `★ Sandbox limpiada (${r.cleared} filas)` : 'Error: ' + r.error, r.ok ? '' : 'err');
    const resEl = document.getElementById('i-result');
    if (resEl) resEl.style.display = 'none';
  } catch (e) {
    await handleAdminError(e);
  } finally {
    btn.disabled = false;
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
  } else if (prefix === 'f') {
    document.getElementById('f-fl').value = m.factor_home ?? '';
    document.getElementById('f-fe').value = m.factor_draw ?? '';
    document.getElementById('f-fv').value = m.factor_away ?? '';
  } else if (prefix === 'v') {
    prefillVarPick();
  }
}

// ── qa40 · Modo VAR ────────────────────────────────────────────────
// Desbloqueo: NO valida acá (el código vive solo en el backend). Abre el panel
// y deja que el backend rechace si el código está mal (mensaje divertido).
function varUnlock() {
  const code = document.getElementById('var-code').value.trim();
  const errEl = document.getElementById('var-lock-err');
  if (!code) { errEl.textContent = 'Escribí el código, árbitro.'; return; }
  errEl.textContent = '';
  document.getElementById('var-lock').classList.add('hidden');
  document.getElementById('var-panel').classList.remove('hidden');
  fillRoundSel('v');
}

// Prefill del marcador con el pick actual del jugador (si tiene), para editar.
function prefillVarPick() {
  const matchId = document.getElementById('v-match').value;
  const playerName = document.getElementById('v-player').value;
  if (!matchId || !playerName) return;
  const { players, picks } = getState();
  const pl = players.find(p => p.name === playerName);
  if (!pl) return;
  const pk = picks.find(x => x.match_id === matchId && x.player_id === pl.id);
  document.getElementById('v-hs').value = pk && pk.home_score != null ? pk.home_score : '';
  document.getElementById('v-as').value = pk && pk.away_score != null ? pk.away_score : '';
}

async function varApply() {
  const code = document.getElementById('var-code').value.trim();
  const matchId = document.getElementById('v-match').value;
  const player = document.getElementById('v-player').value;
  const home_score = parseInt(document.getElementById('v-hs').value, 10);
  const away_score = parseInt(document.getElementById('v-as').value, 10);
  const resEl = document.getElementById('v-result');
  const m = getState().matches.find(x => x.id === matchId);

  if (!matchId) { toast('Elegí el partido', 'err'); return; }
  if (!player)  { toast('Elegí el jugador', 'err'); return; }
  if (isNaN(home_score) || isNaN(away_score)) { toast('Ingresá el pick (marcador)', 'err'); return; }

  const btn = document.getElementById('btn-var-apply');
  btn.disabled = true;
  resEl.className = 'var-result on var-checking';
  resEl.innerHTML = '📺 <strong>Revisando la jugada…</strong><div class="var-bar"><i></i></div>';

  try {
    const res = await apiVarOverride({ code, player, matchId, home_score, away_score });
    if (!res.ok) {
      if (res.error === 'var_denied') {
        resEl.className = 'var-result on var-no';
        resEl.innerHTML = '🟥 <strong>El VAR no te reconoce.</strong> Código incorrecto, impostor.';
        // re-bloquear: el código está mal
        setTimeout(() => {
          document.getElementById('var-panel').classList.add('hidden');
          document.getElementById('var-lock').classList.remove('hidden');
          document.getElementById('var-lock-err').textContent = '🟥 Código incorrecto.';
          document.getElementById('var-code').value = '';
        }, 1600);
        return;
      }
      throw new Error(res.error || 'var_error');
    }

    // éxito → merge optimista del pick en state y refresco
    const ptsTxt = res.recalced
      ? (res.status === 'P' ? `PLENO · +${res.points} pts` : res.status === 'Ac' ? `acierto · +${res.points} pts` : `sin acierto · ${res.points} pts`)
      : 'pick guardado (el partido aún no tiene resultado)';
    resEl.className = 'var-result on var-ok';
    resEl.innerHTML = `✅ <strong>WO ANULADO</strong> · ${player} ${home_score}−${away_score} en ${m ? m.home_team + ' vs ' + m.away_team : 'el partido'}<br><span class="var-pts">${ptsTxt}</span>`;
    fireConfetti({ count: 60 });
    toast(`📺 VAR: ${player} ${home_score}−${away_score} convalidado`);

    mergeVarPick(matchId, player, home_score, away_score, res);
  } catch (e) {
    resEl.className = 'var-result on var-no';
    resEl.innerHTML = '⚠️ Error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

// Merge optimista: inserta/actualiza el pick en state.picks para que la tabla y
// las vistas reflejen el cambio sin esperar al próximo fetch de state.
function mergeVarPick(matchId, playerName, hs, as_, res) {
  const st = getState();
  const pl = (st.players || []).find(p => p.name === playerName);
  if (!pl) return;
  const picks = (st.picks || []).slice();
  const idx = picks.findIndex(x => x.match_id === matchId && x.player_id === pl.id);
  const entry = { match_id: matchId, player_id: pl.id, home_score: hs, away_score: as_ };
  if (idx >= 0) picks[idx] = { ...picks[idx], ...entry }; else picks.push(entry);
  setState({ picks });
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
    await handleAdminError(e);
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
    await handleAdminError(e);
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
    await handleAdminError(e);
  }
}
