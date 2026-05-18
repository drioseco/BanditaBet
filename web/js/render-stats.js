// ════════════════════════════════════════════════════════════════════
// Stats view — versión "alive": pick de la temporada, evolución
// sparkline, calendario heatmap, H2H, gemelos/rivales, tendencias L/E/V,
// marcadores favoritos, liga vs experto, premios raros, WO.
// ════════════════════════════════════════════════════════════════════
import { getState, hasRes } from './state.js?v=20260516qa10';

// ╔════════════════════════════════════════════════════════════════╗
// ║  DATA — un solo paso por matches/picks; el resto consume        ║
// ╚════════════════════════════════════════════════════════════════╝

function computeAllStats() {
  const { matches, picks, players, rounds } = getState();

  const completed = matches
    .filter(hasRes)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  // Index picks por (match_id, player_id) para lookup O(1)
  const picksByMatch = {};
  for (const pk of picks) {
    if (!picksByMatch[pk.match_id]) picksByMatch[pk.match_id] = {};
    picksByMatch[pk.match_id][pk.player_id] = pk;
  }

  // Stats por jugador
  const perPlayer = {};
  for (const p of players) {
    perPlayer[p.id] = {
      player: p,
      points: 0, plenos: 0, aciertos: 0, misses: 0, wo: 0, pj: 0,
      lev: { L: 0, E: 0, V: 0 },
      goalsSum: 0, goalsN: 0,
      marcadores: {},
      currentStreak: 0, maxStreak: 0,
      currentCold: 0,   maxCold: 0,
      bestPick: null,                   // {pts, match}
      perComp: {},                      // { liga: {points,pj,hits,...}, experto: {...} }
      cumulative: [],                   // [{x: ts, y: cumPoints}]
    };
  }

  // Acumulador para sparkline
  const cum = {};
  for (const p of players) cum[p.id] = 0;

  // Scan partidos en orden cronológico
  for (const m of completed) {
    const cId = m.competition_id || 'liga';
    const mPicks = picksByMatch[m.id] || {};

    for (const p of players) {
      const ps = perPlayer[p.id];
      const comp = ps.perComp[cId] || (ps.perComp[cId] = { points:0, pj:0, plenos:0, hits:0, wo:0 });
      const pk = mPicks[p.id];

      if (!pk || pk.home_score == null || pk.away_score == null) {
        ps.wo++; comp.wo++;
        ps.currentStreak = 0; // WO corta racha caliente; no contamos en fría
        continue;
      }

      ps.pj++; comp.pj++;
      const pts = Number(pk.points || 0);
      ps.points += pts; comp.points += pts;
      cum[p.id] += pts;

      const s = (pk.status || '').toString().trim();
      const isP  = s === 'P';
      const isAc = s === 'Ac';
      const isHit = isP || isAc;

      if (isP)  { ps.plenos++;   comp.plenos++; }
      else if (isAc) ps.aciertos++;
      else ps.misses++;
      if (isHit) comp.hits++;

      // Rachas
      if (isHit) {
        ps.currentStreak++;
        ps.maxStreak = Math.max(ps.maxStreak, ps.currentStreak);
        ps.currentCold = 0;
      } else {
        ps.currentStreak = 0;
        ps.currentCold++;
        ps.maxCold = Math.max(ps.maxCold, ps.currentCold);
      }

      // L/E/V tendencia basada en el PICK
      const ph = Number(pk.home_score), pa = Number(pk.away_score);
      if (ph > pa) ps.lev.L++;
      else if (ph === pa) ps.lev.E++;
      else ps.lev.V++;

      // Optimismo (goles predichos por pick)
      if (!isNaN(ph) && !isNaN(pa)) {
        ps.goalsSum += ph + pa;
        ps.goalsN++;
      }

      // Marcadores favoritos
      const sc = `${ph}-${pa}`;
      ps.marcadores[sc] = (ps.marcadores[sc] || 0) + 1;

      // Best pick personal (pleno con más puntos)
      if (isP && (!ps.bestPick || pts > ps.bestPick.pts)) {
        ps.bestPick = { pts, match: m, pick: pk };
      }
    }

    // Snapshot acumulado por jugador
    for (const p of players) {
      perPlayer[p.id].cumulative.push({
        x: new Date(m.match_date).getTime(),
        y: cum[p.id],
      });
    }
  }

  // === Pick de la temporada (cross-player) ===
  let pickOfTheSeason = null;
  for (const p of players) {
    const bp = perPlayer[p.id].bestPick;
    if (bp && (!pickOfTheSeason || bp.pts > pickOfTheSeason.pts)) {
      pickOfTheSeason = { ...bp, player: p };
    }
  }

  // === H2H matrix ===
  const h2h = {};
  for (const a of players) {
    h2h[a.id] = {};
    for (const b of players) {
      if (a.id === b.id) continue;
      let wa = 0, wb = 0;
      for (const m of completed) {
        const va = Number(picksByMatch[m.id]?.[a.id]?.points || 0);
        const vb = Number(picksByMatch[m.id]?.[b.id]?.points || 0);
        if (va > vb) wa++;
        else if (vb > va) wb++;
      }
      h2h[a.id][b.id] = { wa, wb };
    }
  }

  // === Gemelos & rivales ===
  const pairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i], b = players[j];
      let same = 0, opposite = 0, total = 0;
      for (const m of completed) {
        const pa = picksByMatch[m.id]?.[a.id];
        const pb = picksByMatch[m.id]?.[b.id];
        if (!pa || !pb || pa.home_score == null || pb.home_score == null) continue;
        total++;
        if (pa.home_score === pb.home_score && pa.away_score === pb.away_score) same++;
        const ra = pa.home_score > pa.away_score ? 'L' : pa.home_score < pa.away_score ? 'V' : 'E';
        const rb = pb.home_score > pb.away_score ? 'L' : pb.home_score < pb.away_score ? 'V' : 'E';
        if ((ra === 'L' && rb === 'V') || (ra === 'V' && rb === 'L')) opposite++;
      }
      pairs.push({ a, b, same, opposite, total });
    }
  }
  pairs.sort((x, y) => y.same - x.same);
  const gemelos = pairs[0] || null;
  const rivales = [...pairs].sort((x, y) => y.opposite - x.opposite)[0] || null;

  // === Ganador por fecha (heatmap) ===
  const byRound = {};
  for (const m of completed) {
    const key = `${m.competition_id || 'liga'}::${m.round_id || '—'}`;
    if (!byRound[key]) byRound[key] = { compId: m.competition_id || 'liga', roundId: m.round_id || '—', matches: [], latest: 0 };
    byRound[key].matches.push(m);
    byRound[key].latest = Math.max(byRound[key].latest, new Date(m.match_date).getTime());
  }
  const roundsList = Object.values(byRound)
    .map(g => {
      const r = (rounds || []).find(rr => rr.id === g.roundId);
      const name = r?.name || g.roundId;
      const pp = {};
      for (const p of players) pp[p.id] = 0;
      let totalPoints = 0;
      for (const m of g.matches) {
        for (const p of players) {
          const pts = Number(picksByMatch[m.id]?.[p.id]?.points || 0);
          pp[p.id] += pts;
          totalPoints += pts;
        }
      }
      const winnerId = Object.entries(pp).sort((a, b) => b[1] - a[1])[0]?.[0];
      const winner = players.find(p => p.id === winnerId);
      return { ...g, name, perPlayer: pp, totalPoints, winner };
    })
    .sort((a, b) => a.latest - b.latest);

  return { perPlayer, pickOfTheSeason, h2h, gemelos, rivales, roundsList, completed, players };
}

// ╔════════════════════════════════════════════════════════════════╗
// ║  RENDERERS                                                       ║
// ╚════════════════════════════════════════════════════════════════╝

function renderHero(s, root) {
  if (!s.pickOfTheSeason) {
    root.innerHTML = '<div class="stat-empty">Sin plenos todavía. Pegale al primero y armás el hero.</div>';
    return;
  }
  const { player, match, pick, pts } = s.pickOfTheSeason;
  const factor = match.result_factor ?? pts;
  const dateStr = new Date(match.match_date + 'T12:00')
    .toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
  root.innerHTML = `
    <div class="hero-pick" style="--c:${player.color}">
      <div class="hero-pick-ribbon">⭐ EL PLENO DEL AÑO</div>
      <div class="hero-pick-grid">
        <div class="hero-pick-who">
          <div class="hero-pick-ini" style="background:${player.color}">${player.name[0]}</div>
          <div>
            <div class="hero-pick-name" style="color:${player.color}">${player.name}</div>
            <div class="hero-pick-date">${dateStr}</div>
          </div>
        </div>
        <div class="hero-pick-match">
          <div class="hero-pick-teams">${match.home_team} <span class="hero-pick-vs">vs</span> ${match.away_team}</div>
          <div class="hero-pick-score">${match.home_score} — ${match.away_score}</div>
          <div class="hero-pick-sub">Pick exacto: <b>${pick.home_score}–${pick.away_score}</b> · cuota ${typeof factor === 'number' ? factor.toFixed(2) : factor}</div>
        </div>
        <div class="hero-pick-pts">
          <div class="hero-pick-pts-n" style="color:${player.color}">+${pts.toFixed(2)}</div>
          <div class="hero-pick-pts-l">PUNTOS</div>
        </div>
      </div>
    </div>`;
}

function renderAwards(s, root) {
  const players = Object.values(s.perPlayer);
  if (!players.length || !s.completed.length) {
    root.innerHTML = '<div class="stat-empty">Sin datos para los premios todavía.</div>';
    return;
  }
  const pick = (keyFn, cmp, subFn) => {
    const ranked = players
      .map(p => ({ p: p.player, v: keyFn(p), sub: subFn ? subFn(p) : '' }))
      .filter(x => x.v != null && !isNaN(x.v))
      .sort((a, b) => cmp(a.v, b.v));
    return ranked[0];
  };
  const desc = (a, b) => b - a;
  const asc  = (a, b) => a - b;

  const awards = [
    { ico: '🎯', label: 'El Profeta',     tag: 'más plenos',
      pick: pick(p => p.plenos, desc, p => `${p.plenos} P · ${p.aciertos} Ac`) },
    { ico: '☠️',  label: 'El Bardo',       tag: 'más WO',
      pick: pick(p => p.wo, desc, p => `${p.wo} partidos sin marcar`) },
    { ico: '⚽', label: 'El Optimista',   tag: 'más goles predichos',
      pick: pick(p => p.goalsN ? p.goalsSum / p.goalsN : null, desc,
                 p => `${(p.goalsSum / p.goalsN).toFixed(2)} avg goles`) },
    { ico: '🛡️',  label: 'El Cuidadoso',  tag: 'menos goles predichos',
      pick: pick(p => p.goalsN ? p.goalsSum / p.goalsN : null, asc,
                 p => `${(p.goalsSum / p.goalsN).toFixed(2)} avg goles`) },
    { ico: '🤝', label: 'El Centrista',   tag: 'más empates pickeados',
      pick: pick(p => p.lev.E, desc, p => `${p.lev.E} de ${p.pj} marcados`) },
    { ico: '🔥', label: 'Racha caliente', tag: 'P/Ac seguidos',
      pick: pick(p => p.maxStreak, desc, p => `${p.maxStreak} en racha · actual ${p.currentStreak}`) },
    { ico: '❄️',  label: 'Racha fría',     tag: 'falladas seguidas',
      pick: pick(p => p.maxCold, desc, p => `${p.maxCold} en racha · actual ${p.currentCold}`) },
  ];

  root.innerHTML = `
    <div class="award-grid">
      ${awards.map(a => {
        if (!a.pick) return '';
        const v = a.pick.v;
        const valStr = typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(2)) : v;
        return `
          <div class="award-card" style="--c:${a.pick.p.color}">
            <div class="award-ico">${a.ico}</div>
            <div class="award-label">${a.label}</div>
            <div class="award-name" style="color:${a.pick.p.color}">${a.pick.p.name}</div>
            <div class="award-val">${valStr}</div>
            <div class="award-tag">${a.tag}</div>
            <div class="award-sub">${a.pick.sub}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderEvolution(s, root) {
  const series = Object.values(s.perPlayer);
  if (!s.completed.length || !series.some(p => p.cumulative.length)) {
    root.innerHTML = '<div class="stat-empty">Sin partidos jugados todavía. La evolución se construye fecha por fecha.</div>';
    return;
  }
  const W = 720, H = 220, PAD = { l: 38, r: 18, t: 14, b: 24 };
  const minTs = new Date(s.completed[0].match_date).getTime();
  const maxTs = new Date(s.completed[s.completed.length - 1].match_date).getTime();
  const xR = (maxTs - minTs) || 1;
  const maxY = Math.max(...series.map(p => p.points), 1);
  const xS = t => PAD.l + ((t - minTs) / xR) * (W - PAD.l - PAD.r);
  const yS = y => H - PAD.b - (y / maxY) * (H - PAD.t - PAD.b);

  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = yS(maxY * f);
    return `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}" stroke="rgba(31,26,46,.08)" stroke-width="1"/>
            <text x="${PAD.l - 6}" y="${y + 3}" text-anchor="end" font-family="Space Mono" font-size="9" fill="rgba(31,26,46,.5)">${(maxY * f).toFixed(0)}</text>`;
  }).join('');

  const firstDate = new Date(minTs).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const lastDate  = new Date(maxTs).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const xLabels = `
    <text x="${PAD.l}" y="${H - 6}" font-family="Space Mono" font-size="9" fill="rgba(31,26,46,.6)">${firstDate}</text>
    <text x="${W - PAD.r}" y="${H - 6}" text-anchor="end" font-family="Space Mono" font-size="9" fill="rgba(31,26,46,.6)">${lastDate}</text>`;

  const paths = series.map(ps => {
    if (!ps.cumulative.length) return '';
    const points = ps.cumulative.map(p => `${xS(p.x).toFixed(1)},${yS(p.y).toFixed(1)}`);
    const last = ps.cumulative[ps.cumulative.length - 1];
    return `
      <path d="M ${points.join(' L ')}" fill="none" stroke="${ps.player.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" opacity=".92"/>
      <circle cx="${xS(last.x)}" cy="${yS(last.y)}" r="4" fill="${ps.player.color}" stroke="#1F1A2E" stroke-width="1.5"/>`;
  }).join('');

  const legend = [...series].sort((a, b) => b.points - a.points).map(ps => `
    <span class="evol-leg"><span class="evol-dot" style="background:${ps.player.color}"></span>${ps.player.name} <b>${ps.points.toFixed(0)}</b></span>
  `).join('');

  root.innerHTML = `
    <div class="evol-wrap">
      <div class="evol-legend">${legend}</div>
      <svg class="evol-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${grid}${xLabels}${paths}
      </svg>
    </div>`;
}

function renderHeatmap(s, root) {
  if (!s.roundsList.length) {
    root.innerHTML = '<div class="stat-empty">Sin fechas cerradas todavía.</div>';
    return;
  }
  const cells = s.roundsList.map(r => {
    const c = r.winner?.color || 'rgba(31,26,46,.15)';
    const ini = r.winner?.name?.[0]?.toUpperCase() || '?';
    const pts = r.winner ? (r.perPlayer[r.winner.id] || 0).toFixed(0) : 0;
    const cmp = r.compId === 'experto' ? 'EXP' : 'LIGA';
    const shortName = r.name.replace(/^Fecha\s+/i, 'F').replace(/^Copa\s+/i, 'C·');
    return `
      <div class="hm-cell" style="background:${c}" title="${r.name} (${cmp}): ${r.winner?.name || '—'} +${pts}">
        <span class="hm-ini">${ini}</span>
        <span class="hm-name">${shortName}</span>
        <span class="hm-pts">+${pts}</span>
      </div>`;
  }).join('');
  root.innerHTML = `<div class="hm-row">${cells}</div>`;
}

function renderH2H(s, root) {
  const ps = s.players;
  if (ps.length < 2) { root.innerHTML = '<div class="stat-empty">Faltan jugadores.</div>'; return; }

  const headRow = `<div class="h2h-cell h2h-corner"></div>` +
    ps.map(p => `<div class="h2h-cell h2h-head" style="color:${p.color}">${p.name}</div>`).join('');

  const rows = ps.map(a => {
    return `<div class="h2h-cell h2h-head" style="color:${a.color}">${a.name}</div>` +
      ps.map(b => {
        if (a.id === b.id) return `<div class="h2h-cell h2h-diag">—</div>`;
        const r = s.h2h[a.id][b.id];
        const total = r.wa + r.wb;
        const pct = total ? r.wa / total : 0.5;
        const tone = pct > 0.55 ? 'win' : pct < 0.45 ? 'lose' : 'tie';
        return `<div class="h2h-cell h2h-${tone}"><b>${r.wa}</b><small> · ${r.wb}</small></div>`;
      }).join('');
  }).join('');

  root.innerHTML = `
    <div class="h2h-grid" style="--n:${ps.length + 1}">
      ${headRow}${rows}
    </div>
    <div class="h2h-foot">Cada celda: partidos donde el jugador de la fila sumó más puntos que el de la columna · empates en puntos no cuentan.</div>`;
}

function renderPairs(s, root) {
  if (!s.gemelos || !s.rivales || !s.gemelos.total) {
    root.innerHTML = '<div class="stat-empty">Necesitamos más partidos jugados para calcular gemelos y rivales.</div>';
    return;
  }
  const card = (icon, label, p, n, total, tag) => `
    <div class="pair-card">
      <div class="pair-ico">${icon}</div>
      <div class="pair-label">${label}</div>
      <div class="pair-names">
        <span style="color:${p.a.color}">${p.a.name}</span>
        <span class="pair-amp">&amp;</span>
        <span style="color:${p.b.color}">${p.b.name}</span>
      </div>
      <div class="pair-n">${n}<small>/${total}</small></div>
      <div class="pair-tag">${tag}</div>
    </div>`;
  root.innerHTML = `
    <div class="pair-grid">
      ${card('👯', 'Los Gemelos',  s.gemelos, s.gemelos.same,     s.gemelos.total, 'picks idénticos')}
      ${card('⚔️', 'Los Rivales',   s.rivales, s.rivales.opposite, s.rivales.total, 'L vs V en el mismo partido')}
    </div>`;
}

function renderTendencias(s, root) {
  const players = Object.values(s.perPlayer);
  if (!players.length || !s.completed.length) {
    root.innerHTML = '<div class="stat-empty">Sin picks resueltos todavía.</div>';
    return;
  }
  root.innerHTML = `
    <div class="tend-grid">
      ${players.map(p => {
        const total = p.lev.L + p.lev.E + p.lev.V || 1;
        const pL = (p.lev.L / total) * 100;
        const pE = (p.lev.E / total) * 100;
        const pV = (p.lev.V / total) * 100;
        return `
          <div class="tend-card">
            <div class="tend-name" style="color:${p.player.color}">${p.player.name}</div>
            <div class="tend-bar">
              <span class="tend-seg tend-L" style="width:${pL}%" title="Local: ${p.lev.L}">${pL >= 14 ? `${p.lev.L}L` : ''}</span>
              <span class="tend-seg tend-E" style="width:${pE}%" title="Empate: ${p.lev.E}">${pE >= 14 ? `${p.lev.E}E` : ''}</span>
              <span class="tend-seg tend-V" style="width:${pV}%" title="Visita: ${p.lev.V}">${pV >= 14 ? `${p.lev.V}V` : ''}</span>
            </div>
            <div class="tend-legend">
              <span>${pL.toFixed(0)}% L</span><span>·</span><span>${pE.toFixed(0)}% E</span><span>·</span><span>${pV.toFixed(0)}% V</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderMarcadores(s, root) {
  const players = Object.values(s.perPlayer);
  if (!players.length || !s.completed.length) {
    root.innerHTML = '<div class="stat-empty">Sin marcadores que ranquear todavía.</div>';
    return;
  }
  root.innerHTML = `
    <div class="marc-grid">
      ${players.map(p => {
        const entries = Object.entries(p.marcadores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        const total = p.pj || 1;
        return `
          <div class="marc-card">
            <div class="marc-name" style="color:${p.player.color}">${p.player.name}</div>
            <ol class="marc-list">
              ${entries.length ? entries.map(([sc, n]) => `
                <li>
                  <span class="marc-score">${sc.replace('-', '–')}</span>
                  <span class="marc-bar"><span style="width:${(n/total*100).toFixed(0)}%;background:${p.player.color}"></span></span>
                  <span class="marc-n">${n}<small>/${total}</small></span>
                </li>`).join('') : '<li class="marc-empty">Sin picks resueltos</li>'}
            </ol>
          </div>`;
      }).join('')}
    </div>`;
}

function renderSplit(s, root) {
  const players = Object.values(s.perPlayer);
  if (!players.length) { root.innerHTML = '<div class="stat-empty">Sin datos.</div>'; return; }
  root.innerHTML = `
    <div class="split-grid">
      ${players.map(p => {
        const liga = p.perComp.liga    || { points: 0, pj: 0, hits: 0, plenos: 0, wo: 0 };
        const exp  = p.perComp.experto || { points: 0, pj: 0, hits: 0, plenos: 0, wo: 0 };
        const efL = liga.pj ? (liga.hits / liga.pj * 100) : 0;
        const efE = exp.pj  ? (exp.hits / exp.pj * 100)  : 0;
        return `
          <div class="split-card">
            <div class="split-name" style="color:${p.player.color}">${p.player.name}</div>
            <div class="split-row">
              <div class="split-comp">LIGA</div>
              <div class="split-pts"><b>${liga.points.toFixed(0)}</b><small> pts</small></div>
              <div class="split-meta">${liga.plenos}P · ${efL.toFixed(0)}% ef.</div>
            </div>
            <div class="split-row">
              <div class="split-comp">EXPERTO</div>
              <div class="split-pts"><b>${exp.points.toFixed(0)}</b><small> pts</small></div>
              <div class="split-meta">${exp.plenos}P · ${efE.toFixed(0)}% ef.</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderWO(s, root) {
  const players = Object.values(s.perPlayer);
  const wos = players.map(p => ({ p: p.player, wo: p.wo }));
  const maxWO = Math.max(...wos.map(x => x.wo), 1);
  const minWO = Math.min(...wos.map(x => x.wo));
  const rg = (maxWO - minWO) || 1;

  const color = r =>
    r === 0   ? { bg: 'rgba(46,107,58,.08)',  bc: 'rgba(46,107,58,.28)',  t: '#2E6B3A' } :
    r < .25   ? { bg: 'rgba(46,107,58,.05)',  bc: 'rgba(46,107,58,.18)',  t: '#3a8a4a' } :
    r < .5    ? { bg: 'rgba(232,179,61,.09)', bc: 'rgba(232,179,61,.28)', t: '#9a7010' } :
    r < .75   ? { bg: 'rgba(232,68,44,.07)',  bc: 'rgba(232,68,44,.22)',  t: '#b83020' } :
                { bg: 'rgba(232,68,44,.10)',  bc: 'rgba(232,68,44,.28)',  t: '#E8442C' };

  root.innerHTML = '';
  for (const { p, wo } of wos) {
    const wc = color((wo - minWO) / rg);
    const bp = maxWO ? (wo / maxWO * 100).toFixed(0) : 0;
    const card = document.createElement('div');
    card.className = 'wo-card';
    card.style.background = wc.bg;
    card.style.borderColor = wc.bc;
    card.innerHTML = `
      <div class="wo-ava-row">
        ${p.avatar_url ? `<img class="wo-ava" src="${p.avatar_url}" onerror="this.style.display='none'">` : ''}
        <div class="wo-name" style="color:${wc.t}">${p.name}</div>
      </div>
      <div class="wo-n" style="color:${wc.t}">${wo}</div>
      <div class="wo-l" style="color:${wc.t}">WO</div>
      <div class="wo-bw"><div class="wo-bf" style="width:0%;background:${wc.t}"></div></div>`;
    root.appendChild(card);
    setTimeout(() => card.querySelector('.wo-bf').style.width = bp + '%', 250);
  }
}

// ╔════════════════════════════════════════════════════════════════╗
// ║  ORCHESTRATOR                                                    ║
// ╚════════════════════════════════════════════════════════════════╝

export function renderStats() {
  const s = computeAllStats();
  const blocks = [
    ['stat-hero',        renderHero],
    ['stat-awards',      renderAwards],
    ['stat-evolution',   renderEvolution],
    ['stat-heatmap',     renderHeatmap],
    ['stat-h2h',         renderH2H],
    ['stat-pairs',       renderPairs],
    ['stat-tendencias',  renderTendencias],
    ['stat-marcadores',  renderMarcadores],
    ['stat-split',       renderSplit],
    ['wo-grid',          renderWO],
  ];
  for (const [id, fn] of blocks) {
    const el = document.getElementById(id);
    if (el) fn(s, el);
  }
}
