// Histórico de partidas e ranking dos jogadores, salvo num arquivo no computador que roda o servidor.
// Arquivo: Documentos\Draft100\historico.json no Windows (fora da pasta do jogo). Os bots não entram no ranking.
const fs = require('fs');
const path = require('path');

const DIR = require('./paths').DATA_DIR;
const FILE = path.join(DIR, 'historico.json');
const MAX_GAMES = 200;

const keyOf = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

let db = null;
function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!db.players || !db.games) throw new Error('formato');
    db.atletas = db.atletas || {};
  } catch (e) {
    db = { players: {}, games: [], atletas: {} };
  }
  return db;
}

function save() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE); // grava inteiro ou nada: não corrompe se o PC desligar no meio
  } catch (e) {
    console.error('Não consegui salvar o histórico:', e.message);
  }
}

/**
 * game: { date, mode, format, champion:{name, team}, mvp:{name, player}, managers:[{ name, team, isBot, place, w, l, pf, pa, champion, finalist, mvp }] }
 */
function recordGame(game) {
  load();
  const atletas = game.atletas || [];
  delete game.atletas; // a lista completa fica só no acumulado por jogador
  db.games.unshift(game);
  if (db.games.length > MAX_GAMES) db.games.length = MAX_GAMES;
  // ranking dos jogadores da NBA: cada versão (ex.: Kobe Bryant '08) acumula escolhas e números
  for (const a of atletas) {
    const r = db.atletas[a.id] || (db.atletas[a.id] = {
      id: a.id, name: a.name, ident: a.ident, year: a.year, team: a.team,
      picks: 0, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, spent: 0, titles: 0, mvps: 0, bestPpg: 0, by: {},
    });
    r.name = a.name;
    r.picks++;
    r.gp += a.gp; r.pts += a.pts; r.reb += a.reb; r.ast += a.ast; r.stl += a.stl; r.blk += a.blk;
    r.spent += a.price;
    if (a.champion) r.titles++;
    if (a.mvp) r.mvps++;
    if (a.gp) r.bestPpg = Math.max(r.bestPpg, Math.round((a.pts / a.gp) * 10) / 10);
    if (!a.byBot) r.by[a.by] = (r.by[a.by] || 0) + 1;
    r.last = game.date;
  }
  for (const m of game.managers) {
    if (m.isBot) continue;
    const k = keyOf(m.name);
    if (!k) continue;
    const p = db.players[k] || (db.players[k] = {
      name: m.name, seasons: 0, titles: 0, finals: 0, wins: 0, losses: 0, pf: 0, pa: 0, mvps: 0, best: null, teams: {}, last: null,
    });
    p.name = m.name; // mantém a grafia mais recente
    p.seasons++;
    p.wins += m.w; p.losses += m.l; p.pf += m.pf; p.pa += m.pa;
    if (m.champion) p.titles++;
    if (m.champion || m.finalist) p.finals++;
    if (m.mvp) p.mvps++;
    if (p.best == null || m.place < p.best) p.best = m.place;
    p.teams[m.team] = (p.teams[m.team] || 0) + 1;
    p.last = game.date;
  }
  save();
}

// jogadores ofertados nos últimos leilões (para o sorteio variar de uma partida para outra)
const RECENT_KEEP = 4;
function recentOffers() {
  load();
  return Array.isArray(db.recentOffers) ? db.recentOffers : [];
}
function noteOffers(ids) {
  load();
  db.recentOffers = [ids.slice(), ...recentOffers()].slice(0, RECENT_KEEP);
  save();
}

function ranking() {
  load();
  const list = Object.values(db.players).map((p) => ({
    name: p.name, seasons: p.seasons, titles: p.titles, finals: p.finals, wins: p.wins, losses: p.losses,
    pct: p.wins + p.losses ? p.wins / (p.wins + p.losses) : 0, diff: p.pf - p.pa, mvps: p.mvps, best: p.best,
    fav: Object.entries(p.teams || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null, last: p.last,
  }));
  list.sort((a, b) => (b.titles - a.titles) || (b.finals - a.finals) || (b.pct - a.pct) || (b.wins - a.wins));
  const atletas = Object.values(db.atletas || {}).map((r) => ({
    id: r.id, name: r.name, ident: r.ident, year: r.year, team: r.team, picks: r.picks, gp: r.gp,
    pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, titles: r.titles, mvps: r.mvps, bestPpg: r.bestPpg,
    avgPrice: r.picks ? Math.round((r.spent / r.picks) * 10) / 10 : 0,
    fan: Object.entries(r.by || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  }));
  atletas.sort((a, b) => (b.titles - a.titles) || (b.mvps - a.mvps) || ((b.gp ? b.pts / b.gp : 0) - (a.gp ? a.pts / a.gp : 0)));
  return { players: list, games: db.games.slice(0, 20), atletas, file: FILE };
}

module.exports = { recordGame, ranking, keyOf, recentOffers, noteOffers };
