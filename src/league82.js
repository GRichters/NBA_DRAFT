// Modo 82-0 como uma liga de verdade: 30 times (os do leilão + times de lendas nas franquias livres),
// Leste e Oeste, 82 jogos, play-in (7º a 10º) e playoffs em séries melhor de 7, como na NBA.
// Jogos com técnicos humanos nos playoffs/play-in são ao vivo; o resto é simulado na hora.
const D = require('../public/data.js');
const { PLAYERS, POOLS, TEAMS } = D;

const SERIES_WINS = 4;
const HOME_PATTERN = [0, 0, 1, 1, 0, 1, 0]; // 2-2-1-1-1: 0 = mando do time de melhor campanha
const POST_PAUSE_MS = 1800;                  // dia só com jogos simulados
const ROUND_NAMES = ['Primeira rodada', 'Semifinais de conferência', 'Finais de conferência', 'Finais da NBA'];

const rnd = Math.random;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

const methods = {
  // ---------- times de lendas ----------
  teamStrength(m) {
    const lu = m.lineup || {};
    return mean(D.POS_ORDER.map((k) => { const p = this.player(lu[k]); return p ? p.ovr - D.posPenalty(p, k) : 70; }));
  },

  buildLeague() {
    const s = this.season;
    const taken = new Set(this.managers.map((m) => m.team));
    const base = mean(this.managers.map((m) => this.teamStrength(m)));
    // franquias com mais lendas ganham alvo maior; o leque vai de base+4 a base-6, então os times
    // do leilão ficam no meio da tabela e brigam por vaga nos playoffs
    const free = TEAMS.filter((t) => !taken.has(t.id))
      .map((t) => ({ id: t.id, pw: this.franchisePower(t.id) + rnd() * 2.5 }))
      .sort((a, b) => b.pw - a.pw);
    const n = free.length;
    s.cpu = {};
    this.cpuExtra = {};
    free.forEach((t, i) => {
      const target = base + 4 - (10 * i) / Math.max(1, n - 1) + (rnd() * 2 - 1);
      const team = this.buildCpuTeam(t.id, target);
      s.cpu[team.id] = team;
    });
    this.extraAll = Object.assign({}, this.extra, this.cpuExtra);
    s.leagueBase = Math.round(base * 10) / 10;
  },

  buildCpuTeam(franchise, target) {
    const size = this.settings.rosterSize;
    const own = POOLS.lendas.filter((id) => D.franchiseOf(PLAYERS[id].team) === franchise);
    const used = new Set();
    const choose = (ids, pos, tgt) => {
      let best = null, bv = 1e9;
      for (const id of ids) {
        const p = PLAYERS[id];
        if (used.has(D.identity(p))) continue;
        if (pos && !D.positionsOf(p).includes(pos)) continue;
        const pen = pos ? D.posPenalty(p, pos) : 0;
        const v = Math.abs(p.ovr - pen - tgt) + (pen ? 3 : 0) + rnd() * 3;
        if (v < bv) { bv = v; best = id; }
      }
      return best;
    };
    const pick = (pos, tgt) => choose(own, pos, tgt) || choose(POOLS.lendas, pos, tgt); // faltou lenda da franquia? pega de outra
    const clone = (id) => {
      used.add(D.identity(PLAYERS[id]));
      const cid = `c:${franchise}:${id}`;
      this.cpuExtra[cid] = { ...PLAYERS[id], id: cid };
      return cid;
    };
    const lineup = {};
    for (const pos of shuffle(D.POS_ORDER)) lineup[pos] = clone(pick(pos, target));
    const bench = [];
    for (let i = 0; i < size - 5; i++) bench.push(clone(pick(null, target - 3)));
    lineup.bench = bench;
    const t = TEAMS.find((x) => x.id === franchise);
    const team = {
      id: 'cpu:' + franchise, name: `Lendas do ${t.name}`, team: franchise, isBot: true, cpu: true, connected: true,
      roster: [...D.POS_ORDER.map((k) => lineup[k]), ...bench], lineup, prices: {},
      tactics: { ritmo: 'normal', esquema: 'equilibrado', defesa: 'individual' }, arena: null, card: null,
    };
    this.botPlan(team);
    return team;
  },

  isHumanMid(mid) { const m = this.managers.find((x) => x.id === mid); return !!(m && !m.isBot); },
  confOfMid(mid) { const m = this.mgr(mid); return D.confOf(m ? m.team : ''); },

  // ---------- pós-temporada ----------
  startPost(now) {
    const s = this.season;
    const table = this.sortedStandings().map((r) => r.mid);
    const seeds = { E: table.filter((mid) => this.confOfMid(mid) === 'E'), W: table.filter((mid) => this.confOfMid(mid) === 'W') };
    const playin = {};
    for (const c of ['E', 'W']) {
      const sd = seeds[c];
      playin[c] = {
        g1: { key: `${c}-pi1`, teams: [sd[6], sd[7]], winner: null, score: null, label: '7º x 8º' },
        g2: { key: `${c}-pi2`, teams: [sd[8], sd[9]], winner: null, score: null, label: '9º x 10º' },
        g3: null, seed7: null, seed8: null,
      };
    }
    s.post = { phase: 'playin', round: -1, seeds, playin, series: [], day: 0, today: [] };
    s.stage = 'post';
    s.matches = [];
    s.results = [];
    s.status = 'interval';
    s.intervalUntil = now + 8000;
    s.label = 'Fim da temporada regular! Agora é o play-in (7º ao 10º de cada conferência)';
    this.sys('🏁 Fim das 82 rodadas! Os 6 primeiros de cada conferência estão nos playoffs; do 7º ao 10º vão para o play-in.');
    this.touch();
  },

  rankOf(mid) { return this.sortedStandings().findIndex((r) => r.mid === mid); },

  newSeries(round, conf, a, b) {
    const [hi, lo] = this.rankOf(a) <= this.rankOf(b) ? [a, b] : [b, a];
    return { id: `s${round}-${conf}-${hi}-${lo}`, round, conf, hi, lo, w: [0, 0], games: [], winner: null };
  },

  // avança play-in → rodadas → fim, quando a fase atual termina
  progressPost() {
    const P = this.season.post;
    if (P.phase === 'playin') {
      for (const c of ['E', 'W']) {
        const pi = P.playin[c];
        if (pi.g1.winner && pi.g2.winner && !pi.g3) {
          const loser1 = pi.g1.teams.find((t) => t !== pi.g1.winner);
          pi.seed7 = pi.g1.winner;
          pi.g3 = { key: `${c}-pi3`, teams: [loser1, pi.g2.winner], winner: null, score: null, label: 'Vaga do 8º' };
        }
        if (pi.g3 && pi.g3.winner) pi.seed8 = pi.g3.winner;
      }
      if (['E', 'W'].every((c) => P.playin[c].seed8)) {
        P.phase = 'playoffs';
        P.round = 0;
        for (const c of ['E', 'W']) {
          const sd = P.seeds[c].slice(0, 6).concat([P.playin[c].seed7, P.playin[c].seed8]);
          // chaveamento da NBA: 1x8 e 4x5 de um lado, 3x6 e 2x7 do outro
          [[0, 7], [3, 4], [2, 5], [1, 6]].forEach(([a, b]) => P.series.push(this.newSeries(0, c, sd[a], sd[b])));
          P.finalSeeds = P.finalSeeds || {};
          P.finalSeeds[c] = sd;
        }
      }
      return;
    }
    if (P.phase !== 'playoffs') return;
    const cur = P.series.filter((x) => x.round === P.round);
    if (!cur.every((x) => x.winner)) return;
    if (P.round === 3) { P.phase = 'done'; P.champion = cur[0].winner; return; }
    P.round++;
    if (P.round === 3) {
      const e = cur.find((x) => x.conf === 'E').winner, w = cur.find((x) => x.conf === 'W').winner;
      P.series.push(this.newSeries(3, 'F', e, w));
      return;
    }
    for (const c of ['E', 'W']) {
      const prev = cur.filter((x) => x.conf === c);
      for (let i = 0; i < prev.length; i += 2) P.series.push(this.newSeries(P.round, c, prev[i].winner, prev[i + 1].winner));
    }
  },

  // jogos do dia
  postGames() {
    const P = this.season.post;
    const out = [];
    if (P.phase === 'playin') {
      for (const c of ['E', 'W']) {
        const pi = P.playin[c];
        for (const g of [pi.g1, pi.g2, pi.g3]) {
          if (g && !g.winner) out.push({ key: g.key, teams: g.teams.slice(), label: `Play-in ${D.CONF_LABEL[c]} · ${g.label}`, ref: g });
        }
      }
    } else if (P.phase === 'playoffs') {
      for (const x of P.series.filter((y) => y.round === P.round && !y.winner)) {
        const n = x.w[0] + x.w[1];
        const home = HOME_PATTERN[n] === 0 ? x.hi : x.lo;
        const away = home === x.hi ? x.lo : x.hi;
        out.push({ key: `${x.id}-g${n + 1}`, teams: [home, away], label: `${ROUND_NAMES[x.round]}${x.conf !== 'F' ? ' · ' + D.CONF_LABEL[x.conf] : ''} · Jogo ${n + 1}`, ref: x, series: true });
      }
    }
    return out;
  },

  applyPostResult(g, score) {
    const [h, a] = g.teams;
    const winner = score[0] > score[1] ? h : a;
    if (g.series) {
      const x = g.ref;
      x.games.push({ teams: [h, a], score });
      x.w[winner === x.hi ? 0 : 1]++;
      if (x.w[0] >= SERIES_WINS) x.winner = x.hi;
      else if (x.w[1] >= SERIES_WINS) x.winner = x.lo;
    } else {
      g.ref.winner = winner;
      g.ref.score = score;
    }
  },

  postDay(now) {
    const s = this.season;
    const P = s.post;
    this.progressPost();
    if (P.phase === 'done') return this.finishGame(now);
    const games = this.postGames();
    if (!games.length) { this.progressPost(); return this.finishGame(now); }
    P.day++;
    s.label = P.phase === 'playin' ? 'Play-in' : ROUND_NAMES[P.round];
    const live = [], done = [];
    games.forEach((g, i) => {
      const id = `post-${P.day}-${i}`;
      const match = this.makeMatch(id, g.teams[0], g.teams[1], !g.teams.some((mid) => this.isHumanMid(mid)));
      match.postRef = g;
      if (match.auto) {
        match.finish();
        done.push(match);
      } else live.push(match);
    });
    // jogos sem humanos: resultado na hora
    P.today = [];
    for (const m of done) this.closePostMatch(m);
    if (live.length) {
      s.matches = live;
      s.status = 'playing';
      s.lastStep = now;
    } else {
      s.matches = [];
      s.status = 'interval';
      s.intervalUntil = now + POST_PAUSE_MS;
    }
    this.touch();
  },

  closePostMatch(m) {
    const s = this.season;
    const r = this.tallyMatch(m);
    this.applyPostResult(m.postRef, m.score.slice());
    s.post.today.push({ ...r, label: m.postRef.label, key: m.postRef.key });
  },

  endPostDay(now) {
    const s = this.season;
    for (const m of s.matches) this.closePostMatch(m);
    s.results = s.post.today.slice();
    s.lastBoxes = s.matches.map((m) => ({ id: m.id, box: m.box, q: m.qScores }));
    s.status = 'interval';
    s.intervalUntil = now + 12000;
    this.touch();
  },

  postSerialize() {
    const P = this.season.post;
    if (!P) return null;
    return {
      phase: P.phase, round: P.round, day: P.day, seeds: P.seeds, finalSeeds: P.finalSeeds || null,
      playin: P.playin, series: P.series.map((x) => ({ id: x.id, round: x.round, conf: x.conf, hi: x.hi, lo: x.lo, w: x.w, winner: x.winner, games: x.games.length })),
      today: P.today, roundNames: ROUND_NAMES,
    };
  },

  // até onde cada time chegou (para o histórico)
  postReach() {
    const P = this.season.post;
    const reach = {};
    if (!P) return reach;
    for (const c of ['E', 'W']) for (const mid of [P.playin[c].g1.teams, P.playin[c].g2.teams].flat()) reach[mid] = 0;
    for (const x of P.series) { reach[x.hi] = Math.max(reach[x.hi] || 0, x.round + 1); reach[x.lo] = Math.max(reach[x.lo] || 0, x.round + 1); }
    return reach;
  },
};

module.exports = { install: (Room) => Object.assign(Room.prototype, methods), ROUND_NAMES };
