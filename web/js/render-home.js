// ════════════════════════════════════════════════════════════════════
// Home view — leaderboard, title race, narrative feed, próximos picks,
// últimos resultados.
// ════════════════════════════════════════════════════════════════════
import { getState, setState, hasRes, hasPick, isFut, h2r, mDate, TODAY, hoursUntil, fmtPts, escapeHtml as esc } from './state.js?v=20260607qa44';
import { CONFIG } from './config.js?v=20260607qa44';
import { renderBadge, computeBadgesFor, computeXPFor, LEVEL_DEFS, computeMissionsFor } from './game-fx.js?v=20260607qa44';

const PLAYERS = CONFIG.PLAYERS;

function playerFigureSvg(color, name) {
  const ini = name[0].toUpperCase();
  return `<svg viewBox="0 0 20 28" width="20" height="28" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="10" cy="27" rx="5" ry="1.4" fill="rgba(0,0,0,.18)"/>
    <!-- hair -->
    <path d="M7.5 3.5 Q10 1 12.5 3.5 Q13.5 2 13 0.5 Q10 -0.5 7 0.5 Q6.5 2 7.5 3.5 Z" fill="#3B1F0A"/>
    <!-- head -->
    <circle cx="10" cy="4.5" r="3.3" fill="#F5C9A0"/>
    <!-- jersey body -->
    <path d="M5 8.5 Q10 7 15 8.5 L16 17 Q10 18.5 4 17 Z" fill="${color}"/>
    <text x="10" y="15.5" text-anchor="middle" font-size="4.5" fill="rgba(255,255,255,.92)"
          font-family="sans-serif" font-weight="bold">${ini}</text>
    <!-- arms -->
    <path d="M15 10 Q17.5 12 17 16" stroke="${color}" stroke-width="2.3" stroke-linecap="round" fill="none"/>
    <path d="M5 10 Q2.5 12 3 16" stroke="${color}" stroke-width="2.3" stroke-linecap="round" fill="none"/>
    <!-- shorts -->
    <path d="M4 17 Q10 19 16 17 L15.5 22 L10 21.5 L4.5 22 Z" fill="#1a1a1a"/>
    <!-- legs -->
    <path d="M6.5 22 Q5 25 3.5 28" stroke="#F5C9A0" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <ellipse cx="3" cy="27.5" rx="3" ry="1.4" fill="#111" transform="rotate(-15,3,27.5)"/>
    <path d="M13.5 22 Q15.5 25 17 22" stroke="#F5C9A0" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <ellipse cx="17.5" cy="22" rx="2.6" ry="1.3" fill="#111" transform="rotate(25,17.5,22)"/>
  </svg>`;
}

function playerStats(playerName, matchList) {
  const { matches, picks, players } = getState();
  const list = matchList || matches;
  const pl = players.find(p => p.name === playerName);
  if (!pl) return { total: 0, plenos: 0, aciertos: 0, wo: 0, pj: 0 };
  let total = 0, plenos = 0, aciertos = 0, wo = 0, pj = 0;
  for (const m of list) {
    if (!hasRes(m)) continue;
    const pk = picks.find(x => x.match_id === m.id && x.player_id === pl.id);
    if (!pk || pk.home_score == null) { wo++; continue; }
    pj++;
    total += Number(pk.points || 0);
    if (pk.status === 'P' || pk.status === 'P ') plenos++;
    else if (pk.status === 'Ac') aciertos++;
  }
  return { total: +total.toFixed(2), plenos, aciertos, wo, pj };
}

// ── Scope helpers (qa32) ──────────────────────────────────────────────
// Devuelve el subconjunto de partidos para un scope dado:
//   'general'        → todos
//   'liga'           → competencia liga
//   'exp:<torneo>'   → experto + ese round.name (torneo)
//   'experto'        → todos los de experto (usado en Partidos)
export function scopeMatches(scope) {
  const { matches, rounds } = getState();
  if (!scope || scope === 'general') return matches;
  if (scope === 'liga')    return matches.filter(m => m.competition_id === 'liga');
  if (scope === 'experto') return matches.filter(m => m.competition_id === 'experto');
  if (scope.startsWith('exp:')) {
    const torneo = scope.slice(4);
    return matches.filter(m => {
      if (m.competition_id !== 'experto') return false;
      const r = rounds.find(rr => rr.id === m.round_id);
      return (r && r.name) === torneo;
    });
  }
  return matches;
}

// Calcula y ordena el ranking sobre un subconjunto de partidos.
export function computeStandings(matchList) {
  return PLAYERS.map(name => ({ name, ...playerStats(name, matchList) }))
    .sort((a, b) => b.total - a.total);
}

// Torneos de Experto presentes (distintos round.name), ordenados.
function expertoTorneos() {
  const { matches, rounds } = getState();
  const ids = new Set(matches.filter(m => m.competition_id === 'experto').map(m => m.round_id));
  return rounds
    .filter(r => r.competition_id === 'experto' && ids.has(r.id))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map(r => r.name);
}

const SCOPE_LABEL = {
  general: 'General',
  liga:    'Liga de Primera',
  experto: 'Partidos Experto',
};
function scopeLabel(scope) {
  if (SCOPE_LABEL[scope]) return SCOPE_LABEL[scope];
  if (scope && scope.startsWith('exp:')) return scope.slice(4);
  return 'General';
}

function getForm(playerName, n = 5) {
  // Últimas N jugadas DEL JUGADOR (matches con resultado donde marcó pick).
  // No incluye WO: la racha de forma reciente describe cómo le va a quien
  // juega, no el "cumplimiento" de marcar. El total de WO sigue visible en
  // la columna correspondiente.
  const { matches, picks, players } = getState();
  const pl = players.find(p => p.name === playerName);
  if (!pl) return [];
  return matches
    .filter(hasRes)
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
    .map(m => ({ m, pk: picks.find(x => x.match_id === m.id && x.player_id === pl.id) }))
    .filter(x => x.pk && x.pk.home_score != null)
    .slice(-n)
    .map(({ pk }) => {
      const s = (pk.status || '').toString().trim();
      if (s === 'P') return 'P';
      if (s === 'Ac') return 'Ac';
      return 'miss';
    });
}

const PLANTEL = [
  {
    name: 'Blopa', num: '10', pos: 'Enganche', color: '#E8B33D',
    img: './img/characters/blopa.png',
    stats: [['VISIÓN',88],['GAMBETA',82],['CAÑO',74],['BARDEO',65],['SUERTE',81]],
    frase: 'Yo la pongo donde quiero, hermano.', cuando: 'pre-partido',
  },
  {
    name: 'Dari', num: '04', pos: 'Stopper', color: '#1E4FB8',
    img: './img/characters/dari.png',
    stats: [['FUERZA',92],['CABEZA',90],['CADERAZO',84],['BARDEO',88],['VELOCIDAD',64]],
    frase: 'Pidan la pelota, yo se las quito igual.', cuando: 'todos los partidos',
  },
  {
    name: 'Pela', num: '08', pos: 'Volante', color: '#2E6B3A',
    img: './img/characters/pela.png',
    stats: [['VELOCIDAD',95],['PULMÓN',99],['QUITE',78],['CAÑO',60],['BARDEO',55]],
    frase: 'Si no terminé reventado, no jugué.', cuando: 'siempre',
  },
  {
    name: 'Kmi', num: '07', pos: 'Extremo', color: '#E8442C',
    img: './img/characters/kmi.png',
    stats: [['GAMBETA',95],['CAÑO',96],['VELOCIDAD',82],['BARDEO',90],['EGO',99]],
    frase: '¿Caño? Cuál caño, eso fue magia.', cuando: 'después de cada caño',
  },
];

function renderPlantel() {
  const root = document.getElementById('plantel-cards');
  if (!root) return;
  const rotations = [-1.2, 0.8, -0.6, 1.4];
  root.innerHTML = `
    <div class="plantel-row">
      ${PLANTEL.map((p, i) => `
        <article class="pcard-wrap" style="--rot:${rotations[i]}deg">
          <div class="pcard" style="--accent:${p.color}">
            <div class="pcard-foil">
              <span class="pcard-num">#${p.num}</span>
              <span class="pcard-label">CROMO · 0${i+1}/04${i === 3 ? ' · ★' : ''}</span>
            </div>
            <div class="pcard-photo">
              <img src="${p.img}" alt="${p.name}" loading="lazy">
              <div class="pcard-band" style="background:${p.color}"></div>
              <div class="pcard-nameplate">${p.name.toUpperCase()}</div>
            </div>
            <div class="pcard-body">
              <div class="pcard-role">
                <span class="pcard-pos">${p.pos.toUpperCase()}</span>
                <span class="pcard-dorsal">#${p.num}</span>
              </div>
              <div class="pcard-stats">
                ${p.stats.map(([label, v]) => `
                  <div class="pcard-stat">
                    <span class="pcard-stat-lbl">${label}</span>
                    <span class="pcard-stat-bar"><span style="width:${v}%;background:${p.color}"></span></span>
                    <span class="pcard-stat-v">${v}</span>
                  </div>`).join('')}
              </div>
              <p class="pcard-frase" style="border-left-color:${p.color}">
                <span class="pcard-quote" style="color:${p.color}">"</span>${p.frase}
                <span class="pcard-quien">— ${p.name} · ${p.cuando}</span>
              </p>
            </div>
          </div>
        </article>`).join('')}
    </div>
    <div class="plantel-footer">
      <span>BANDITAS FC · POLLA OFICIAL · COLECCIONÁ LOS 4</span>
      <span class="plantel-sign">¡pegalos en tu álbum!</span>
    </div>`;
}

const CRONICAS = [
  // Jugada 02 — la trencita (mas reciente)
  {
    num: '02', min: 44,
    title: 'Blopa rompe líneas', titleEm: '· la trencita 🚂',
    subtitle: 'Persecución pasada la mitad · Pela observa desde lejos',
    positions: [
      { name: 'Pela',  color: '#2E6B3A', x: 14, y: 50, ini: 'P' },
      { name: 'Kmi',   color: '#E8442C', x: 54, y: 66, ini: 'K' },
      { name: 'Dari',  color: '#1E4FB8', x: 68, y: 58, ini: 'D' },
      { name: 'Blopa', color: '#E8B33D', x: 82, y: 50, ini: 'B', ball: true },
    ],
    overlay: num => `
      <path d="M 340 120 L 480 120"
            fill="none" stroke="#8C1D2F" stroke-width="4"
            stroke-dasharray="8 6" stroke-linecap="round"
            marker-end="url(#cron-arr-${num})" opacity=".7"/>
      <g transform="translate(180, 116)">
        <rect x="-44" y="-9" width="88" height="18" fill="#F2E3C2" stroke="#1F1A2E" stroke-width="1.5"/>
        <text y="4" text-anchor="middle" font-family="Space Mono" font-weight="700"
              font-size="10" fill="#1F1A2E" letter-spacing="1.5">≈ 40 MTS GAP</text>
      </g>`,
    narration: `
      <strong style="color:#E8B33D">Blopa</strong> rompe la línea con la pelota, ya pasó el círculo central.
      <strong style="color:#1E4FB8">Dari</strong> sale a buscarlo,
      <strong style="color:#E8442C">Kmi</strong> sale a buscar a Dari…
      y <strong style="color:#2E6B3A">Pela</strong> sigue en su propio campo,
      solito, viendo la película. <em>Ojo, ese es box-to-box, eh.</em>`,
    voces: [
      { who: 'Blopa', color: '#E8B33D', q: '"¡no me alcanzan, hermanos!"' },
      { who: 'Dari',  color: '#1E4FB8', q: '"¡volvé acá, ladrón!"' },
      { who: 'Kmi',   color: '#E8442C', q: '"¿pero por qué corro YO?"' },
      { who: 'Pela',  color: '#2E6B3A', q: '"...llego en un toque, eh"' },
    ],
    score: '2 — 1', scoreLabel: 'BANDITAS FC · VISITA',
  },

  // Jugada 01 — Kmi habilita a Dari
  {
    num: '01', min: 38,
    title: 'Kmi habilita a Dari', titleEm: '· caño + definición',
    subtitle: 'Pase desde la banda · gol al palo largo',
    positions: [
      { name: 'Blopa', color: '#E8B33D', x: 30, y: 42, ini: 'B' },
      { name: 'Pela',  color: '#2E6B3A', x: 44, y: 76, ini: 'P' },
      { name: 'Kmi',   color: '#E8442C', x: 74, y: 25, ini: 'K', ball: true },
      { name: 'Dari',  color: '#1E4FB8', x: 86, y: 75, ini: 'D' },
    ],
    overlay: num => `
      <!-- pase de Kmi a Dari (arco bajando hacia el area) -->
      <path d="M 460 70 Q 540 120 520 180"
            fill="none" stroke="#1F1A2E" stroke-width="3.5"
            stroke-dasharray="8 6" stroke-linecap="round"
            marker-end="url(#cron-arr-${num})" opacity=".75"/>
      <!-- caño + definicion al palo largo (curl bordó cerca del area) -->
      <path d="M 510 195 C 520 215, 555 215, 560 195 S 545 165, 565 158"
            fill="none" stroke="#8C1D2F" stroke-width="3"
            stroke-dasharray="4 5" stroke-linecap="round"
            marker-end="url(#cron-arr-${num})" opacity=".8"/>
      <!-- marker "caño" -->
      <g transform="translate(450, 215)">
        <rect x="-36" y="-9" width="72" height="18" fill="#F2E3C2" stroke="#1F1A2E" stroke-width="1.5"/>
        <text y="4" text-anchor="middle" font-family="Space Mono" font-weight="700"
              font-size="10" fill="#1F1A2E" letter-spacing="1.5">CAÑO →</text>
      </g>`,
    narration: `
      <strong style="color:#E8442C">Kmi</strong> aguanta en la banda, espera, espera…
      y la pone justo para <strong style="color:#1E4FB8">Dari</strong>, que entra al área,
      le tira un <strong>caño al defensor</strong> y la pone al palo largo.
      <em>El gordo definió como goleador, eh.</em>`,
    voces: [
      { who: 'Kmi',   color: '#E8442C', q: '"¡Pásala fácil que estoy solo!"' },
      { who: 'Dari',  color: '#1E4FB8', q: '"Tranqui · ya le hago el caño y la cuelgo"' },
      { who: 'Blopa', color: '#E8B33D', q: '"Le doy a Kmi · que vea él"' },
      { who: 'Pela',  color: '#2E6B3A', q: '"Yo corro igual aunque no me pasen"' },
    ],
    score: '2 — 1', scoreLabel: 'BANDITAS FC · VISITA',
  },
];

function cronicaHtml(c) {
  const dotsHtml = c.positions.map(p => `
    <g class="cron-dot" transform="translate(${p.x * 6}, ${p.y * 2.4})">
      <circle r="14" fill="${p.color}" stroke="#1F1A2E" stroke-width="2.5"/>
      <text y="5" text-anchor="middle" font-family="Anton" font-style="italic"
            font-size="14" fill="#fff">${p.ini}</text>
      <text y="32" text-anchor="middle" font-family="Space Mono" font-weight="700"
            font-size="9" fill="#1F1A2E" letter-spacing="1.4">${p.name.toUpperCase()}</text>
      ${p.ball ? `<circle cx="18" cy="0" r="5" fill="#fff" stroke="#1F1A2E" stroke-width="1.5"/>` : ''}
    </g>`).join('');

  const vocesHtml = c.voces.map(v => `
    <div class="cronica-quote" style="--c:${v.color}">
      <span class="cronica-q">${v.q}</span>
      <span class="cronica-w">— ${v.who}</span>
    </div>`).join('');

  return `
    <article class="cronica">
      <div class="cronica-meta">
        <span class="cronica-live"><span class="cronica-dot"></span> EN VIVO · MIN ${c.min}'</span>
        <span class="cronica-tag">JUGADA ${c.num} · FECHA 1</span>
      </div>

      <div class="cronica-title">
        <span class="cronica-num">${c.num}</span>
        <div>
          <h3>${c.title}${c.titleEm ? ` <em>${c.titleEm}</em>` : ''}</h3>
          <div class="cronica-sub">${c.subtitle}</div>
        </div>
      </div>

      <div class="cronica-grid">
        <div class="cronica-pitch">
          <svg viewBox="0 0 600 240" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="stripes-${c.num}" width="80" height="240" patternUnits="userSpaceOnUse">
                <rect width="40" height="240" fill="#1F4E2A"/>
              </pattern>
              <marker id="cron-arr-${c.num}" viewBox="0 0 12 12" refX="10" refY="6"
                      markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L12 6 L0 12 Z" fill="#8C1D2F"/>
              </marker>
            </defs>
            <rect width="600" height="240" fill="#2E6B3A"/>
            <rect width="600" height="240" fill="url(#stripes-${c.num})" opacity=".3"/>
            <g fill="none" stroke="#FFF8E0" stroke-width="2" opacity=".75" stroke-linecap="round">
              <rect x="6" y="6" width="588" height="228" rx="2"/>
              <line x1="300" y1="6" x2="300" y2="234"/>
              <circle cx="300" cy="120" r="34"/>
              <circle cx="300" cy="120" r="2" fill="#FFF8E0"/>
              <rect x="6" y="66" width="60" height="108"/>
              <rect x="534" y="66" width="60" height="108"/>
            </g>
            ${c.overlay(c.num)}
            ${dotsHtml}
          </svg>
        </div>

        <div class="cronica-body">
          <p class="cronica-lead">${c.narration}</p>
          <div class="cronica-voces">
            <div class="cronica-voces-lbl">📣 Voces del campo</div>
            ${vocesHtml}
          </div>
        </div>
      </div>

      <div class="cronica-footer">
        <span class="cronica-clock">${c.score}</span>
        <span class="cronica-clock-l">${c.scoreLabel}</span>
      </div>
    </article>`;
}

function renderAlbum() {
  const root = document.getElementById('album');
  if (!root) return;
  const { matches, picks, players, rounds, competitions } = getState();

  // Mapa de jugadores: id → {name, color, img} (combina state.players + PLANTEL)
  const playerList = PLAYERS
    .map(name => ({ pl: players.find(p => p.name === name), meta: PLANTEL.find(p => p.name === name) }))
    .filter(x => x.pl && x.meta)
    .map(({ pl, meta }) => ({ id: pl.id, name: pl.name, color: meta.color, img: meta.img }));

  if (!playerList.length) {
    root.innerHTML = '<div class="album-empty">Cargando plantel…</div>';
    return;
  }

  // Agrupar partidos jugados por round_id
  const completed = matches.filter(hasRes);
  const groups = {};
  for (const m of completed) {
    const key = `${m.competition_id || 'liga'}::${m.round_id || '—'}`;
    if (!groups[key]) {
      const round = (rounds || []).find(r => r.id === m.round_id);
      const comp  = (competitions || []).find(c => c.id === m.competition_id);
      groups[key] = {
        roundName: round?.name || m.round_id || '—',
        compName:  comp?.name  || (m.competition_id === 'experto' ? 'Experto' : 'Liga'),
        matches: [],
        latest: 0,
      };
    }
    groups[key].matches.push(m);
    const t = new Date(m.match_date).getTime();
    if (t > groups[key].latest) groups[key].latest = t;
  }

  // Top 2 fechas más recientes (más reciente arriba)
  const pages = Object.values(groups)
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 2);

  if (!pages.length) {
    root.innerHTML = `
      <div class="album-empty">
        <div class="album-empty-ico">📒</div>
        Sin fechas jugadas todavía.<br>
        <span class="album-empty-sub">Pegale al primer pleno y armás página.</span>
      </div>`;
    return;
  }

  root.innerHTML = pages.map(page => {
    const dateStr = new Date(page.latest).toLocaleDateString('es-CL', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).toUpperCase();

    const matchesHtml = page.matches
      .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
      .map(m => {
        const stickers = playerList.map((pl, idx) => {
          const pk = picks.find(x => x.match_id === m.id && x.player_id === pl.id);
          let stateCls = 'WO', score = '— —', label = 'WO';
          if (pk && pk.home_score != null && pk.away_score != null) {
            const s = (pk.status || '').toString().trim();
            stateCls = s === 'P' ? 'P' : s === 'Ac' ? 'Ac' : 'miss';
            score = `${pk.home_score}–${pk.away_score}`;
            label = s === 'P' ? '★ PLENO' : s === 'Ac' ? '✓ ACIERTO' : '✗ FALLÓ';
          }
          // Rotación pseudo-aleatoria pero estable (basada en idx y match id)
          const rot = (((m.id || '').toString().length + idx) % 5) - 2;
          return `
            <div class="album-sticker album-st-${stateCls}" style="--c:${pl.color};--rot:${rot}deg" title="${pl.name} · ${label}">
              <div class="album-sticker-photo">
                <img src="${pl.img}" alt="${pl.name}" loading="lazy">
                <div class="album-sticker-band" style="background:${pl.color}"></div>
              </div>
              <div class="album-sticker-name">${pl.name.toUpperCase()}</div>
              <div class="album-sticker-score">${score}</div>
              <div class="album-sticker-label">${label}</div>
            </div>`;
        }).join('');

        return `
          <div class="album-match">
            <div class="album-match-hdr">
              <span class="album-team">${esc(m.home_team)}</span>
              <span class="album-result"><b>${m.home_score}</b><small>—</small><b>${m.away_score}</b></span>
              <span class="album-team album-team-right">${esc(m.away_team)}</span>
            </div>
            <div class="album-stickers">${stickers}</div>
          </div>`;
      }).join('');

    return `
      <article class="album-page">
        <header class="album-page-hdr">
          <div>
            <div class="album-page-comp">${page.compName.toUpperCase()}</div>
            <div class="album-page-fecha">${page.roundName}</div>
          </div>
          <div class="album-page-date">${dateStr}</div>
        </header>
        <div class="album-page-matches">${matchesHtml}</div>
      </article>`;
  }).join('');
}

function renderCronicas() {
  const root = document.getElementById('cronicas');
  if (!root) return;
  root.innerHTML = CRONICAS.map(cronicaHtml).join('');
}

// ── Crónica auto ────────────────────────────────────────────────────
const CA_QUOTES = {
  Blopa: {
    won: '"Esto lo veía venir. La fecha era mía desde el arranque."',
    ok:  '"Ahí vamos. Tranqui que llego."',
    bad: '"Tácticamente no me dieron el partido que necesitaba."',
    wo:  '"Se me pasó marcar... pero si marcaba, pleno seguro."',
  },
  Dari: {
    won: '"Pedí la pelota y la metí. Así de fácil."',
    ok:  '"Sólido. El Stopper siempre está."',
    bad: '"Me robaron el resultado. No me convencen esos árbitros."',
    wo:  '"Estaba ocupado — pero si marcaba, clavaba el marcador."',
  },
  Pela: {
    won: '"El pulmón nunca miente. Corrí toda la fecha."',
    ok:  '"Bien, bien. Ritmo constante."',
    bad: '"Próxima fecha los reviento. Necesito más ritmo en los picks."',
    wo:  '"¿WO? Pero yo corrí igual aunque no haya marcado."',
  },
  Kmi: {
    won: '"¿Vieron? Lo dije. Magia pura, no hay otra."',
    ok:  '"El caño al marcador salió limpio. Eso es talento."',
    bad: '"El marcador me hizo un caño a mí esta vez. La revancha viene."',
    wo:  '"No marqué porque ya sabía el resultado. Era demasiado obvio."',
  },
};

const CA_LEADS = [
  (w, r, pts, p) => `${w} se quedó con la fecha ${r} — ${pts} puntos${p > 0 ? `, ${p} pleno${p > 1 ? 's' : ''}` : ''} y nadie le pisó el acelerador.`,
  (w, r, pts, p) => `Fecha ${r}: ${w} dominó de principio a fin. ${pts} puntos y punto.`,
  (w, r, pts, p) => `${w} barrió con la fecha ${r}. ${pts} puntos${p > 0 ? ` y ${p} pleno${p > 1 ? 's' : ''}` : ''}. El resto que tome nota.`,
];

function renderCronicaAuto() {
  const root = document.getElementById('cronica-auto');
  if (!root) return;
  const { matches, picks, players, rounds, competitions } = getState();

  // Última fecha donde todos los partidos están cerrados
  const byRound = {};
  for (const m of matches) {
    const key = `${m.competition_id || 'liga'}::${m.round_id || '—'}`;
    if (!byRound[key]) byRound[key] = { compId: m.competition_id || 'liga', roundId: m.round_id || '—', matches: [], latest: 0 };
    byRound[key].matches.push(m);
    const t = new Date(m.match_date).getTime();
    if (t > byRound[key].latest) byRound[key].latest = t;
  }
  const closed = Object.values(byRound)
    .filter(g => g.matches.length > 0 && g.matches.every(hasRes))
    .sort((a, b) => b.latest - a.latest);

  if (!closed.length) {
    root.innerHTML = '<div class="ca-empty">Sin fechas cerradas todavía — la crónica se genera sola cuando termina la primera.</div>';
    return;
  }

  const round = closed[0];
  const roundName = (rounds || []).find(r => r.id === round.roundId)?.name || round.roundId;
  const compName  = (competitions || []).find(c => c.id === round.compId)?.name || (round.compId === 'experto' ? 'Experto' : 'Liga');
  const dateStr   = new Date(round.latest).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

  const allPlayers = PLAYERS
    .map(name => ({ pl: players.find(p => p.name === name), meta: PLANTEL.find(p => p.name === name) }))
    .filter(x => x.pl && x.meta)
    .map(({ pl, meta }) => ({ id: pl.id, name: pl.name, color: meta.color, img: meta.img }));

  // Estadísticas de cada jugador en esta fecha
  const pStats = allPlayers.map(p => {
    let pts = 0, plenos = 0, aciertos = 0, wo = 0, bestPick = null;
    for (const m of round.matches) {
      const pk = picks.find(x => x.match_id === m.id && x.player_id === p.id);
      if (!pk || pk.home_score == null) { wo++; continue; }
      const pkt = Number(pk.points || 0);
      pts += pkt;
      const s = (pk.status || '').toString().trim();
      if (s === 'P') {
        plenos++;
        if (!bestPick || pkt > bestPick.pts) bestPick = { pts: pkt, match: m, pick: pk, player: p };
      } else if (s === 'Ac') aciertos++;
    }
    return { ...p, pts: +pts.toFixed(2), plenos, aciertos, wo, bestPick };
  }).sort((a, b) => b.pts - a.pts);

  const winner = pStats[0];
  let topPick = null;
  for (const ps of pStats) {
    if (ps.bestPick && (!topPick || ps.bestPick.pts > topPick.pts)) topPick = ps.bestPick;
  }

  // Lead paragraph — índice estable basado en el nombre de la jornada
  const leadIdx = (roundName.charCodeAt(roundName.length - 1) || 0) % CA_LEADS.length;
  const lead = CA_LEADS[leadIdx](winner.name, roundName, winner.pts, winner.plenos);

  // Header de columnas
  const headCols = allPlayers.map(p =>
    `<div class="ca-col-head" style="color:${p.color}">${p.name[0]}</div>`
  ).join('');

  // Tabla por partido
  const sortedMatches = [...round.matches].sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  const matchRows = sortedMatches.map(m => {
    const cells = allPlayers.map(p => {
      const pk = picks.find(x => x.match_id === m.id && x.player_id === p.id);
      if (!pk || pk.home_score == null)
        return `<div class="ca-cell ca-wo" title="${p.name} · WO">WO</div>`;
      const s = (pk.status || '').toString().trim();
      const isP = s === 'P', isAc = s === 'Ac';
      const cls = isP ? 'ca-p' : isAc ? 'ca-ac' : 'ca-miss';
      const lbl = isP ? '★' : isAc ? '✓' : '✗';
      return `<div class="ca-cell ${cls}" style="${isP ? `border-top-color:${p.color}` : ''}" title="${p.name} · ${pk.home_score}–${pk.away_score}">${lbl}</div>`;
    }).join('');
    return `<div class="ca-match-row">
      <div class="ca-match-name">${esc(m.home_team)} <span class="ca-score-final">${m.home_score}–${m.away_score}</span> ${esc(m.away_team)}</div>
      <div class="ca-cells">${cells}</div>
    </div>`;
  }).join('');

  // Ranking de la fecha
  const rankRows = pStats.map((ps, i) => `
    <div class="ca-rank-row">
      <div class="ca-rank-pos ${i === 0 ? 'ca-rank-1' : ''}">${i === 0 ? '★' : i + 1}</div>
      <div class="ca-rank-name" style="color:${ps.color}">${ps.name}</div>
      <div class="ca-rank-pts" style="color:${i === 0 ? ps.color : 'inherit'}">${ps.pts}</div>
      <div class="ca-rank-meta">${ps.plenos}P · ${ps.aciertos}Ac${ps.wo > 0 ? ` · ${ps.wo}WO` : ''}</div>
    </div>`).join('');

  // Voces del vestuario
  const voices = pStats.map(ps => {
    const q = CA_QUOTES[ps.name]; if (!q) return '';
    const tier = ps.name === winner.name ? 'won'
               : ps.plenos > 0 || ps.aciertos >= 2 ? 'ok'
               : ps.wo > 0 ? 'wo' : 'bad';
    return `<div class="ca-voice" style="--c:${ps.color}">
      <div class="ca-voice-name" style="color:${ps.color}">${ps.name}</div>
      <div class="ca-voice-q">${q[tier]}</div>
    </div>`;
  }).join('');

  const plenoHtml = topPick ? `
    <div class="ca-highlight">
      <div class="ca-highlight-tag">⭐ El pleno del día</div>
      <div class="ca-highlight-body">
        <span style="color:${topPick.player.color};font-family:var(--bb-display);font-style:italic">${topPick.player.name}</span>
        clavó <strong>${topPick.pick.home_score}–${topPick.pick.away_score}</strong>
        en ${esc(topPick.match.home_team)} vs ${esc(topPick.match.away_team)}.
        Cuota ${topPick.match.result_factor ?? '—'} → <strong style="color:var(--bb-maroon)">+${topPick.pts} pts</strong>.
      </div>
    </div>` : '';

  root.innerHTML = `
    <article class="ca-article">
      <div class="ca-article-meta">
        <div>
          <span class="ca-comp">${compName.toUpperCase()}</span>
          <span class="ca-round">${roundName}</span>
        </div>
        <div class="ca-right">
          <span class="ca-date">${dateStr}</span>
          <button class="ca-share-btn ca-dl-btn" id="ca-download-btn">⬇ Descargar</button>
          <button class="ca-share-btn" id="ca-share-btn">⬆ Compartir</button>
        </div>
      </div>

      <div class="ca-winner-banner" style="--c:${winner.color}">
        <div class="ca-winner-ini">${winner.name[0]}</div>
        <div style="flex:1;min-width:0">
          <div class="ca-winner-name" style="color:${winner.color}">${winner.name}</div>
          <div class="ca-winner-sub">ganó la fecha · ${winner.pts} pts · ${winner.plenos}P · ${winner.aciertos}Ac</div>
        </div>
        <div class="ca-winner-pts" style="color:${winner.color}">+${winner.pts}</div>
      </div>

      <p class="ca-lead">${lead}</p>
      ${plenoHtml}

      <div class="ca-section-lbl">Partido por partido</div>
      <div class="ca-table">
        <div class="ca-table-head">
          <div class="ca-match-lbl">Partido</div>
          <div class="ca-cells">${headCols}</div>
        </div>
        ${matchRows}
      </div>

      <div class="ca-section-lbl">Puntos de la fecha</div>
      <div class="ca-rank">${rankRows}</div>

      <div class="ca-section-lbl">📣 Vestuario</div>
      <div class="ca-voices">${voices}</div>
    </article>`;

  document.getElementById('ca-share-btn').onclick = () => {
    const url = window.location.href.split('#')[0];
    if (navigator.share) {
      navigator.share({ title: `BanditaBet · ${roundName}`, url });
    } else {
      navigator.clipboard?.writeText(url).then(() => window.bbToast?.('✓ Link copiado'));
    }
  };

  // ── Descargar la crónica como imagen de alta calidad (qa24) ──────────
  // Captura el <article> completo a PNG con pixelRatio 3 (retina-grade).
  // html-to-image se carga on-demand desde CDN solo al primer click.
  document.getElementById('ca-download-btn').onclick = async (e) => {
    const btn = e.currentTarget;
    const article = root.querySelector('.ca-article');
    if (!article) return;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Generando…';
    try {
      const { toPng } = await import('https://esm.sh/html-to-image@1.11.13');
      // Fondo sólido según el tema actual (evita PNG con fondo transparente)
      const bg = getComputedStyle(article).backgroundColor || '#f4ecd8';
      const dataUrl = await toPng(article, {
        pixelRatio: 3,
        backgroundColor: bg,
        cacheBust: true,
        // No incluir los botones en la imagen exportada
        filter: (node) => !(node.tagName === 'BUTTON'),
      });
      const slug = roundName.toString().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const a = document.createElement('a');
      a.download = `banditabet-cronica-${slug || 'fecha'}.png`;
      a.href = dataUrl;
      a.click();
      window.bbToast?.('✓ Crónica descargada');
    } catch (err) {
      console.error('[cronica] export error', err);
      window.bbToast?.('No se pudo generar la imagen', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  };
}

const LOGROS_DEF = [
  { key: 'pleno',         ico: '◎',  title: 'El primer pleno',   desc: 'Acertaste el marcador exacto' },
  { key: 'pleno_solo',    ico: '★',  title: 'Pleno solitario',   desc: 'El único en clavar ese marcador' },
  { key: 'doblete',       ico: '⚡', title: 'Doblete',           desc: '2 plenos en la misma fecha' },
  { key: 'hat_trick',     ico: '🎩', title: 'Hat-trick',         desc: '3 plenos en la misma fecha' },
  { key: 'streak_3',      ico: '🔥', title: 'Racha x3',          desc: '3 aciertos o plenos seguidos' },
  { key: 'streak_5',      ico: '🔥', title: 'En llamas',         desc: '5 aciertos o plenos seguidos' },
  { key: 'perfect_round', ico: '👑', title: 'Jornada perfecta',  desc: 'Todos los partidos de una fecha: P o Ac' },
  { key: 'goleador',      ico: '⚽', title: 'El goleador',       desc: 'Pleno exacto con 4+ goles en el partido' },
  { key: 'zero_wo',       ico: '🏅', title: 'Sin un WO',         desc: 'Toda la temporada sin dejar de marcar' },
];

const LOGRO_ROTS = [-1.5, 0.8, -0.6, 1.2];

function renderLogros() {
  const root = document.getElementById('logros');
  if (!root) return;
  const { players } = getState();
  const allPlayers = PLAYERS
    .map(name => ({ pl: players.find(p => p.name === name), meta: PLANTEL.find(p => p.name === name) }))
    .filter(x => x.pl && x.meta)
    .map(({ pl, meta }) => ({ id: pl.id, name: pl.name, color: meta.color, img: meta.img }));
  if (!allPlayers.length) { root.innerHTML = ''; return; }

  const playerBadges = {};
  for (const p of allPlayers) playerBadges[p.id] = new Set(computeBadgesFor(p.id));

  const totalUnlocked = allPlayers.reduce((acc, p) =>
    acc + LOGROS_DEF.filter(l => playerBadges[p.id].has(l.key)).length, 0);
  const totalPossible = allPlayers.length * LOGROS_DEF.length;

  root.innerHTML = `
    <div class="logros-header">
      <span class="logros-count">${totalUnlocked} / ${totalPossible} cromos desbloqueados</span>
      <span class="logros-hint">Completá logros para llenar tu álbum</span>
    </div>
    <div class="logros-grid">
      ${LOGROS_DEF.map(logro => {
        const stickers = allPlayers.map((p, i) => {
          const on = playerBadges[p.id].has(logro.key);
          const rot = LOGRO_ROTS[i] || 0;
          return on ? `
            <div class="logro-sticker logro-st-on" style="--c:${p.color};--rot:${rot}deg">
              <div class="logro-st-photo">
                <img src="${p.img}" alt="${p.name}" loading="lazy">
                <div class="logro-st-band" style="background:${p.color}"></div>
                <div class="logro-st-ico">${logro.ico}</div>
              </div>
              <div class="logro-st-name">${p.name.toUpperCase()}</div>
              <div class="logro-st-status">✓ LOGRADO</div>
            </div>` : `
            <div class="logro-sticker logro-st-off" style="--c:${p.color};--rot:${rot}deg">
              <div class="logro-st-photo">
                <img src="${p.img}" alt="${p.name}" loading="lazy">
                <div class="logro-st-mask"></div>
                <div class="logro-st-lock">?</div>
              </div>
              <div class="logro-st-name">${p.name.toUpperCase()}</div>
              <div class="logro-st-status logro-st-locked">pendiente</div>
            </div>`;
        }).join('');
        const anyOn = allPlayers.some(p => playerBadges[p.id].has(logro.key));
        return `
          <div class="logro-card${anyOn ? ' logro-card-active' : ''}">
            <div class="logro-card-hdr">
              <span class="logro-ico">${logro.ico}</span>
              <div>
                <div class="logro-title">${logro.title}</div>
                <div class="logro-desc">${logro.desc}</div>
              </div>
            </div>
            <div class="logro-stickers">${stickers}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderMisiones() {
  const root = document.getElementById('misiones');
  if (!root) return;
  const { players } = getState();
  const allPlayers = PLAYERS
    .map(name => ({ pl: players.find(p => p.name === name), meta: PLANTEL.find(p => p.name === name) }))
    .filter(x => x.pl && x.meta)
    .map(({ pl, meta }) => ({ id: pl.id, name: pl.name, color: meta.color }));
  if (!allPlayers.length) { root.innerHTML = ''; return; }

  const playerXP = allPlayers.map(p => ({ ...p, ...computeXPFor(p.id) }));

  const xpCards = playerXP.map(p => {
    const pct = Math.round(p.progress * 100);
    const nextLabel = p.next ? `→ ${p.next.name} (${p.next.min} XP)` : '¡Nivel máximo!';
    return `<div class="xp-card" style="--c:${p.color}">
      <div class="xp-card-hd">
        <span class="xp-lvl-ico">${p.level.ico}</span>
        <div>
          <div class="xp-name" style="color:${p.color}">${p.name}</div>
          <div class="xp-lvl-name">${p.level.name}</div>
        </div>
        <div class="xp-pts">${p.xp}<small>XP</small></div>
      </div>
      <div class="xp-bar-wrap" title="${nextLabel}">
        <div class="xp-bar-fill" style="width:${pct}%;background:${p.color}"></div>
      </div>
      <div class="xp-next">${nextLabel}</div>
    </div>`;
  }).join('');

  const missionsByPlayer = allPlayers.map(p => ({
    ...p,
    missions: computeMissionsFor(p.id),
  }));

  const missionRows = missionsByPlayer[0]?.missions.map((_, mIdx) => {
    const def = missionsByPlayer[0].missions[mIdx];
    const cells = missionsByPlayer.map(({ name, color, missions }) => {
      const m = missions[mIdx];
      const pct = Math.round((m.progress / def.total) * 100);
      return `<div class="mis-cell${m.done ? ' mis-done' : ''}">
        <div class="mis-cell-pbar" style="width:${pct}%;background:${color}"></div>
        <span class="mis-cell-label" style="color:${m.done ? color : 'inherit'}">${m.done ? '✓' : `${m.progress}/${def.total}`}</span>
      </div>`;
    }).join('');
    return `<div class="mis-row">
      <div class="mis-row-hd">
        <span class="mis-ico">${def.ico}</span>
        <div>
          <div class="mis-title">${def.title}</div>
          <div class="mis-desc">${def.desc}</div>
        </div>
      </div>
      <div class="mis-cells">${cells}</div>
    </div>`;
  }).join('') || '';

  const playerHeaders = allPlayers.map(p =>
    `<div class="mis-phd" style="color:${p.color}">${p.name}</div>`
  ).join('');

  root.innerHTML = `
    <div class="mis-xp-row">${xpCards}</div>
    <div class="mis-table">
      <div class="mis-table-hdr">
        <div class="mis-row-hd-spacer"></div>
        <div class="mis-cells">${playerHeaders}</div>
      </div>
      ${missionRows}
    </div>`;

  // Animate XP bars on first paint
  root.querySelectorAll('.xp-bar-fill').forEach(el => {
    const w = el.style.width;
    el.style.width = '0';
    setTimeout(() => { el.style.width = w; }, 80);
  });
}

function renderPendingPicks() {
  const root = document.getElementById('pending-picks');
  if (!root) return;
  const { matches, picks, players } = getState();

  const upcoming = matches
    .filter(m => !hasRes(m) && isFut(m))
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date))
    .slice(0, 8);

  if (!upcoming.length) {
    root.innerHTML = '<div class="pp-empty">Sin partidos próximos cargados.</div>';
    return;
  }

  const allPlayers = PLAYERS.map(name => players.find(p => p.name === name)).filter(Boolean);

  // Resumen por jugador: cuántos picks pendientes tiene
  const summary = allPlayers.map(pl => ({
    pl,
    missing: upcoming.filter(m => !hasPick(m, pl.id)).length,
    urgent:  upcoming.filter(m => !hasPick(m, pl.id) && (hoursUntil(m) ?? 999) < 24).length,
  }));

  // Chips de resumen — clicables para ir directo a los picks del jugador
  const chipsHtml = summary.map(({ pl, missing, urgent }) => {
    const cls = urgent > 0 ? 'pp-chip pp-chip-urgent' : missing > 0 ? 'pp-chip pp-chip-warn' : 'pp-chip pp-chip-ok';
    const icon = urgent > 0 ? '🔴' : missing > 0 ? '🟡' : '✅';
    const label = missing === 0 ? 'Al día' : `${missing} pendiente${missing > 1 ? 's' : ''}`;
    return `<div class="${cls} pp-nav" style="border-color:${pl.color};cursor:pointer" data-nav-player="${pl.name}" title="Ver picks de ${pl.name}">
      <span class="pp-chip-ini" style="color:${pl.color}">${pl.name}</span>
      <span>${icon} ${label}</span>
    </div>`;
  }).join('');

  // Cabecera de columnas — clicables
  const headCols = allPlayers.map(pl =>
    `<div class="pp-col-head pp-nav" style="color:${pl.color};cursor:pointer" data-nav-player="${pl.name}" title="Ver picks de ${pl.name}">${pl.name}</div>`
  ).join('');

  // Filas por partido
  const rowsHtml = upcoming.map(m => {
    const hrs = hoursUntil(m) ?? 999;
    const urgCls = hrs < 6 ? 'pp-row-urgent' : hrs < 24 ? 'pp-row-soon' : hrs < 72 ? 'pp-row-near' : '';
    const badge = hrs < 6   ? `<span class="pp-badge pp-badge-red">⚡ ${Math.round(hrs)}h</span>`
                : hrs < 24  ? `<span class="pp-badge pp-badge-orange">⏰ ${Math.round(hrs)}h</span>`
                : hrs < 72  ? `<span class="pp-badge pp-badge-yellow">${Math.ceil(hrs/24)}d</span>`
                : '';
    const dateStr = new Date(m.match_date + 'T12:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    const sheet = m.competition_id || 'liga';
    // El primer jugador con pick pendiente es el destino del click en el nombre del partido
    const firstMissing = allPlayers.find(pl => !hasPick(m, pl.id));
    const rowNav = firstMissing ? `data-nav-player="${firstMissing.name}" data-nav-sheet="${sheet}"` : '';
    const cells = allPlayers.map(pl => {
      const has = hasPick(m, pl.id);
      return `<div class="pp-cell ${has ? 'pp-cell-ok' : 'pp-cell-miss'} pp-nav"
                   style="${has ? `color:${pl.color}` : ''}"
                   data-nav-player="${pl.name}" data-nav-sheet="${sheet}"
                   title="${has ? `${pl.name} ya marcó` : `Marcar pick de ${pl.name}`}">
        ${has ? '✓' : '✗'}
      </div>`;
    }).join('');
    return `<div class="pp-row ${urgCls}">
      <div class="pp-match pp-nav" style="cursor:pointer" ${rowNav}>
        ${badge}
        <span class="pp-teams">${esc(m.home_team)} vs ${esc(m.away_team)}</span>
        <span class="pp-date">${dateStr}</span>
      </div>
      <div class="pp-cells">${cells}</div>
    </div>`;
  }).join('');

  root.innerHTML = `
    <div class="pp-summary">${chipsHtml}</div>
    <div class="pp-table">
      <div class="pp-table-head">
        <div class="pp-match-lbl">Partido</div>
        <div class="pp-cols-head">${headCols}</div>
      </div>
      ${rowsHtml}
    </div>`;

  // Event delegation — un solo listener reemplaza al anterior
  root.onclick = e => {
    const el = e.target.closest('[data-nav-player]');
    if (!el) return;
    const playerName = el.dataset.navPlayer;
    const sheet = el.dataset.navSheet;
    if (sheet) setState({ currentPickSheet: sheet });
    setState({ picker: playerName });
    try { localStorage.setItem('bb_picker', playerName); } catch {}
    window.bbGoTo('picks', null);
  };
}

export function renderHome() {
  const root = document.getElementById('s-home');
  if (!root) return;
  const { matches } = getState();
  // Hero / KPIs: SIEMPRE de temporada completa (vista global).
  const allPlayers = computeStandings(matches);

  const played = matches.filter(hasRes).length;
  const pct = matches.length ? Math.round(played / matches.length * 100) : 0;
  const upcoming = matches.filter(m => !hasRes(m) && isFut(m)).length;

  const subEl = document.getElementById('banner-sub');
  if (subEl && allPlayers[0]) {
    subEl.textContent = `${allPlayers[0].name} manda con ${fmtPts(allPlayers[0].total)} pts · ${allPlayers[1]?.name || ''} a ${fmtPts((allPlayers[0].total - (allPlayers[1]?.total||0)))} pts`;
  }
  const kpis = document.getElementById('banner-kpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="kpi"><div class="kpi-n">${played}</div><div class="kpi-l">Jugados</div></div>
      <div class="kpi"><div class="kpi-n" style="color:#E8B33D">${upcoming}</div><div class="kpi-l">Próximos</div></div>
      <div class="kpi"><div class="kpi-n" style="color:#E8B33D">${pct}%</div><div class="kpi-l">Avance</div></div>`;
  }
  const pp = document.getElementById('prog-pct');
  if (pp) pp.textContent = `${pct}% de la temporada`;
  const pf = document.getElementById('prog-fill');
  if (pf) setTimeout(() => pf.style.width = pct + '%', 100);

  // ── Clasificación con scope por competencia (qa32) ───────────────
  renderScopeChips();
  renderStandings();

  // ── Picks pendientes ─────────────────────────────────────────────
  renderPendingPicks();

  // ── Crónica auto de la última fecha ─────────────────────────────
  renderCronicaAuto();

}

// ── Chips de scope (qa32): General · Liga · <torneos de Experto> ──────
export function renderScopeChips() {
  const box = document.getElementById('home-scope-chips');
  if (!box) return;
  const scope = getState().homeScope || 'general';
  const main = [
    { scope: 'general', label: 'General' },
    { scope: 'liga',    label: 'Liga' },
  ];
  const exp = expertoTorneos().map(t => ({ scope: 'exp:' + t, label: t }));
  const btn = c =>
    `<button class="ft${c.scope === scope ? ' on' : ''}" data-scope="${c.scope}">${c.label}</button>`;
  // Jerarquía: General y Liga son los scopes principales; el resto son torneos
  // de Experto, agrupados tras un separador para no leerse como 15 chips iguales.
  box.innerHTML =
    `<span class="flt-lbl">Competencia:</span>` +
    main.map(btn).join('') +
    (exp.length
      ? `<span class="ft-sep" aria-hidden="true"></span>` +
        `<span class="flt-lbl flt-lbl-sub">Experto</span>` +
        exp.map(btn).join('')
      : '');
}

// ── Cuerpo de la tabla de clasificación, recalculado según el scope ──
export function renderStandings() {
  const std = document.getElementById('standings');
  if (!std) return;
  const { players, homeScope } = getState();
  const scope = homeScope || 'general';
  const list = scopeMatches(scope);
  const allPlayers = computeStandings(list);

  // Caption del scope activo (reusa std-head-r).
  const capEl = std.querySelector('.std-head-r');
  if (capEl) {
    capEl.textContent = scope === 'general'
      ? 'Barra = puntos relativos al líder'
      : `Solo ${scopeLabel(scope)}`;
  }

  std.querySelectorAll('.std-row').forEach(r => r.remove());
  const maxTotal = allPlayers[0]?.total || 1;
  allPlayers.forEach((s, i) => {
    const player = players.find(p => p.name === s.name);
    const c = player?.color || '#1F1A2E';
    const gap = i > 0 ? (allPlayers[0].total - s.total).toFixed(2) : null;
    const hitPct = s.pj ? Math.round((s.plenos + s.aciertos) / s.pj * 100) : 0;
    const plenoPct = s.pj ? Math.round(s.plenos / s.pj * 100) : 0;
    const barW = maxTotal ? Math.round(s.total / maxTotal * 100) : 0;
    const row = document.createElement('div');
    row.className = 'std-row fu';
    row.style.borderLeftColor = c;
    if (i === 0) row.style.background = `rgba(${h2r(c)},.04)`;
    row.innerHTML = `
      <div class="std-pos ${['p1','p2','p3','p4'][i] || ''}">${i === 0 ? '★' : i + 1}</div>
      ${player?.avatar_url ? `<img class="std-ava" src="${player.avatar_url}" style="border-color:${c}" onerror="this.style.display='none'">` : `<div class="std-ava" style="border-color:${c};display:flex;align-items:center;justify-content:center;font-family:var(--bb-display);font-style:italic;color:${c}">${s.name[0]}</div>`}
      <div class="std-info">
        <div class="std-top">
          <div class="std-name" style="color:${i === 0 ? c : 'var(--bb-ink)'}">${s.name}</div>
          <div class="std-pts" style="color:${c}">${s.total.toFixed(0)}<small>PTS</small></div>
        </div>
        <div class="std-bar-wrap">
          <div class="std-bar-fill" style="width:${barW}%;background:${c}"></div>
          <div class="std-bar-pleno" style="width:${plenoPct}%;background:${c};opacity:.65"></div>
        </div>
        <div class="std-meta">
          <span class="std-meta-stat">${s.plenos}P · ${s.aciertos}Ac${s.wo ? ` · <span style="color:var(--bb-tomate)">${s.wo}WO</span>` : ''}</span>
          <span class="std-meta-pct">${hitPct}% efectividad</span>
          ${gap ? `<span class="std-meta-gap">−${gap}</span>` : `<span class="std-meta-lead">★ Puntero</span>`}
        </div>
      </div>`;
    std.appendChild(row);
  });
  // Animate bars from 0
  std.querySelectorAll('.std-bar-fill, .std-bar-pleno').forEach(el => {
    const w = el.style.width;
    el.style.width = '0';
    setTimeout(() => { el.style.width = w; }, 60);
  });
}

function addNarrative(feed, ico, html, cls) {
  const d = document.createElement('div');
  d.className = 'ni' + (cls ? ' ' + cls : '');
  d.innerHTML = `<span class="ni-ico">${ico}</span><div>${html}</div>`;
  feed.appendChild(d);
}
