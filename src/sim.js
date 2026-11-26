// Simulação de partida lance a lance
const D = require('../public/data.js');
const { PLAYERS, attrs, tw, posPenalty, isBig, POS_ORDER, SCHEMES, DEF_SCHEMES, schemeFit, CARDS, CARD_AUTO } = D;

const QUARTER = 720; // 12 min
const OT = 300;      // 5 min
// pegando fogo / congelado (dinâmica automática, ninguém escolhe)
const FIRE_STREAK = 4;   // cestas seguidas para pegar fogo
const ICE_STREAK = 5;    // erros seguidos para congelar
const FIRE_SECS = 210;   // o fogo dura até errar ou ~3,5 min de jogo
const FIRE_BUFF = 0.06, FIRE_DEF = 0.015, ICE_DEBUFF = 0.07;
// corrida de pontos e pedido de tempo
const RUN_HOT = 8;          // corrida a partir da qual o time fica embalado
const RUN_BUFF = 0.02;
const BROKEN_POSS = 6;      // posses do adversário com o ritmo quebrado depois do tempo
const BROKEN_MAKE = 0.035, BROKEN_TO = 0.02;
// bola decisiva
const CLUTCH_SECS = 36;

const rnd = Math.random;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
function weighted(items, wfn) {
  let total = 0;
  const ws = items.map((it) => { const w = Math.max(0.0001, wfn(it)); total += w; return w; });
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const avg = (arr, k) => arr.reduce((s, p) => s + p.a[k], 0) / arr.length;

// distribuição de arremessos pela posição de origem: [3, meia, bandeja, garrafão]
const SHOT_BASE = {
  PG: [0.40, 0.22, 0.30, 0.08], SG: [0.40, 0.24, 0.28, 0.08], SF: [0.33, 0.23, 0.30, 0.14],
  PF: [0.20, 0.18, 0.32, 0.30], C: [0.07, 0.12, 0.38, 0.43],
};

const TXT = {
  three: ['{p} acerta de três!', 'BANG! {p} de três pontos!', '{p} chuta do perímetro… CAIU!', 'Bola de três de {p}!'],
  threeLogo: ['{p} arrisca do logo… e CAI!', '{p} de muito longe… SPLASH!'],
  threeMiss: ['{p} erra a bola de três.', '{p} arrisca de longe e erra.', 'Tiro de três de {p} no aro.'],
  mid: ['{p} acerta o arremesso de média distância.', '{p} sobe no pull-up e converte.', 'Jumper de {p}, cesta!'],
  midFade: ['Fadeaway de {p}… cesta!', '{p} gira, se afasta e acerta o fadeaway!'],
  midMiss: ['{p} erra o arremesso de meia distância.', 'Pull-up de {p} não cai.'],
  rim: ['{p} infiltra e converte a bandeja.', '{p} passa pelo marcador e marca.', 'Bandeja de {p} com a mão trocada!'],
  dunk: ['ENTERRADA de {p}!', '{p} voa e ENTERRA!', 'Ponte aérea para {p}!'],
  rimMiss: ['{p} erra a bandeja.', 'Bandeja de {p} gira e sai.'],
  post: ['{p} joga de costas e converte.', 'Gancho de {p}, cesta!', '{p} gira no garrafão e marca.'],
  postBig: ['{p} se impõe no garrafão e ENTERRA!', 'Ninguém segura {p} de costas para a cesta!'],
  postMiss: ['{p} erra o gancho.', '{p} força de costas e erra.'],
  fast: ['Contra-ataque! {p} sai na frente e marca.', 'Transição rápida, {p} finaliza!'],
  block: ['TOCO de {d} em {p}!', '{d} manda a bola de {p} para a arquibancada!', '{d} fecha o aro! Toco em {p}.'],
  steal: ['{d} rouba a bola de {p}!', 'Roubo de {d}! Contra-ataque.', '{d} lê o passe e intercepta.'],
  tov: ['Erro de passe de {p}.', '{p} pisa fora da quadra.', 'Violação de 24 segundos.', 'Falta de ataque de {p}.'],
  oreb: ['Rebote ofensivo de {r}!', '{r} pega o rebote no ataque!', '{r} briga e fica com o rebote!'],
  clutch: [' Frieza total no fim do jogo!', ' Decisivo!', ' Gelo nas veias!'],
};
const fmt = (s, o) => s.replace(/\{(\w)\}/g, (_, k) => o[k] || '');
const short = (name) => {
  const parts = name.replace(/ '\d\d$/, '').split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
};

function getPlayer(id, extra) {
  return PLAYERS[id] || (extra && extra[id]);
}

class Match {
  /**
   * teams: [{ mid, roster:[ids], tactics:{ritmo,esquema,defesa}, lineup:{PG,SG,SF,PF,C,bench} }, ...]  (0 = mandante)
   * tactics e lineup são objetos vivos do técnico: mudanças valem na próxima posse.
   */
  constructor(id, teams, extra, meta = {}) {
    this.id = id;
    this.meta = meta;
    this.extra = extra;
    this.teams = teams.map((t) => ({ mid: t.mid, roster: t.roster, tactics: t.tactics, lineup: t.lineup, arena: t.arena || null, cacheKey: null, cache: null }));
    this.q = 1;
    this.clock = QUARTER;
    this.score = [0, 0];
    this.qScores = [[0], [0]];
    this.ball = rnd() < 0.5 ? 0 : 1;
    this.qStartBall = this.ball;
    this.done = false;
    this.started = false;
    this.box = {};
    for (let i = 0; i < 2; i++) {
      for (const id of this.teams[i].roster) this.box[id] = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tm: i };
    }
    this.plays = [];
    this.form = [(rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05]; // fase do dia: espaço para zebras
    this.cards = teams.map((t) => (t.card && CARDS[t.card] ? { type: t.card, state: 'ready', left: 0, auto: false } : null));
    this.pending = [];
    this.auto = !!meta.auto;      // 82-0 e "simular até o fim": tempo e bola decisiva no automático
    this.heat = {};                // pid → { mk, ms, st: 'fire'|'ice'|null, left, name }
    this.run = { team: -1, pts: 0, ann: 0 };
    this.timeouts = [1, 1];
    this.broken = [0, 0];          // posses restantes com o ritmo quebrado (efeito do tempo do adversário)
    this.challenge = null;         // bola decisiva em andamento
    this.lastChallenge = null;     // última bola decisiva resolvida (para a tela mostrar o resultado)
    this.clutchQ = 0;
  }

  // ---------- pegando fogo / congelado ----------
  heatOf(p) { return this.heat[p.id] || (this.heat[p.id] = { mk: 0, ms: 0, st: null, left: 0, name: short(p.name), tm: -1 }); }
  heatState() {
    const out = {};
    for (const [pid, h] of Object.entries(this.heat)) if (h.st) out[pid] = h.st;
    return out;
  }
  heatMod(p) {
    const h = this.heat[p.id];
    return !h || !h.st ? 0 : h.st === 'fire' ? FIRE_BUFF : -ICE_DEBUFF;
  }
  shotResult(p, made, ti) {
    const h = this.heatOf(p);
    h.tm = ti;
    if (made) {
      h.mk++; h.ms = 0;
      if (h.st === 'ice') { h.st = null; this.addPlay(`🌡️ ${h.name} finalmente acerta e sai do gelo.`, ti, 0, 'thaw'); }
      else if (!h.st && h.mk >= FIRE_STREAK && (this.box[p.id] || { pts: 0 }).pts >= 12) { h.st = 'fire'; h.left = FIRE_SECS; this.addPlay(`🔥 ${h.name} ESTÁ PEGANDO FOGO! ${h.mk} cestas seguidas.`, ti, 0, 'fire'); }
      else if (h.st === 'fire') h.left = Math.max(h.left, 90); // cada cesta mantém o fogo aceso
    } else {
      h.ms++; h.mk = 0;
      if (h.st === 'fire') { h.st = null; this.addPlay(`💨 ${h.name} erra e esfria.`, ti, 0, 'cool'); }
      else if (!h.st && h.ms >= ICE_STREAK) { h.st = 'ice'; this.addPlay(`🧊 ${h.name} congelou: ${h.ms} erros seguidos.`, ti, 0, 'ice'); }
    }
  }
  tickHeat(elapsed) {
    for (const h of Object.values(this.heat)) {
      if (h.st !== 'fire') continue;
      h.left -= elapsed;
      if (h.left <= 0) { h.st = null; h.mk = 0; this.addPlay(`${h.name} esfria depois de uma sequência incrível.`, h.tm, 0, 'cool'); }
    }
  }
  fireDefense(def) {
    return Math.min(0.03, FIRE_DEF * def.filter((p) => this.heat[p.id] && this.heat[p.id].st === 'fire').length);
  }

  // ---------- pedido de tempo ----------
  callTimeout(ti, who) {
    if (this.done || this.timeouts[ti] <= 0 || this.challenge) return false;
    this.timeouts[ti]--;
    const opp = 1 - ti;
    const run = this.run.team === opp ? this.run.pts : 0;
    this.run = { team: -1, pts: 0, ann: 0 };
    this.broken[opp] = BROKEN_POSS;
    const cooled = [];
    for (const h of Object.values(this.heat)) if (h.tm === opp && h.st === 'fire') { h.st = null; h.mk = 0; cooled.push(h.name); }
    let txt = `⏸️ TEMPO! ${who || 'O técnico'} para o jogo`;
    txt += run >= 4 ? ` e corta a corrida de ${run}-0.` : '.';
    if (cooled.length) txt += ` ${cooled.join(' e ')} esfria${cooled.length > 1 ? 'm' : ''}.`;
    txt += ' O adversário perde o ritmo.';
    this.addPlay(txt, ti, 0, 'timeout');
    return true;
  }
  // quando um técnico automático (bot/82-0) pede tempo: o adversário embalou
  wantsTimeout(ti) {
    if (this.done || this.timeouts[ti] <= 0 || this.challenge || this.run.team !== 1 - ti) return false;
    const behind = this.score[1 - ti] - this.score[ti];
    return this.run.pts >= 10 || (this.run.pts >= 7 && this.q >= 3 && behind >= -4);
  }

  // ---------- bola decisiva ----------
  // chance de o arremessador s converter contra o marcador x, escolhendo o melhor tipo de arremesso
  clutchShot(s, x, need) {
    const sa = s.a, xa = x.a;
    const mod = 0.07 * tw(s, 'C') - 0.03 * tw(x, 'D') + this.heatMod(s);
    const opts = [
      { type: 0, pts: 3, p: 0.34 + (sa.tres - xa.defPer) * 0.0045 + mod },
      { type: 1, pts: 2, p: 0.42 + (sa.media - xa.defPer) * 0.0045 + mod },
      { type: 2, pts: 2, p: 0.5 + (sa.infil - xa.defAro) * 0.0045 + mod - 0.02 * tw(x, 'B') },
      { type: 3, pts: 2, p: 0.46 + (sa.post - xa.defAro) * 0.0045 + mod - 0.02 * tw(x, 'B') },
    ].map((o) => ({ ...o, p: clamp(o.p, 0.12, 0.75) }));
    // valor de cada opção: precisa de 3 → só a de três vale; precisa de 2 → a de dois só empata
    const val = (o) => (need >= 3 ? (o.pts === 3 ? o.p : 0) : need === 2 ? (o.pts === 3 ? o.p : o.p * 0.5) : o.p);
    return opts.reduce((a, b) => (val(b) > val(a) ? b : a));
  }
  autoShooter(o, need) {
    const off = this.onCourt(o), def = this.onCourt(1 - o);
    const avgDef = def.reduce((a, p) => a + (p.a.defPer + p.a.defAro) / 2, 0) / def.length;
    const ghost = { a: { defPer: avgDef, defAro: avgDef }, tags: '' };
    return off.reduce((a, b) => (this.clutchShot(b, ghost, need).p > this.clutchShot(a, ghost, need).p ? b : a));
  }
  autoDefender(d) {
    const def = this.onCourt(d);
    const v = (p) => Math.max(p.a.defPer, p.a.defAro) + 6 * tw(p, 'D') + 3 * tw(p, 'B');
    return def.reduce((a, b) => (v(b) > v(a) ? b : a));
  }
  startChallenge(o) {
    const d = 1 - o;
    const need = this.score[d] - this.score[o];
    this.clutchQ = this.q;
    this.challenge = {
      o, d, need, q: this.q, clock: Math.max(1, Math.round(this.clock)),
      off: this.onCourt(o).map((p) => p.id), def: this.onCourt(d).map((p) => p.id),
      shooter: null, defender: null,
    };
    const sit = need === 0 ? 'Jogo empatado' : `${need} ponto${need > 1 ? 's' : ''} atrás`;
    this.addPlay(`⏱️ BOLA DECISIVA! ${sit}, ${this.clockStr()} no relógio. O ataque escolhe quem arremessa; a defesa, quem marca.`, o, 0, 'clutch');
    if (this.auto) this.resolveChallenge();
  }
  pickChallenge(ti, pid) {
    const c = this.challenge;
    if (!c) return false;
    if (ti === c.o && !c.shooter && c.off.includes(pid)) { c.shooter = pid; return true; }
    if (ti === c.d && !c.defender && c.def.includes(pid)) { c.defender = pid; return true; }
    return false;
  }
  resolveChallenge() {
    const c = this.challenge;
    if (!c) return null;
    const off = this.onCourt(c.o), def = this.onCourt(c.d);
    const s = off.find((p) => p.id === c.shooter) || this.autoShooter(c.o, c.need);
    const x = def.find((p) => p.id === c.defender) || this.autoDefender(c.d);
    const shot = this.clutchShot(s, x, c.need);
    const made = rnd() < shot.p;
    const sn = short(s.name), xn = short(x.name);
    const how = ['de três', 'de média distância', 'infiltrando', 'de costas para a cesta'][shot.type];
    if (made) {
      this.addScore(c.o, shot.pts);
      this.credit(s.id, 'pts', shot.pts);
      this.addPlay(`🎯 ${sn} encara ${xn}, arrisca ${how}… CAIU! ${shot.pts} pontos no estouro do relógio!`, c.o, shot.pts, shot.type === 0 ? 'three' : 'score');
    } else {
      this.addPlay(`🛑 ${xn} fecha em cima de ${sn}! O arremesso ${how} não cai.`, c.d, 0, 'block');
    }
    this.shotResult(s, made, c.o);
    this.lastChallenge = { ...c, shooter: s.id, defender: x.id, made, pts: made ? shot.pts : 0, type: shot.type, chance: Math.round(shot.p * 100) };
    this.challenge = null;
    this.tickCards(this.clock);
    this.clock = 0;
    this.endPeriod();
    return this.lastChallenge;
  }

  // ---------- cartas ----------
  activateCard(ti, auto) {
    const c = this.cards[ti];
    if (!c || c.state !== 'ready' || this.done) return false;
    const def = CARDS[c.type];
    c.state = 'active'; c.left = def.dur; c.auto = !!auto;
    this.addPlay(`${def.icon} ${def.label.toUpperCase()} ${auto ? 'ativado automaticamente' : 'ativado'}! (${Math.round(def.dur / 60)} min)`, ti, 0, 'card');
    return true;
  }
  tickCards(elapsed) {
    for (const c of this.cards) {
      if (c && c.state === 'active') { c.left -= elapsed; if (c.left <= 0) { c.left = 0; c.state = 'used'; } }
    }
  }
  cardOn(ti) { const c = this.cards[ti]; return c && c.state === 'active' ? c.type : null; }
  cardState() { return this.cards.map((c) => c && { type: c.type, state: c.state, left: Math.round(c.left), auto: c.auto }); }

  // titulares/banco com os atributos já penalizados pela posição em que jogam
  lineupInfo(ti) {
    const t = this.teams[ti];
    const lu = t.lineup || D.autoLineup(t.roster.map((id) => getPlayer(id, this.extra)).filter(Boolean));
    const key = JSON.stringify(lu);
    if (t.cacheKey === key) return t.cache;
    const mk = (id, slot) => {
      const p = getPlayer(id, this.extra);
      if (!p) return null;
      const pen = slot ? posPenalty(p, slot) : 0;
      return { ...p, slot, pen, a: attrs(p, pen), eff: p.ovr - pen };
    };
    const starters = POS_ORDER.map((s) => mk(lu[s], s)).filter(Boolean);
    const bench = (lu.bench || []).map((id) => getPlayer(id, this.extra)).filter(Boolean);
    t.cacheKey = key;
    t.cache = { starters, bench, mk };
    return t.cache;
  }

  onCourt(ti) {
    const { starters, bench, mk } = this.lineupInfo(ti);
    if (!bench.length || this.q > 4 || starters.length < 5) return starters;
    // janelas de descanso: no fim do 1º/3º quarto descansam os titulares mais fracos;
    // no começo do 2º/4º quarto descansam as estrelas
    const c = this.clock;
    let rest = 0, stars = false;
    if (this.q === 1 || this.q === 3) rest = c <= 300 && c > 60 ? 3 : 0;
    if (this.q === 2 && c > 450) { rest = 2; stars = true; }
    if (this.q === 4 && c > 570) { rest = 2; stars = true; }
    rest = Math.min(rest, bench.length);
    if (!rest) return starters;
    const line = starters.slice();
    const ranked = line.map((p, i) => i).sort((x, y) => line[x].eff - line[y].eff);
    const order = stars ? ranked.slice(-rest) : ranked.slice(0, rest);
    const avail = bench.slice();
    for (const i of order) {
      const slot = line[i].slot;
      let bi = 0, bv = -1e9;
      avail.forEach((b, k) => { const v = b.ovr - posPenalty(b, slot); if (v > bv) { bv = v; bi = k; } });
      line[i] = mk(avail[bi].id, slot);
      avail.splice(bi, 1);
    }
    return line;
  }

  clockStr() {
    const c = Math.max(0, Math.round(this.clock));
    const m = Math.floor(c / 60), s = c % 60;
    const qn = this.q <= 4 ? this.q + 'º' : 'OT' + (this.q - 4 > 1 ? this.q - 4 : '');
    return `${qn} ${m}:${String(s).padStart(2, '0')}`;
  }

  addPlay(txt, team, pts = 0, kind = '') {
    const p = { t: this.clockStr(), txt, team, pts, kind, s: [this.score[0], this.score[1]] };
    this.plays.push(p);
    this.pending.push(p); // vai no próximo envio (inclusive jogadas fora de step, como ativar carta)
  }
  credit(pid, key, v = 1) { if (this.box[pid]) this.box[pid][key] += v; }
  addScore(ti, pts) {
    this.score[ti] += pts;
    const qs = this.qScores[ti]; qs[qs.length - 1] += pts;
    if (pts > 0) {
      if (this.run.team === ti) this.run.pts += pts;
      else this.run = { team: ti, pts, ann: 0 };
    }
  }
  isClutch() { return (this.q === 4 && this.clock <= 300) || this.q > 4; }

  freeThrows(o, shooter, n) {
    const ftPct = clamp(0.6 + (shooter.a.tres - 70) * 0.007 + (shooter.pos === 'C' && !shooter.tags.includes('S') ? -0.07 : 0) + (this.isClutch() ? 0.04 * tw(shooter, 'C') : 0), 0.45, 0.94);
    let made = 0;
    for (let k = 0; k < n; k++) if (rnd() < ftPct) made++;
    this.addScore(o, made);
    this.credit(shooter.id, 'pts', made);
    return made;
  }

  // Avança uma posse de bola. Retorna as jogadas novas.
  step() {
    if (!this.done && !this.challenge) this._step();
    const out = this.pending;
    this.pending = [];
    return out;
  }

  _step() {
    if (!this.started) { this.started = true; this.addPlay('Bola ao alto! Começa a partida.', -1, 0, 'info'); }
    // cartas: ativação automática nos minutos finais
    for (let i = 0; i < 2; i++) {
      const c = this.cards[i];
      if (c && c.state === 'ready' && ((this.q === 4 && this.clock <= CARD_AUTO) || this.q > 4)) this.activateCard(i, true);
    }
    const c0 = this.clock;
    const o = this.ball, d = 1 - o;
    // bola decisiva: jogo apertado no fim do 4º quarto (ou da prorrogação) e o ataque não está na frente
    if (this.q >= 4 && this.clutchQ !== this.q && this.clock <= CLUTCH_SECS && this.clock > 0) {
      const diff = this.score[o] - this.score[d];
      if (diff <= 0 && diff >= -3) { this.startChallenge(o); return; }
    }
    if (this.auto) for (let i = 0; i < 2; i++) if (this.wantsTimeout(i)) this.callTimeout(i, 'O técnico');
    const co = this.cardOn(o), cd = this.cardOn(d);
    const tacO = this.teams[o].tactics || {}, tacD = this.teams[d].tactics || {};
    const off = this.onCourt(o), def = this.onCourt(d);
    const clutch = this.isClutch();

    // esquemas: bônus proporcional ao encaixe dos jogadores em quadra (0 = sem bônus/sem ônus)
    const sch = SCHEMES[tacO.esquema] ? tacO.esquema : 'equilibrado';
    const fit = schemeFit(SCHEMES[sch], off).fit;
    const f = (k) => (sch === k ? fit : 0);
    const dsch = DEF_SCHEMES[tacD.defesa] ? tacD.defesa : 'individual';
    const dfit = schemeFit(DEF_SCHEMES[dsch], def).fit;
    const zone = dsch === 'zona', pressing = dsch === 'pressao';
    // arenas: bônus do time da casa da arena (nunca ônus para o dono)
    const ao = this.teams[o].arena, ad = this.teams[d].arena;
    const A = (ar, type) => (ar && ar.type === type ? ar.v : 0);

    const paceBase = tacO.ritmo === 'lento' ? 18 : tacO.ritmo === 'rapido' ? 11 : 14.5;
    this.clock -= clamp(paceBase - 2 * f('showtime') + (rnd() * 8 - 4), 4, 24);

    const perD = avg(def, 'defPer');
    const rimD = Math.max(...def.map((p) => p.a.defAro)) + (zone ? 4 * dfit : 0);
    const offPass = Math.max(...off.map((p) => p.a.passe)) * 0.6 + avg(off, 'passe') * 0.4;
    const home = o === 0 ? 0.01 : 0;
    const paceAdj = tacO.ritmo === 'lento' ? 0.015 : tacO.ritmo === 'rapido' ? -0.012 : 0;

    // turnover / roubo
    let toChance = 0.125 + (pressing ? 0.025 + 0.03 * dfit : 0) + (perD - offPass) * 0.002 - 0.03 * f('showtime') + (tacO.ritmo === 'rapido' ? 0.01 : 0);
    if (!off.some(D.isGuard)) toChance += 0.025;
    toChance += A(ad, 'roubos') - A(ao, 'passe') + (cd === 'escudo' ? 0.02 : 0) + (this.broken[o] > 0 ? BROKEN_TO : 0);
    toChance = clamp(toChance, 0.05, 0.26);
    if (rnd() < toChance) {
      const loser = weighted(off, (p) => (p.ovr - 55) * (1 - 0.4 * tw(p, 'P')));
      if (rnd() < 0.45 + 0.25 * (pressing ? dfit : 0)) {
        const thief = weighted(def, (p) => Math.pow(Math.max(1, p.a.defPer - 50), 2.5));
        this.credit(thief.id, 'stl');
        this.addPlay(fmt(pick(TXT.steal), { d: short(thief.name), p: short(loser.name) }), d, 0, 'tov');
      } else {
        this.addPlay(fmt(pick(TXT.tov), { p: short(loser.name) }), o, 0, 'tov');
      }
      this.endPossession(o, d, c0);
      return;
    }

    let extra = 0;
    for (;;) {
      // quem arremessa
      const shooter = weighted(off, (p) => {
        let w = Math.max(4, 12 + (p.eff - 70) * 0.6);
        w *= 1 + 0.35 * tw(p, 'X') + 0.1 * Math.max(tw(p, 'S'), tw(p, 'M'), tw(p, 'I'), tw(p, 'G'));
        w *= 1 - 0.15 * tw(p, 'P');
        w *= 1 + f('estrela') * 1.2 * Math.max(tw(p, 'X'), tw(p, 'M'), tw(p, 'C'));
        if (clutch) w *= 1 + 0.8 * tw(p, 'C');
        const h = this.heat[p.id];
        if (h && h.st) w *= h.st === 'fire' ? 1.6 : 0.75; // quem está quente pede a bola
        return w;
      });
      const sa = shooter.a;
      const sn = short(shooter.name);
      const cw = clutch ? tw(shooter, 'C') : 0;

      // falta no arremesso
      const foulChance = 0.08 + 0.03 * (tw(shooter, 'I') + tw(shooter, 'G')) + 0.02 * f('garrafao') + (pressing ? 0.02 : 0);
      if (rnd() < foulChance) {
        const made = this.freeThrows(o, shooter, 2);
        this.addPlay(made === 2 ? `${sn} converte os 2 lances livres.` : made === 1 ? `${sn} acerta 1 de 2 lances livres.` : `${sn} erra os 2 lances livres.`, o, made, 'ft');
        break;
      }

      // contra-ataque (showtime)
      if (extra === 0 && rnd() < 0.09 * f('showtime') + (tacO.ritmo === 'rapido' ? 0.03 : 0) + A(ao, 'showtime') + A(ao, 'ritmo') * 0.5 + (co === 'isotonico' ? 0.03 : 0)) {
        const runner = weighted(off, (p) => 1 + 3 * tw(p, 'I') + 2 * tw(p, 'D'));
        if (rnd() < 0.8) {
          this.addScore(o, 2); this.credit(runner.id, 'pts', 2);
          this.shotResult(runner, true, o);
          const passer = weighted(off.filter((p) => p.id !== runner.id), (p) => Math.pow(Math.max(1, p.a.passe - 50), 1.6));
          if (passer) this.credit(passer.id, 'ast');
          this.addPlay(fmt(pick(TXT.fast), { p: short(runner.name) }) + (passer ? ` (assist. ${short(passer.name)})` : ''), o, 2, 'score');
          break;
        }
      }

      // tipo de arremesso
      const base = (SHOT_BASE[shooter.pos] || SHOT_BASE.SF).slice();
      if (co === 'mira' && shooter.tags.includes('S')) base[0] *= 1.25; // arrisca chutes mais difíceis
      base[0] *= (1 + 1.6 * tw(shooter, 'S')) * (shooter.tags.includes('S') ? 1 : 0.7) * (1 + 0.4 * f('tres')) * (zone ? 1.15 : 1);
      base[1] *= (1 + 1.4 * tw(shooter, 'M')) * (1 + 0.3 * f('estrela'));
      base[2] *= (1 + 1.3 * tw(shooter, 'I')) * (1 + 0.25 * f('garrafao')) * (zone ? 0.9 : 1);
      base[3] *= (1 + 1.5 * tw(shooter, 'G')) * (1 + 0.25 * f('garrafao')) * (zone ? 0.9 : 1);
      const type = weighted([0, 1, 2, 3], (i) => base[i]);

      let make;
      if (type === 0) make = 0.355 + (sa.tres - perD) * 0.0036 + 0.035 * f('tres') + (zone ? 0.02 : 0);
      else if (type === 1) make = 0.42 + (sa.media - perD) * 0.0034;
      else if (type === 2) make = 0.6 + (sa.infil - rimD) * 0.0036 + 0.03 * f('garrafao') + 0.03 * f('showtime') - (zone ? 0.03 + 0.03 * dfit : 0);
      else make = 0.5 + (sa.post - rimD) * 0.0036 + 0.03 * f('garrafao') - (zone ? 0.02 + 0.03 * dfit : 0);
      make += paceAdj + home + this.form[o] + (pressing ? 0.012 : 0) + 0.04 * cw
        + 0.05 * f('estrela') * Math.min(1, tw(shooter, 'X') + tw(shooter, 'M') + tw(shooter, 'C'));
      if (!def.some(isBig) && type >= 2) make += 0.05;
      make += A(ao, 'pontuacao') + (type === 0 ? A(ao, 'tres') : 0) + (type >= 2 ? A(ao, 'garrafao') : 0) + (type === 1 ? A(ao, 'meia') : A(ao, 'meia') / 3)
        + (sch === 'showtime' ? A(ao, 'showtime') : 0) + (this.q >= 4 ? A(ao, 'decisivo') : 0) + (this.q >= 3 ? A(ao, 'segundo') : 0)
        + A(ao, 'passe') / 2 + (tacO.ritmo === 'rapido' ? A(ao, 'ritmo') : A(ao, 'ritmo') * 0.4) + (o === 0 ? A(ao, 'casa') * 2 : 0)
        - A(ad, 'defesa') - (type >= 2 ? A(ad, 'tocos') : 0);
      // cartas
      if (co === 'isotonico') make += /^[SMIGXP]/.test(shooter.tags) ? 0.04 : 0.02;
      if (co === 'mira' && /[SM]/.test(shooter.tags)) make += type <= 1 ? 0.06 : 0.03;
      if (cd === 'escudo') make -= 0.035;
      if (cd === 'isotonico') make -= Math.min(0.035, 0.012 * def.filter((p) => /^[DBR]/.test(p.tags)).length);
      // fogo/gelo, time embalado e ritmo quebrado pelo tempo do adversário
      make += this.heatMod(shooter) - this.fireDefense(def);
      if (this.run.team === o && this.run.pts >= RUN_HOT) make += RUN_BUFF;
      if (this.broken[o] > 0) make -= BROKEN_MAKE;
      make = clamp(make, 0.15, 0.85);

      if (rnd() < make) {
        const pts = type === 0 ? 3 : 2;
        this.addScore(o, pts);
        this.credit(shooter.id, 'pts', pts);
        let txt;
        if (type === 0) txt = fmt(pick(sa.tres >= 95 && rnd() < 0.3 ? TXT.threeLogo : TXT.three), { p: sn });
        else if (type === 1) txt = fmt(pick(tw(shooter, 'M') && rnd() < 0.5 ? TXT.midFade : TXT.mid), { p: sn });
        else if (type === 2) txt = fmt(pick(rnd() < 0.25 + 0.3 * tw(shooter, 'I') ? TXT.dunk : TXT.rim), { p: sn });
        else txt = fmt(pick(rnd() < 0.4 * tw(shooter, 'G') ? TXT.postBig : TXT.post), { p: sn });
        const maxP = Math.max(...off.map((p) => tw(p, 'P')));
        const astChance = [0.8, 0.42, 0.55, 0.35][type] + 0.08 * maxP + 0.1 * f('showtime');
        if (rnd() < astChance) {
          const passer = weighted(off.filter((p) => p.id !== shooter.id), (p) => Math.pow(Math.max(1, p.a.passe - 50), 1.6));
          if (passer) { this.credit(passer.id, 'ast'); txt += ` (assist. ${short(passer.name)})`; }
        }
        if (type >= 2 && rnd() < 0.06 + 0.04 * tw(shooter, 'G')) {
          txt += this.freeThrows(o, shooter, 1) ? ' E UM! Converte o lance livre.' : ' Sofre falta, mas erra o lance livre.';
        }
        if (cw > 0.5 && rnd() < 0.5) txt += pick(TXT.clutch);
        this.addPlay(txt, o, pts, type === 0 ? 'three' : 'score');
        this.shotResult(shooter, true, o);
        break;
      }

      // errou: toco?
      if (type >= 2 && rnd() < 0.05 + Math.max(0, rimD - 75) * 0.004 + A(ad, 'tocos') * 2) {
        const blocker = weighted(def, (p) => Math.pow(Math.max(1, p.a.defAro - 50), 2.5));
        this.credit(blocker.id, 'blk');
        this.addPlay(fmt(pick(TXT.block), { d: short(blocker.name), p: sn }), d, 0, 'block');
      } else {
        this.addPlay(fmt(pick([TXT.threeMiss, TXT.midMiss, TXT.rimMiss, TXT.postMiss][type]), { p: sn }), o, 0, 'miss');
      }
      this.shotResult(shooter, false, o);
      // rebote
      const orebChance = clamp(0.24 + (avg(off, 'reb') - avg(def, 'reb')) * 0.005 + 0.04 * f('garrafao') - (zone ? 0.02 * dfit : 0) + A(ao, 'rebote') - A(ad, 'rebote'), 0.08, 0.45);
      if (extra < 2 && rnd() < orebChance) {
        const reb = weighted(off, (p) => Math.pow(Math.max(1, p.a.reb - 50), 1.8));
        this.credit(reb.id, 'reb');
        this.addPlay(fmt(pick(TXT.oreb), { r: short(reb.name) }), o, 0, 'oreb');
        extra++;
        this.clock -= 4;
        continue;
      }
      const reb = weighted(def, (p) => Math.pow(Math.max(1, p.a.reb - 50), 1.8));
      this.credit(reb.id, 'reb');
      break;
    }

    this.endPossession(o, d, c0);
  }

  endPossession(o, d, c0) {
    if (this.broken[o] > 0) this.broken[o]--;
    // anuncia corridas grandes
    if (this.run.pts >= RUN_HOT && this.run.ann < 1) { this.run.ann = 1; this.addPlay(`📈 Corrida de ${this.run.pts}-0! O time está embalado.`, this.run.team, 0, 'run'); }
    else if (this.run.pts >= 14 && this.run.ann < 2) { this.run.ann = 2; this.addPlay(`📈 ${this.run.pts}-0! Atropelo!`, this.run.team, 0, 'run'); }
    this.ball = d;
    const el = c0 - Math.max(0, this.clock);
    this.tickCards(el);
    this.tickHeat(el);
    if (this.clock <= 0) this.endPeriod();
  }

  endPeriod() {
    const [a, b] = this.score;
    if (this.q >= 4 && a !== b) {
      this.done = true; this.clock = 0;
      this.addPlay(`FIM DE JOGO! ${a} x ${b}`, -1, 0, 'end');
      return;
    }
    if (this.q >= 4) {
      this.q++; this.clock = OT;
      this.qScores[0].push(0); this.qScores[1].push(0);
      this.addPlay(`Empate em ${a} x ${b}! PRORROGAÇÃO!`, -1, 0, 'info');
      this.ball = rnd() < 0.5 ? 0 : 1;
      return;
    }
    const label = this.q === 2 ? 'Fim do 1º tempo' : `Fim do ${this.q}º quarto`;
    this.addPlay(`${label}: ${a} x ${b}`, -1, 0, 'info');
    this.q++; this.clock = QUARTER;
    this.qScores[0].push(0); this.qScores[1].push(0);
    this.ball = (this.q === 2 || this.q === 3) ? 1 - this.qStartBall : this.qStartBall;
  }

  winner() { return this.score[0] > this.score[1] ? 0 : 1; }

  leaders() {
    const out = [null, null];
    for (const [pid, s] of Object.entries(this.box)) if (!out[s.tm] || s.pts > out[s.tm][1]) out[s.tm] = [pid, s.pts];
    return out;
  }

  starterIds(ti) { return this.lineupInfo(ti).starters.map((p) => p.id); }

  finish() {
    this.auto = true; // ninguém para escolher: tempo e bola decisiva no automático
    if (this.challenge) this.resolveChallenge();
    let guard = 0;
    while (!this.done && guard++ < 3000) this.step();
  }
}

module.exports = { Match };
