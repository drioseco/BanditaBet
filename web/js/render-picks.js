// ════════════════════════════════════════════════════════════════════
// Picks view — carga/edita picks del jugador seleccionado en localStorage.
// ════════════════════════════════════════════════════════════════════
import { getState, setState, hasRes, hoursUntil, mDate, TODAY } from './state.js?v=20260603qa37';
import { CONFIG } from './config.js?v=20260603qa37';
import { savePicks } from './api.js?v=20260603qa37';
import { fireConfetti, toast } from './game-fx.js?v=20260603qa37';
import { teamShieldHTML } from './team-logos.js?v=20260603qa37';

const draft = {};   // { match_id: { home_score, away_score } }

function getActivePlayer() {
  const { picker, players } = getState();
  return players.find(p => p.name === picker) || players[0] || null;
}

export function renderPicks() {
  const { matches, picks, currentPickSheet } = getState();
  const player = getActivePlayer();
  if (!player) return;

  buildPickerBtns();

  document.querySelectorAll('#s-picks .ft[data-pick-sheet]').forEach(b => {
    b.classList.toggle('on', b.dataset.pickSheet === currentPickSheet);
  });

  const stats = playerCardStats(player.id);
  const c = player.color;
  document.getElementById('pick-profile').innerHTML = `
    <div class="pp-ava" style="border-color:${c};display:flex;align-items:center;justify-content:center;font-family:var(--bb-display);font-style:italic;color:${c}">${player.name[0]}</div>
    <div>
      <div class="pp-name" style="color:${c}">${player.name}</div>
      <div class="pp-sub">${stats.plenos} plenos · ${stats.aciertos} aciertos · ${stats.wo} WO</div>
    </div>
    <div class="pp-pts-wrap"><div class="pp-pts-n" style="color:${c}">${stats.total.toFixed(2)}</div><div class="pp-pts-l">PTS temporada</div></div>`;

  const pending = matches
    .filter(m => m.competition_id === currentPickSheet && !hasRes(m))
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  const body = document.getElementById('picks-body');
  if (!pending.length) {
    body.innerHTML = `<div style="background:var(--bb-paper);border:var(--bb-border-sm);border-color:rgba(31,26,46,.15);border-radius:4px;padding:2rem;text-align:center;font-family:var(--bb-ui);color:rgba(31,26,46,.38)">✅ Sin fixtures pendientes en este torneo</div>`;
    return;
  }
  const today = pending.filter(m => { const d = mDate(m); return !d || d <= TODAY; });
  const future = pending.filter(m => { const d = mDate(m); return d && d > TODAY; });

  let html = '';
  if (today.length) {
    html += `<div class="pick-section-lbl"><span>⚠️ Sin resultado aún (${today.length})</span></div>`;
    today.forEach(m => html += pickCardHTML(m, player, true));
  }
  if (future.length) {
    html += `<div class="pick-section-lbl"><span>📅 Próximos — marcá antes del pitazo (${future.length})</span><span style="font-size:.5rem">Cierra al inicio del partido</span></div>`;
    future.forEach(m => html += pickCardHTML(m, player, false));
  }
  body.innerHTML = html;

  // Botón flotante sticky — siempre visible mientras scrolleas
  const floatEl = document.getElementById('picks-float');
  if (floatEl) {
    const textColor = c === '#E8B33D' ? 'var(--bb-ink)' : 'var(--bb-cream)';
    floatEl.innerHTML = `<button class="save-btn save-btn-float" id="save-picks-btn" style="background:${c};color:${textColor}">★ Guardar picks de ${player.name}</button>`;
  }

  body.querySelectorAll('input[data-pick]').forEach(inp => {
    inp.addEventListener('input', e => {
      const matchId = inp.dataset.match;
      const side = inp.dataset.side;
      if (!draft[matchId]) draft[matchId] = {};
      const v = e.target.value === '' ? null : parseInt(e.target.value);
      draft[matchId][side === 'l' ? 'home_score' : 'away_score'] = v;
      e.target.classList.toggle('bb-has-value', v != null);
    });
  });
  const saveBtn = document.getElementById('save-picks-btn');
  if (saveBtn) saveBtn.onclick = onSave;
}

function pickCardHTML(m, player, urgent) {
  const { picks } = getState();
  const existing = picks.find(p => p.match_id === m.id && p.player_id === player.id);
  const drafted = draft[m.id] || {};
  const lv = drafted.home_score != null ? drafted.home_score
           : existing?.home_score != null ? existing.home_score : '';
  const vv = drafted.away_score != null ? drafted.away_score
           : existing?.away_score != null ? existing.away_score : '';
  const ds = m.match_date ? new Date(m.match_date + 'T12:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  const h = hoursUntil(m);
  const dl = h != null && h > 0 && h < 48
    ? `<div class="pc-deadline">⏰ ${h < 1 ? '¡Cierra ya!' : h < 24 ? Math.round(h) + 'h para el pitazo' : Math.ceil(h / 24) + ' días'}</div>` : '';
  const c = player.color;
  return `<div class="pcard${urgent ? ' urgent' : ''}">
    <div class="pc-hdr">
      <div class="pc-match">${teamShieldHTML(m.home_team, 'sm')}${m.home_team} <span style="color:rgba(31,26,46,.28)">vs</span> ${m.away_team}${teamShieldHTML(m.away_team, 'sm')}</div>
      <div class="pc-meta">${ds}${dl}</div>
    </div>
    <div class="pscores">
      <input type="number" class="sc-in${lv !== '' ? ' bb-has-value' : ''}" placeholder="L" min="0" max="99" value="${lv}"
        data-pick="1" data-match="${m.id}" data-side="l"
        onfocus="this.style.borderColor='${c}'" onblur="this.style.borderColor=''">
      <div class="vsep">—</div>
      <input type="number" class="sc-in${vv !== '' ? ' bb-has-value' : ''}" placeholder="V" min="0" max="99" value="${vv}"
        data-pick="1" data-match="${m.id}" data-side="v"
        onfocus="this.style.borderColor='${c}'" onblur="this.style.borderColor=''">
    </div>
    <div class="pc-fac"><span>L:<b style="color:var(--bb-pasto)">${m.factor_home || '?'}</b></span><span>E:<b style="color:var(--bb-maroon)">${m.factor_draw || '?'}</b></span><span>V:<b style="color:var(--bb-cobalt)">${m.factor_away || '?'}</b></span></div>
  </div>`;
}

async function onSave() {
  const player = getActivePlayer();
  if (!player) { toast('Selecciona un jugador', 'err'); return; }

  const dirty = Object.entries(draft)
    .map(([matchId, scores]) => ({ matchId, ...scores }))
    .filter(p => p.home_score != null && p.away_score != null);
  if (!dirty.length) { toast('Marcá al menos un pick', 'err'); return; }

  try {
    const res = await savePicks(player.name, dirty);
    if (!res.ok) throw new Error(res.error || 'save_failed');
    toast(`★ ${res.saved} picks guardados${res.locked ? ` · ${res.locked} ya cerrados` : ''}`);
    fireConfetti({ count: 60 });

    // Mergear localmente
    const ps = getState().picks.slice();
    for (const d of dirty) {
      const idx = ps.findIndex(x => x.match_id === d.matchId && x.player_id === player.id);
      const row = {
        id: idx >= 0 ? ps[idx].id : `local-${player.id}-${d.matchId}`,
        match_id: d.matchId,
        player_id: player.id,
        player_name: player.name,
        home_score: d.home_score,
        away_score: d.away_score,
        points: 0, status: '  ', source: 'web',
      };
      if (idx >= 0) ps[idx] = row; else ps.push(row);
    }
    setState({ picks: ps });
    Object.keys(draft).forEach(k => delete draft[k]);
    renderPicks();
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }
}

function buildPickerBtns() {
  const w = document.getElementById('picker-btns');
  if (!w) return;
  const { players, picker } = getState();
  w.innerHTML = '<span class="flt-lbl">Jugador:</span>';
  for (const p of players) {
    const btn = document.createElement('button');
    btn.className = 'picker-btn' + (p.name === picker ? ' on' : '');
    if (p.name === picker) {
      btn.style.background = 'var(--bb-ink)';
      btn.style.borderColor = 'var(--bb-ink)';
      btn.style.color = 'var(--bb-cream)';
    }
    btn.innerHTML = `${p.name}`;
    btn.onclick = () => {
      setState({ picker: p.name });
      try { localStorage.setItem('bb_picker', p.name); } catch {}
      renderPicks();
    };
    w.appendChild(btn);
  }
}

function playerCardStats(playerId) {
  const { matches, picks } = getState();
  let total = 0, plenos = 0, aciertos = 0, wo = 0;
  for (const m of matches) {
    if (!hasRes(m)) continue;
    const pk = picks.find(x => x.match_id === m.id && x.player_id === playerId);
    if (!pk || pk.home_score == null) { wo++; continue; }
    total += Number(pk.points || 0);
    const s = (pk.status || '').toString().trim();
    if (s === 'P') plenos++;
    else if (s === 'Ac') aciertos++;
  }
  return { total, plenos, aciertos, wo };
}
