#!/usr/bin/env node
/**
 * Import desde el HTML v1 → web/data/seed.json
 *
 * Útil para tener los 256 fixtures cargados en local SIN tener que conectar
 * con el Apps Script. Sirve como fallback offline y para probar el frontend.
 *
 * Uso:
 *   1. Guardar el HTML v1 completo como `web/v1-source.html`.
 *      (Drag & drop el archivo o copia/pega el contenido en un editor.)
 *   2. Desde la raíz del repo:
 *        node scripts/import-v1.js
 *   3. Output:
 *        web/data/seed.json    ← snapshot para el frontend (256 fixtures)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../');

const SRC_HTML  = path.join(ROOT, 'web/v1-source.html');
const OUT_JSON  = path.join(ROOT, 'web/data/seed.json');

if (!fs.existsSync(SRC_HTML)) {
  console.error('✗ No encuentro', SRC_HTML);
  console.error('  Guardá el HTML v1 como web/v1-source.html y volvé a correr.');
  process.exit(1);
}

const html = fs.readFileSync(SRC_HTML, 'utf8');

function extractArray(name) {
  const re = new RegExp(`let\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`, 'm');
  const m = html.match(re);
  if (!m) throw new Error('No encontré ' + name + ' en el HTML');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

const LIGA    = extractArray('LIGA');
const EXPERTO = extractArray('EXPERTO');
console.log(`✓ Parsed: LIGA=${LIGA.length} fixtures · EXPERTO=${EXPERTO.length} fixtures`);

function detId(...parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex');
  return [
    h.slice(0,8), h.slice(8,12), '5' + h.slice(13,16),
    '8' + h.slice(17,20), h.slice(20,32),
  ].join('-');
}

const PLAYERS = [
  { name: 'Dari',  color: '#1E4FB8' },
  { name: 'Kmi',   color: '#E8442C' },
  { name: 'Blopa', color: '#E8B33D' },
  { name: 'Pela',  color: '#2E6B3A' },
].map(p => ({ ...p, id: detId('player', p.name) }));

const playerByName = Object.fromEntries(PLAYERS.map(p => [p.name, p]));

const COMPS = [
  { id: 'liga',    name: 'Liga de Primera',  display_order: 1 },
  { id: 'experto', name: 'Partidos Experto', display_order: 2 },
];

function normalize(fixtures, compId) {
  const rounds = new Map();
  const matches = [];
  const picks = [];
  const seenMatch = new Set();

  for (const m of fixtures) {
    const roundName = (m.fecha || m.torneo || '').trim() || 'Sin asignar';
    if (!rounds.has(roundName)) {
      rounds.set(roundName, {
        id: detId('round', compId, roundName),
        competition_id: compId,
        name: roundName,
        display_order: rounds.size + 1,
      });
    }
    const matchId = detId('match', compId, m.home, m.away, m.date);
    if (seenMatch.has(matchId)) continue;
    seenMatch.add(matchId);

    let result = null, result_factor = null;
    if (m.hScore != null && m.aScore != null) {
      result = m.hScore > m.aScore ? 'L' : m.hScore < m.aScore ? 'V' : 'E';
      result_factor = typeof m.factor === 'number' ? m.factor
        : (result === 'L' ? m.fl : result === 'V' ? m.fv : m.fe);
    }

    matches.push({
      id:             matchId,
      round_id:       rounds.get(roundName).id,
      competition_id: compId,
      match_date:     m.date,
      home_team:      m.home,
      away_team:      m.away,
      venue:          m.estadio || null,
      home_score:     m.hScore ?? null,
      away_score:     m.aScore ?? null,
      factor_home:    typeof m.fl === 'number' ? m.fl : null,
      factor_draw:    typeof m.fe === 'number' ? m.fe : null,
      factor_away:    typeof m.fv === 'number' ? m.fv : null,
      result, result_factor,
      status: (m.hScore != null && m.aScore != null) ? 'finished' : 'scheduled',
    });

    for (const playerName of Object.keys(m.picks || {})) {
      const pk = m.picks[playerName];
      if (!playerByName[playerName]) continue;
      if (pk.l == null && pk.v == null) continue;
      const status = (m.status?.[playerName] || ' ').trim();
      picks.push({
        id:         detId('pick', matchId, playerName),
        match_id:   matchId,
        player_id:  playerByName[playerName].id,
        player_name: playerName,
        home_score: pk.l,
        away_score: pk.v,
        points:     m.pts?.[playerName] ?? 0,
        status:     status === 'P' ? 'P' : status === 'Ac' ? 'Ac' : ' ',
        source:     'seed',
      });
    }
  }
  return { rounds: [...rounds.values()], matches, picks };
}

const liga    = normalize(LIGA,    'liga');
const experto = normalize(EXPERTO, 'experto');

const allRounds  = [...liga.rounds,  ...experto.rounds];
const allMatches = [...liga.matches, ...experto.matches];
const allPicks   = [...liga.picks,   ...experto.picks];

// Leaderboard
const leaderboard = PLAYERS.map(p => {
  let total = 0, plenos = 0, aciertos = 0, wo = 0, pj = 0;
  for (const m of allMatches) {
    if (m.home_score == null || m.away_score == null) continue;
    const pk = allPicks.find(x => x.match_id === m.id && x.player_id === p.id);
    if (!pk || pk.home_score == null) { wo++; continue; }
    pj++;
    total += Number(pk.points || 0);
    if (pk.status === 'P') plenos++;
    else if (pk.status === 'Ac') aciertos++;
  }
  return { ...p, avatar_url: null, total_points: +total.toFixed(2), plenos, aciertos, wo, pj };
}).sort((a, b) => b.total_points - a.total_points);

console.log(`✓ Normalized: ${allRounds.length} rounds · ${allMatches.length} matches · ${allPicks.length} picks`);

const seed = {
  _note: 'Generado por scripts/import-v1.js desde el HTML v1. Regenerable.',
  now: new Date().toISOString(),
  last_synced_at: null,
  sync_sources:   'import-v1',
  me: null,
  players:      PLAYERS.map(p => ({ ...p, avatar_url: null, is_admin: p.name === 'Dari' })),
  competitions: COMPS,
  rounds:       allRounds,
  matches:      allMatches,
  picks:        allPicks,
  leaderboard,
  insights: [],
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(seed, null, 2));
console.log(`✓ Wrote ${OUT_JSON}  (${allMatches.length} matches, ${allPicks.length} picks)`);
console.log('');
console.log('★ Listo. Abrí web/index.html y vas a ver los 256 fixtures cargados.');
console.log('  Cuando configures el Apps Script Web App y pongas su URL en');
console.log('  web/js/config.js, el frontend prioriza la data en vivo del Sheet');
console.log('  y este seed queda como fallback offline.');
