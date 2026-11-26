// Lógica de uma sala: lobby → leilão → temporada → fim
const D = require('../public/data.js');
const { TEAMS, PLAYERS, POOLS } = D;
const { Match } = require('./sim');
const history = require('./history');
const league82 = require('./league82');

const BUDGET = 100;
const MAX_MANAGERS = 16;
// ~205 posses por jogo: rápida ≈ 1 min, normal ≈ 2 min, lenta ≈ 3 min
const SPEED_MS = { rapido: 290, normal: 585, lento: 880 };
const INTERVAL_MS = 12000;
const RESULT_MS = 2200;
const PICK_MS = 30000; // tempo de cada técnico para escolher a franquia
const TIMEOUT_MS = 5000;   // o jogo fica parado durante o pedido de tempo
const CHALLENGE_MS = 10000; // tempo para escolher arremessador/marcador na bola decisiva
const REVEAL_MS = 3800;    // resultado da bola decisiva na tela antes de seguir (inclui ~1s de suspense)
const FAST_MS = { rapido: 380, normal: 750, lento: 1200 }; // 82-0: uma rodada inteira a cada X ms
const GAMES_82 = 82;

const BOT_NAMES = ['Phil Robô', 'Pop Bot', 'Red Auerbot', 'Coach K-9', 'Riley 2000', 'Kerr.exe', 'Doc Bits', 'Spo-Bot',
  'Thibs.AI', 'Nick Nurse-O-Matic', 'Rick Carlisle 3.0', 'Bot Brown', 'Jerry Sloan.io', 'Bot Jackson', 'Larry Brownie', 'Mike D\'Bot'];

const rnd = Math.random;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uid = () => Math.random().toString(36).slice(2, 10);

const VALID = {
  pool: ['atual', 'lendas', 'mix', 'franquia'],
  rosterSize: [5, 8, 10],
  bidTime: [8, 10, 15],
  format: ['liga', 'playoffs', 'ambos', 'oitenta'],
  turns: [1, 2],
  speed: ['rapido', 'normal', 'lento'],
};
const TACTICS = {
  ritmo: ['lento', 'normal', 'rapido'],
  esquema: Object.keys(D.SCHEMES),
  defesa: Object.keys(D.DEF_SCHEMES),
};
const defaultTactics = () => ({ ritmo: 'normal', esquema: 'equilibrado', defesa: 'individual' });

class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.hostId = null;
    this.phase = 'lobby';
    this.settings = { pool: 'atual', rosterSize: 5, bidTime: 10, format: 'ambos', turns: 1, speed: 'normal' };
    this.managers = [];
    this.chat = [];
    this.extra = {}; // agentes livres gerados
    this.auction = null;
    this.season = null;
    this.end = null;
    this.cpuExtra = null;
    this.extraAll = null;
    this.lastActive = Date.now();
    this.dirty = true;
    this.ready = new Set();
  }

  // ---------- utilidades ----------
  // técnicos da sala; no 82-0 também os times de lendas da liga
  mgr(id) { return this.managers.find((m) => m.id === id) || (this.season && this.season.cpu ? this.season.cpu[id] : undefined); }
  player(id) { return PLAYERS[id] || this.extra[id] || (this.cpuExtra && this.cpuExtra[id]); }
  humans() { return this.managers.filter((m) => !m.isBot); }
  slotsLeft(m) { return this.settings.rosterSize - m.roster.length; }
  maxBid(m) { return Math.max(0, m.budget - (this.slotsLeft(m) - 1)); }
  isFranchise() { return this.settings.pool === 'franquia'; }
  baseBudget() { return this.isFranchise() ? (D.FRANCHISE_BUDGET[this.settings.rosterSize] || 60) : BUDGET; }

  // monta a lista de ofertas: quantidade igual por posição (pela posição principal), uma versão de cada jogador,
  // com um pouco mais de chance para quem tem overall maior
  buildQueue(ids, count) {
    const byId = {};
    for (const id of ids) { const key = D.identity(PLAYERS[id]); (byId[key] = byId[key] || []).push(id); }
    const groups = Object.values(byId).map((vs) => shuffle(vs));
    let cands = groups.map((vs) => vs.shift());
    const out = [];
    const take = (filter, n) => {
      for (let i = 0; i < n; i++) {
        const pool = cands.filter(filter);
        if (!pool.length) return;
        let total = 0;
        const ws = pool.map((id) => { const w = 1 + Math.max(0, PLAYERS[id].ovr - 75) / 8; total += w; return w; });
        let r = rnd() * total, k = 0;
        for (; k < pool.length - 1; k++) { r -= ws[k]; if (r <= 0) break; }
        out.push(pool[k]);
        cands.splice(cands.indexOf(pool[k]), 1);
      }
    };
    const per = Math.floor(count / 5);
    for (const pos of D.POS_ORDER) {
      const before = out.length;
      take((id) => PLAYERS[id].pos === pos, per);
      // faltou gente com essa posição principal? usa quem também joga nela
      take((id) => D.positionsOf(PLAYERS[id]).includes(pos), per - (out.length - before));
    }
    while (out.length < count) {
      if (!cands.length) cands = groups.filter((vs) => vs.length).map((vs) => vs.shift());
      if (!cands.length) break;
      take(() => true, count - out.length);
    }
    return shuffle(out);
  }

  freeTeam() {
    const used = new Set(this.managers.map((m) => m.team));
    const free = TEAMS.filter((t) => !used.has(t.id));
    return free.length ? free[Math.floor(rnd() * free.length)].id : TEAMS[0].id;
  }
  sys(text) { this.pushChat({ sys: true, text }); }
  pushChat(msg) {
    msg.ts = Date.now();
    this.chat.push(msg);
    if (this.chat.length > 60) this.chat.shift();
    this.io.to(this.code).emit('chat', msg);
  }
  touch() { this.dirty = true; }
  // humanos conectados agora (bots estão sempre prontos)
  present() { return this.managers.filter((m) => !m.isBot && m.connected); }
  allReady() { return this.present().every((m) => this.ready.has(m.id)); }
  setReady(mid, val) {
    const m = this.mgr(mid);
    if (!m || !['arenas', 'season'].includes(this.phase)) return;
    if (this.phase === 'season' && this.season.status !== 'prep') return;
    if (val) this.ready.add(mid); else this.ready.delete(mid);
    this.touch();
  }

  // ---------- conexão ----------
  join(socket, name, token) {
    this.lastActive = Date.now();
    let m = this.managers.find((x) => x.token && x.token === token);
    if (m) {
      m.socketId = socket.id;
      m.connected = true;
      m.leftAt = null;
      if (name && this.phase === 'lobby') m.name = name;
      const h = this.mgr(this.hostId);
      if (!h || !h.connected) this.hostId = m.id;
      this.touch();
      return { ok: true, id: m.id };
    }
    if (this.phase !== 'lobby') return { ok: true, id: null, spectator: true };
    if (this.managers.length >= MAX_MANAGERS) {
      // substitui um bot se houver
      const bot = this.managers.find((x) => x.isBot);
      if (!bot) return { ok: false, error: 'Sala cheia (16 técnicos).' };
      this.managers = this.managers.filter((x) => x !== bot);
    }
    m = {
      id: uid(), token, name: name || 'Técnico', team: this.freeTeam(), isBot: false,
      connected: true, socketId: socket.id, budget: BUDGET, roster: [], prices: {}, tactics: defaultTactics(),
    };
    this.managers.push(m);
    if (!this.hostId || !this.mgr(this.hostId)) this.hostId = m.id;
    this.sys(`${m.name} entrou na sala.`);
    this.touch();
    return { ok: true, id: m.id };
  }

  disconnect(socketId) {
    const m = this.managers.find((x) => x.socketId === socketId);
    if (!m) return;
    m.connected = false;
    m.socketId = null;
    if (this.phase === 'lobby') {
      // no lobby, quem sai libera a vaga depois de um tempo
      m.leftAt = Date.now();
    }
    if (this.hostId === m.id) {
      const next = this.humans().find((x) => x.connected);
      if (next) { this.hostId = next.id; this.sys(`${next.name} agora é o líder da sala.`); }
    }
    this.touch();
  }

  // ---------- lobby ----------
  isHost(id) { return id && this.hostId === id; }

  setTeam(mid, teamId) {
    const m = this.mgr(mid);
    if (!m || this.phase !== 'lobby' || this.isFranchise()) return;
    if (!TEAMS.some((t) => t.id === teamId)) return;
    if (this.managers.some((x) => x.team === teamId && x !== m)) return;
    m.team = teamId;
    this.touch();
  }

  setSettings(mid, s) {
    if (!this.isHost(mid) || this.phase !== 'lobby') return;
    for (const k of Object.keys(VALID)) {
      if (s[k] !== undefined && VALID[k].includes(s[k])) this.settings[k] = s[k];
    }
    this.touch();
  }

  addBot(mid) {
    if (!this.isHost(mid) || this.phase !== 'lobby' || this.managers.length >= MAX_MANAGERS) return;
    const used = new Set(this.managers.map((m) => m.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot ' + (this.managers.length + 1);
    this.managers.push({
      id: uid(), name, team: this.freeTeam(), isBot: true, connected: true, budget: BUDGET, roster: [], prices: {},
      tactics: defaultTactics(), style: shuffle(['tres', 'equilibrado', 'garrafao'])[0], greed: 0.85 + rnd() * 0.35,
    });
    this.touch();
  }

  removeManager(mid, target) {
    if (!this.isHost(mid) || this.phase !== 'lobby' || target === mid) return;
    const t = this.mgr(target);
    if (!t) return;
    this.managers = this.managers.filter((x) => x !== t);
    if (!t.isBot) {
      this.sys(`${t.name} foi removido da sala.`);
      if (t.socketId) this.io.to(t.socketId).emit('kicked');
    }
    this.touch();
  }

  chatMsg(mid, text) {
    const m = this.mgr(mid);
    text = String(text || '').trim().slice(0, 200);
    if (!m || !text) return;
    this.pushChat({ from: m.name, team: m.team, text });
  }

  // limpa quem saiu do lobby há muito tempo
  cleanupLobby(now) {
    if (this.phase !== 'lobby') return;
    const before = this.managers.length;
    this.managers = this.managers.filter((m) => m.isBot || m.connected || now - (m.leftAt || now) < 60000);
    if (this.managers.length !== before) {
      if (!this.mgr(this.hostId)) {
        const h = this.humans().find((x) => x.connected);
        this.hostId = h ? h.id : null;
      }
      this.touch();
    }
  }

  // ---------- leilão ----------
  start(mid) {
    if (!this.isHost(mid) || this.phase !== 'lobby') return { error: 'Só o líder pode iniciar.' };
    if (this.managers.length < 2) return { error: 'Precisa de pelo menos 2 técnicos (adicione bots se quiser).' };
    this.extra = {};
    this.end = null;
    this.season = null;
    for (const m of this.managers) {
      m.budget = this.baseBudget(); m.roster = []; m.prices = {}; m.tactics = defaultTactics(); m.arena = null; m.card = null; m.pending = null;
      m.lineup = { PG: null, SG: null, SF: null, PF: null, C: null, bench: [] };
    }
    if (this.isFranchise()) {
      // modo franquia: sorteia a ordem e cada técnico escolhe a sua franquia na vez dele
      const now = Date.now();
      this.teamPick = { order: shuffle(this.managers.map((m) => m.id)), idx: 0, endsAt: 0, picks: {} };
      for (const m of this.managers) m.team = null;
      this.phase = 'teampick';
      this.sys('Ordem de escolha das franquias sorteada!');
      this.startPickTurn(now + 3500); // tempo para todo mundo ver a ordem
      this.touch();
      return { ok: true };
    }
    this.buildAuction();
    return { ok: true };
  }

  // ---------- escolha de franquia por ordem sorteada (modo franquia) ----------
  startPickTurn(at) {
    const tp = this.teamPick;
    tp.turnStart = at;
    tp.endsAt = at + PICK_MS;
    const cur = this.mgr(tp.order[tp.idx]);
    tp.botAt = cur && (cur.isBot || !cur.connected) ? at + 1200 + rnd() * 1500 : 0;
  }
  // força de uma franquia: média das 5 melhores lendas (uma versão por jogador)
  franchisePower(teamId) {
    const best = {};
    for (const id of POOLS.lendas) {
      const p = PLAYERS[id];
      if (D.franchiseOf(p.team) !== teamId) continue;
      const k = D.identity(p);
      if (!best[k] || p.ovr > best[k]) best[k] = p.ovr;
    }
    const top = Object.values(best).sort((a, b) => b - a).slice(0, 5);
    return top.reduce((s, x) => s + x, 0) / Math.max(1, top.length);
  }
  autoPickTeam() {
    const taken = new Set(this.managers.map((m) => m.team).filter(Boolean));
    const free = TEAMS.filter((t) => !taken.has(t.id));
    // escolhe entre as mais fortes que sobraram, com um pouco de sorte
    const ranked = free.map((t) => ({ id: t.id, v: this.franchisePower(t.id) + rnd() * 3 })).sort((a, b) => b.v - a.v);
    return ranked[0] ? ranked[0].id : null;
  }
  pickTeam(mid, teamId, now) {
    const tp = this.teamPick;
    if (this.phase !== 'teampick' || !tp) return { error: 'Não é hora de escolher franquia.' };
    if (tp.order[tp.idx] !== mid) return { error: 'Ainda não é a sua vez.' };
    if (now < tp.turnStart) return { error: 'Aguarde a sua vez começar.' };
    if (!TEAMS.some((t) => t.id === teamId)) return { error: 'Franquia inválida.' };
    if (this.managers.some((m) => m.team === teamId)) return { error: 'Essa franquia já foi escolhida.' };
    const m = this.mgr(mid);
    m.team = teamId;
    tp.picks[mid] = teamId;
    const t = TEAMS.find((x) => x.id === teamId);
    this.sys(`${tp.idx + 1}ª escolha: ${m.name} fica com o ${t.city} ${t.name}.`);
    tp.idx++;
    if (tp.idx >= tp.order.length) {
      tp.done = true;
      tp.finishAt = now + 2500;
    } else this.startPickTurn(now);
    this.touch();
    return { ok: true };
  }
  updateTeamPick(now) {
    const tp = this.teamPick;
    if (tp.done) { if (now >= tp.finishAt) this.buildAuction(); return; }
    const cur = this.mgr(tp.order[tp.idx]);
    if (!cur) { tp.idx++; this.startPickTurn(now); return; }
    if (now < tp.turnStart) return;
    // bot, quem caiu ou tempo esgotado: escolha automática
    if ((tp.botAt && now >= tp.botAt) || (!cur.isBot && !cur.connected) || now >= tp.endsAt) {
      const team = this.autoPickTeam();
      if (team) this.pickTeam(cur.id, team, now);
    }
  }

  buildAuction() {
    // fila do leilão: 60% mais jogadores do que vagas, com a mesma quantidade por posição
    const ownerOf = {};
    let pool;
    if (this.isFranchise()) {
      // cada técnico recebe só as lendas da franquia que escolheu; os lotes se alternam entre os técnicos
      const per = this.managers.map((m) => {
        const ids = POOLS.lendas.filter((id) => D.franchiseOf(PLAYERS[id].team) === m.team);
        const q = this.buildQueue(ids, D.lotsFor(this.settings.rosterSize));
        q.forEach((id) => { ownerOf[id] = m.id; });
        return q;
      });
      pool = [];
      for (let i = 0; per.some((q) => i < q.length); i++) per.forEach((q) => { if (i < q.length) pool.push(q[i]); });
    } else {
      pool = this.buildQueue(POOLS[this.settings.pool], D.lotsFor(this.managers.length * this.settings.rosterSize));
    }
    this.auction = {
      queue: pool, ownerOf, lot: null, history: [], unsold: [], lotNo: 0,
      total: pool.length, paused: false, pausedLeft: 0,
    };
    // antes do sorteio: todos veem as arenas e confirmam "Pronto"
    this.phase = 'arenas';
    this.ready = new Set();
    this.sys('Confiram as arenas e cliquem em Pronto para o sorteio.');
    this.touch();
  }

  beginDraw(now) {
    // sorteio das arenas: uma por técnico, sem repetir e sem troca
    const arenas = shuffle(D.ARENAS);
    this.managers.forEach((m, i) => { m.arena = arenas[i % arenas.length].id; });
    this.draw = { start: now, per: 1300, until: now + 2500 + 1300 * this.managers.length + 4000 };
    this.phase = 'draw';
    this.ready = new Set();
    this.sys('Sorteio das arenas! O que caiu, caiu.');
    this.touch();
  }

  updateDraw(now) {
    if (now < this.draw.until) return;
    this.phase = 'auction';
    this.sys(this.isFranchise() ? `O leilão começou! Cada técnico recebe as lendas da sua franquia, com preço fixo. Caixa: US$ ${this.baseBudget()} milhões.` : `O leilão começou! ${this.auction.total} jogadores serão ofertados. Cada técnico tem US$ ${this.baseBudget()} milhões.`);
    this.nextLot(now);
    this.touch();
  }

  skipDraw(mid, now) {
    if (!this.isHost(mid) || this.phase !== 'draw') return;
    this.draw.until = Math.min(this.draw.until, now + 1500);
    this.draw.start = now - 1300 * this.managers.length - 2500; // revela todas
    this.touch();
  }

  auctionDone() {
    const a = this.auction;
    return this.managers.every((m) => this.slotsLeft(m) <= 0) || a.queue.length === 0;
  }

  // ---------- lendas da franquia: preço fixo, só o dono do lote decide ----------
  // Lenda mais fraca que o seu time sai mais barata, e uma lenda que não é melhor que o seu time
  // sempre cabe no caixa: assim ninguém fica sem dinheiro para completar o elenco.
  franchisePrice(m, pid) {
    const p = this.player(pid);
    const base = D.tablePrice(p);
    const ovrs = m ? m.roster.map((id) => this.player(id).ovr) : [];
    if (!ovrs.length) return { price: base, basePrice: base, discount: null };
    const avg = ovrs.reduce((s, x) => s + x, 0) / ovrs.length;
    const diff = avg - p.ovr;
    let price = base, discount = null;
    if (diff >= 8) { price = 1; discount = 'bem mais fraco que o seu time'; }
    else if (diff >= 4) { price = Math.max(1, Math.ceil(base * 0.35)); discount = 'mais fraco que o seu time'; }
    else if (diff >= 0) { price = Math.max(1, Math.ceil(base * 0.6)); discount = 'não supera a média do seu time'; }
    // não é melhor que o seu time e você não teria dinheiro? o preço cai para o que cabe no seu caixa
    if (diff >= 0 && price > this.maxBid(m)) { price = Math.max(1, this.maxBid(m)); discount = 'ajustado ao seu caixa'; }
    return { price, basePrice: base, discount: price < base ? discount : null };
  }

  ownLotsLeft(m) { return this.auction.queue.filter((id) => this.auction.ownerOf[id] === m.id).length; }
  botWantsFranchise(m, pid, price) {
    if (price > this.maxBid(m)) return false;
    const left = this.slotsLeft(m);
    const lotsLeft = this.ownLotsLeft(m); // depois deste
    if (lotsLeft < left) return true; // vai faltar jogador: compra
    const p = this.player(pid);
    const court = D.POS_ORDER.filter((k) => !m.lineup[k]);
    const bestPen = court.length ? Math.min(...court.map((k) => D.posPenalty(p, k))) : 0;
    const fits = bestPen < 16 || (m.lineup.bench.length < this.benchCap() && left > court.length);
    const perSlot = m.budget / left;
    return fits && price <= perSlot * (p.mvp || p.ovr >= 92 ? 1.8 : 1.3);
  }
  franchiseDecide(mid, buy, now) {
    const lot = this.auction.lot;
    if (!lot || lot.result || lot.owner !== mid) return { error: 'Este lote não é seu.' };
    const m = this.mgr(mid);
    if (buy) {
      if (this.slotsLeft(m) <= 0) return { error: 'Seu elenco já está completo.' };
      if (lot.price > this.maxBid(m)) return { error: `Dinheiro insuficiente: seu máximo é US$ ${this.maxBid(m)}M (guarde US$ 1M por vaga).` };
      lot.bid = lot.price; lot.leader = mid; lot.bids = 1;
    } else lot.passed.add(mid);
    lot.endsAt = now;
    this.resolveLot(now);
    this.touch();
    return { ok: true };
  }

  nextLot(now) {
    const a = this.auction;
    if (this.isFranchise()) {
      // pula os lotes de quem já completou o elenco
      while (a.queue.length && this.slotsLeft(this.mgr(a.ownerOf[a.queue[0]]) || { roster: [] }) <= 0) { a.unsold.push(a.queue.shift()); a.lotNo++; }
    }
    if (this.auctionDone()) return this.finishAuction(now);
    const pid = a.queue.shift();
    a.lotNo++;
    a.lot = {
      pid, bid: 0, leader: null, endsAt: now + this.settings.bidTime * 1000, passed: new Set(),
      result: null, resultUntil: 0, botMax: {}, botNext: {}, bids: 0,
      owner: a.ownerOf[pid] || null, price: null, basePrice: null, discount: null,
    };
    if (this.isFranchise()) {
      const o = this.mgr(a.lot.owner);
      Object.assign(a.lot, this.franchisePrice(o, pid));
      if (o && o.isBot) a.lot.botNext[o.id] = now + 1200 + rnd() * 1500;
      this.touch();
      return;
    }
    a.mv = null;
    for (const m of this.managers) {
      if (!m.isBot) continue;
      a.lot.botMax[m.id] = this.botValue(m, pid);
      a.lot.botNext[m.id] = now + 1200 + rnd() * 2500;
    }
    this.touch();
  }

  // valor de mercado estimado agora, a partir do que ainda resta no leilão
  marketValues(pid) {
    const remaining = [pid, ...this.auction.queue].sort((a, b) => this.player(b).ovr - this.player(a).ovr);
    const slots = this.managers.reduce((s, m) => s + Math.max(0, this.slotsLeft(m)), 0);
    const spare = this.managers.reduce((s, m) => s + Math.max(0, m.budget - Math.max(0, this.slotsLeft(m))), 0);
    const r = remaining.indexOf(pid);
    const w = (i) => Math.exp(-2.6 * i / Math.max(1, slots));
    let sum = 0;
    for (let i = 0; i < Math.min(slots, remaining.length); i++) sum += w(i);
    return { value: r < slots * 1.15 ? 1 + spare * w(r) / Math.max(1e-6, sum) : 1, rank: r, slots };
  }

  botValue(m, pid) {
    const p = this.player(pid);
    const left = this.slotsLeft(m);
    if (left <= 0) return 0;
    const mk = this.auction.mv || this.marketValues(pid);
    this.auction.mv = mk;
    let v = mk.value;
    // quando os lotes estão acabando, o bot não espera: sobra vem com o pior jogador da posição
    const openSlots = this.managers.reduce((sum, x) => sum + Math.max(0, this.slotsLeft(x)), 0);
    const scarce = this.auction.queue.length + 1 <= openSlots + 2;
    if (!scarce && mk.rank >= mk.slots * 1.15 && rnd() < 0.6) return 0; // jogador fraco: geralmente ignora
    if (scarce) v = Math.max(v, 2 + rnd() * 3);
    // ajuste pelo dinheiro que sobrou por vaga em relação à média
    const totSlots = this.managers.reduce((s, x) => s + Math.max(0, this.slotsLeft(x)), 0);
    const totMoney = this.managers.reduce((s, x) => s + (this.slotsLeft(x) > 0 ? x.budget : 0), 0);
    v *= Math.max(0.5, Math.min(3, (m.budget / left) / (totMoney / Math.max(1, totSlots))));
    // necessidade de posição
    const have = m.roster.map((id) => this.player(id)).filter(Boolean);
    // encaixe na quadra: quem tem vaga na posição de origem vale mais; quem só caberia fora de posição, menos
    if (m.lineup) {
      const court = D.POS_ORDER.filter((k) => !m.lineup[k]);
      if (court.length) {
        const bestPen = Math.min(...court.map((k) => D.posPenalty(p, k)));
        const benchFree = m.lineup.bench.length < this.benchCap() && left > court.length;
        v *= bestPen === 0 ? 1.15 : bestPen <= 8 ? 1 : benchFree ? 0.85 : 0.55;
      }
    }
    // falta alguém para alguma posição? valoriza quem joga nela
    const covered = new Set(have.flatMap((x) => D.positionsOf(x)));
    if (have.length >= 2 && D.positionsOf(p).some((x) => !covered.has(x))) v *= 1.25;
    if (left === 1) v *= 1.4; // última vaga: gasta o que sobrou
    v *= m.greed * (0.75 + rnd() * 0.5);
    return Math.max(1, Math.min(this.maxBid(m), Math.round(v)));
  }

  canBid(m, amount) {
    const lot = this.auction && this.auction.lot;
    if (!lot || lot.result || this.auction.paused) return false;
    if (this.slotsLeft(m) <= 0) return false;
    if (lot.leader === m.id) return false;
    const min = lot.bid + 1;
    return amount >= min && amount <= this.maxBid(m);
  }

  bid(mid, amount, now) {
    if (this.isFranchise() && this.phase === 'auction') return this.franchiseDecide(mid, true, now);
    const m = this.mgr(mid);
    amount = Math.floor(Number(amount));
    if (!m || this.phase !== 'auction' || !Number.isFinite(amount)) return { error: 'Lance inválido.' };
    if (this.auction.lot && this.auction.lot.passed.has(m.id)) return { error: 'Você passou neste jogador e não pode mais dar lance nele.' };
    if (!this.canBid(m, amount)) {
      const lot = this.auction.lot;
      if (lot && lot.leader === m.id) return { error: 'Você já tem o maior lance.' };
      if (this.slotsLeft(m) <= 0) return { error: 'Seu elenco já está completo.' };
      if (lot && amount > this.maxBid(m)) return { error: `Seu lance máximo é US$ ${this.maxBid(m)}M (guarde US$ 1M por vaga restante).` };
      return { error: 'Alguém deu um lance maior antes. Tente de novo.' };
    }
    const lot = this.auction.lot;
    lot.bid = amount;
    lot.leader = m.id;
    lot.bids++;
    // lance com menos de 3 segundos no relógio: volta para 3 segundos
    if (lot.endsAt - now < 3000) lot.endsAt = now + 3000;
    // bots reagem com um pequeno atraso
    for (const b of this.managers) if (b.isBot) lot.botNext[b.id] = now + (m.isBot ? 450 + rnd() * 800 : 700 + rnd() * 1800);
    this.io.to(this.code).emit('bidFx', { mid: m.id, amount });
    this.touch();
    return { ok: true };
  }

  pass(mid) {
    if (this.isFranchise() && this.phase === 'auction') return this.franchiseDecide(mid, false, Date.now());
    const lot = this.auction && this.auction.lot;
    if (!lot || lot.result || lot.leader === mid) return;
    lot.passed.add(mid);
    this.touch();
  }

  togglePause(mid, now) {
    if (!this.isHost(mid) || this.phase !== 'auction') return;
    const a = this.auction;
    if (!a.lot || a.lot.result) return;
    if (!a.paused) { a.paused = true; a.pausedLeft = Math.max(0, a.lot.endsAt - now); this.sys('Leilão pausado pelo líder.'); }
    else { a.paused = false; a.lot.endsAt = now + Math.max(4000, a.pausedLeft); this.sys('Leilão retomado.'); }
    this.touch();
  }

  skipLot(mid, now) {
    if (!this.isHost(mid) || this.phase !== 'auction') return;
    const lot = this.auction.lot;
    if (!lot || lot.result) return;
    lot.endsAt = now; // fecha com o lance atual
    this.auction.paused = false;
    this.touch();
  }

  eligibleBidders(lot) {
    return this.managers.filter((m) => m.id !== lot.leader && this.slotsLeft(m) > 0 && this.maxBid(m) >= lot.bid + 1);
  }

  // ---------- posicionar o jogador comprado na quadra ----------
  benchCap() { return Math.max(0, this.settings.rosterSize - 5); }
  emptySlots(m) {
    const out = D.POS_ORDER.filter((k) => !m.lineup[k]);
    if (m.lineup.bench.length < this.benchCap()) out.push('bench');
    return out;
  }
  putIn(m, pid, slot) {
    if (slot === 'bench') m.lineup.bench.push(pid); else m.lineup[slot] = pid;
  }
  // escolha automática (bots, quem caiu e os agentes livres): a vaga onde ele rende mais
  autoPlace(m, pid) {
    const p = this.player(pid);
    const free = this.emptySlots(m);
    if (!free.length) return;
    const court = free.filter((k) => k !== 'bench');
    let best = null, bestPen = 99;
    for (const k of court) { const pen = D.posPenalty(p, k); if (pen < bestPen) { bestPen = pen; best = k; } }
    // fora de posição demais e ainda tem banco? vai para o banco (se ainda sobrar gente para a quadra)
    const left = this.slotsLeft(m); // vagas que ainda vão ser preenchidas depois deste jogador
    if ((!best || bestPen >= 16) && free.includes('bench') && left >= court.length) best = 'bench';
    this.putIn(m, pid, best || free[0]);
  }
  place(mid, slot) {
    const m = this.mgr(mid);
    if (!m || this.phase !== 'auction' || !m.pending) return { error: 'Não há jogador para posicionar.' };
    if (!this.emptySlots(m).includes(slot)) return { error: 'Essa posição já está ocupada.' };
    // garante que ainda sobra gente para completar a quadra
    const court = D.POS_ORDER.filter((k) => !m.lineup[k]).length;
    if (slot === 'bench' && this.slotsLeft(m) < court) return { error: 'Primeiro complete a quadra: as vagas restantes precisam ir para o quinteto.' };
    this.putIn(m, m.pending, slot);
    m.pending = null;
    this.touch();
    return { ok: true };
  }

  updateAuction(now) {
    const a = this.auction;
    const lot = a.lot;
    if (!lot) return;
    if (lot.result) {
      // quem caiu da sala tem o jogador posicionado automaticamente
      for (const m of this.managers) if (m.pending && !m.isBot && !m.connected) { this.autoPlace(m, m.pending); m.pending = null; this.touch(); }
      // o leilão só segue quando o técnico terminar de colocar o jogador comprado
      if (now >= lot.resultUntil && !this.managers.some((m) => m.pending)) this.nextLot(now);
      return;
    }
    if (a.paused) return;

    if (this.isFranchise()) {
      const o = this.mgr(lot.owner);
      if (o && o.isBot && now >= (lot.botNext[o.id] || 0)) return this.franchiseDecide(o.id, this.botWantsFranchise(o, lot.pid, lot.price), now);
      if (o && !o.isBot && !o.connected) return this.franchiseDecide(o.id, this.botWantsFranchise(o, lot.pid, lot.price), now);
      if (now >= lot.endsAt) this.resolveLot(now); // tempo esgotado: passa
      return;
    }

    // bots
    for (const m of this.managers) {
      if (!m.isBot || lot.passed.has(m.id) || lot.leader === m.id) continue;
      const next = lot.bid + 1;
      if (this.slotsLeft(m) <= 0 || this.maxBid(m) < next) { lot.passed.add(m.id); continue; }
      const max = lot.botMax[m.id] || 0;
      if (max < next) { lot.passed.add(m.id); this.touch(); continue; }
      if (now < lot.botNext[m.id]) continue;
      // lances em saltos para o leilão andar rápido: abre forte e sobe em degraus maiores quando há folga
      let inc = 1 + Math.floor(rnd() * Math.max(1, lot.bid * 0.25));
      if (max - lot.bid > 12) inc += Math.floor(rnd() * 4);
      if (lot.bid === 0) inc = Math.max(1, Math.round(max * (0.3 + rnd() * 0.3)));
      const amount = Math.min(max, this.maxBid(m), lot.bid + inc);
      this.bid(m.id, amount, now);
    }

    // todos passaram? fecha mais cedo
    const elig = this.eligibleBidders(lot);
    const allOut = elig.every((m) => lot.passed.has(m.id) || (!m.isBot && !m.connected));
    if (allOut && lot.endsAt - now > 1200) { lot.endsAt = now + 1200; this.touch(); }

    if (now >= lot.endsAt) this.resolveLot(now);
  }

  resolveLot(now) {
    const a = this.auction;
    const lot = a.lot;
    const p = this.player(lot.pid);
    if (lot.leader) {
      const m = this.mgr(lot.leader);
      m.budget -= lot.bid;
      m.roster.push(lot.pid);
      m.prices[lot.pid] = lot.bid;
      // (o slotsLeft já desconta este jogador)
      if (m.isBot) this.autoPlace(m, lot.pid); else m.pending = lot.pid;
      lot.result = { type: 'sold', mid: m.id, price: lot.bid };
      a.history.unshift({ pid: lot.pid, mid: m.id, price: lot.bid });
      if (a.history.length > 40) a.history.pop();
    } else {
      lot.result = { type: 'unsold' };
      a.unsold.push(lot.pid);
      a.history.unshift({ pid: lot.pid, mid: null, price: 0 });
    }
    if (process.env.D100_DEBUG) console.log('LOT', p.name, p.ovr, JSON.stringify(lot.botMax), JSON.stringify(this.auction.mv), lot.result.type, lot.bid);
    lot.resultUntil = now + RESULT_MS;
    this.touch();
  }

  // Quem não completou o elenco no leilão recebe, de graça, os PIORES jogadores disponíveis
  // em cada posição vazia: vale mais a pena arriscar no leilão do que esperar.
  finishAuction(now) {
    const a = this.auction;
    const owned = new Set(this.managers.flatMap((m) => m.roster));
    let n = 0;
    const leftovers = [];
    for (const m of this.managers) {
      if (this.slotsLeft(m) <= 0) continue;
      // de onde vêm as sobras: a lista inteira do modo (no modo franquia, as piores lendas de qualquer time,
      // senão esperar numa franquia forte como os Lakers ainda daria jogador bom)
      const base = POOLS[this.settings.pool];
      const myIds = new Set(m.roster.map((id) => D.identity(this.player(id))));
      const avail = () => base.filter((id) => !owned.has(id) && !myIds.has(D.identity(PLAYERS[id])));
      const worst = (filter) => {
        const list = avail().filter(filter).sort((x, y) => PLAYERS[x].ovr - PLAYERS[y].ovr);
        return list[0] || null;
      };
      const give = (pid, slot) => {
        owned.add(pid);
        myIds.add(D.identity(this.player(pid)));
        m.roster.push(pid);
        m.prices[pid] = 0;
        this.putIn(m, pid, slot);
        leftovers.push(`${this.player(pid).name} (${this.player(pid).ovr})`);
      };
      const filler = (pos) => {
        n++;
        const pid = 'fa' + n;
        this.extra[pid] = { id: pid, name: `Agente Livre ${n}`, pos, positions: [pos], ovr: 66 + Math.floor(rnd() * 4), tags: '', num: '', era: 'fa' };
        return pid;
      };
      // primeiro as posições vazias da quadra: o pior jogador daquela posição
      for (const k of D.POS_ORDER) {
        if (m.lineup[k]) continue;
        const pid = worst((id) => PLAYERS[id].pos === k) || worst((id) => D.positionsOf(PLAYERS[id]).includes(k)) || filler(k);
        give(pid, k);
      }
      // depois o banco: os piores que sobraram, de qualquer posição
      while (this.slotsLeft(m) > 0) {
        const pid = worst(() => true) || filler(D.POS_ORDER[n % 5]);
        give(pid, 'bench');
      }
    }
    if (leftovers.length) this.sys(`Vagas que ficaram abertas foram completadas com os piores jogadores disponíveis em cada posição: ${leftovers.slice(0, 12).join(', ')}${leftovers.length > 12 ? '…' : ''}.`);
    a.lot = null;
    this.sys('Leilão encerrado! Agora cada técnico escolhe uma carta.');
    this.phase = 'cards';
    for (const m of this.managers) {
      m.card = null;
      if (m.isBot) m.card = this.botCard(m);
    }
    this.touch();
  }

  // ---------- cartas ----------
  botCard(m) {
    const ps = m.roster.map((id) => this.player(id)).filter(Boolean);
    const shooters = ps.filter((p) => /[SM]/.test(p.tags)).length;
    const defenders = ps.filter((p) => /^[DB]/.test(p.tags)).length;
    if (shooters >= Math.ceil(ps.length / 2)) return 'mira';
    if (defenders >= 2) return 'escudo';
    return 'isotonico';
  }

  chooseCard(mid, card) {
    const m = this.mgr(mid);
    if (!m || this.phase !== 'cards' || m.card || !D.CARDS[card]) return;
    m.card = card;
    this.touch();
  }

  useCard(mid) {
    const s = this.season;
    if (!s || s.status !== 'playing') return { error: 'A carta só pode ser usada durante o seu jogo.' };
    const match = s.matches.find((x) => !x.done && x.teams.some((t) => t.mid === mid));
    if (!match) return { error: 'Seu time não está jogando agora.' };
    const ti = match.teams.findIndex((t) => t.mid === mid);
    if (!match.activateCard(ti, false)) return { error: 'Você já usou a carta neste jogo.' };
    this.touch();
    return { ok: true };
  }

  myLiveMatch(mid) {
    const s = this.season;
    if (!s || s.status !== 'playing' || s.fast) return null;
    return s.matches.find((x) => !x.done && x.teams.some((t) => t.mid === mid)) || null;
  }

  callTimeout(mid, now) {
    const match = this.myLiveMatch(mid);
    if (!match) return { error: 'O tempo só pode ser pedido durante o seu jogo.' };
    const ti = match.teams.findIndex((t) => t.mid === mid);
    if (match.challenge) return { error: 'Agora é a bola decisiva!' };
    if (match.timeouts[ti] <= 0) return { error: 'Você já pediu tempo neste jogo.' };
    match.callTimeout(ti, this.mgr(mid).name);
    match.hold = { until: now + TIMEOUT_MS, kind: 'timeout', by: ti };
    this.emitMatch(match, now);
    this.touch();
    return { ok: true };
  }

  // só para testes (DRAFT100_DEBUG): leva o meu jogo para os 30s finais empatado
  debugClutch(mid, defend) {
    const match = this.myLiveMatch(mid);
    if (!match) return { error: 'sem jogo' };
    const ti = match.teams.findIndex((t) => t.mid === mid);
    match.q = 4; match.clock = 30; match.score = [99, 99]; match.clutchQ = 0; match.ball = defend ? 1 - ti : ti; match.hold = null;
    this.touch();
    return { ok: true };
  }

  // só para testes (DRAFT100_DEBUG): termina a temporada regular do 82-0 com o meu time bem colocado
  debugSkip82(mid, now) {
    const s = this.season;
    if (!s || !s.fast || s.post || !s.standings[mid]) return { error: 'sem 82-0' };
    while (s.roundIdx < s.rounds.length - 1) this.fastRound(now);
    s.standings[mid].w += 60; s.standings[mid].l = Math.max(0, s.standings[mid].l - 60);
    this.fastRound(now);
    return { ok: true };
  }

  clutchPick(mid, pid) {
    const match = this.myLiveMatch(mid);
    if (!match || !match.challenge) return { error: 'Não há bola decisiva agora.' };
    const ti = match.teams.findIndex((t) => t.mid === mid);
    if (!match.pickChallenge(ti, pid)) return { error: 'Escolha um dos jogadores em quadra.' };
    // os dois já escolheram: resolve na hora, sem esperar o próximo passo do jogo
    const now = Date.now();
    this.updateChallenge(match, now);
    this.emitMatch(match, now);
    this.touch();
    return { ok: true };
  }

  // manda na hora o estado de um jogo (usado quando algo acontece fora do ritmo normal das posses)
  emitMatch(match, now) {
    const plays = match.pending.splice(0);
    const g = { id: match.id, s: match.score, t: match.clockStr(), q: match.q, done: match.done, plays, lead: match.leaders(), cards: match.cardState(), ...this.liveInfo(match, now) };
    this.io.to(this.code).emit('tick', { games: [g] });
  }

  // bola decisiva: bots escolhem na hora; quem não escolher a tempo fica com a escolha automática
  updateChallenge(match, now) {
    const c = match.challenge;
    if (!c.deadline) {
      c.deadline = now + CHALLENGE_MS;
      [c.o, c.d].forEach((ti) => {
        const m = this.mgr(match.teams[ti].mid);
        if (!m || m.isBot || !m.connected) match.pickChallenge(ti, ti === c.o ? match.autoShooter(c.o, c.need).id : match.autoDefender(c.d).id);
      });
      this.touch();
      if (!(c.shooter && c.defender)) return; // espera as escolhas humanas
    }
    if ((c.shooter && c.defender) || now >= c.deadline) {
      match.resolveChallenge();
      match.hold = { until: now + REVEAL_MS, kind: 'clutch' };
      this.touch();
    }
  }

  botTimeouts() {
    for (const match of this.season.matches) {
      if (match.done || match.challenge || (match.hold && match.hold.until > Date.now())) continue;
      match.teams.forEach((t, i) => {
        const m = this.mgr(t.mid);
        if (m && m.isBot && match.wantsTimeout(i)) {
          match.callTimeout(i, m.name);
          match.hold = { until: Date.now() + TIMEOUT_MS, kind: 'timeout', by: i };
          this.touch();
        }
      });
    }
  }

  liveInfo(match, now) {
    const c = match.challenge;
    return {
      heat: match.heatState(),
      to: match.timeouts,
      run: match.run.team >= 0 && match.run.pts >= 4 ? { team: match.run.team, pts: match.run.pts } : null,
      hold: match.hold && match.hold.until > now ? { kind: match.hold.kind, by: match.hold.by, ms: match.hold.until - now } : null,
      ch: c ? { o: c.o, d: c.d, need: c.need, off: c.off, def: c.def, shooter: !!c.shooter, defender: !!c.defender, ms: c.deadline ? Math.max(0, c.deadline - now) : CHALLENGE_MS } : null,
      last: match.lastChallenge ? { o: match.lastChallenge.o, shooter: match.lastChallenge.shooter, defender: match.lastChallenge.defender, made: match.lastChallenge.made, pts: match.lastChallenge.pts, type: match.lastChallenge.type, chance: match.lastChallenge.chance, need: match.lastChallenge.need } : null,
    };
  }

  // ---------- temporada ----------
  startSeason(now) {
    const ids = this.managers.map((m) => m.id);
    const fmt = this.settings.format;
    const s = {
      stage: null, rounds: [], roundIdx: 0, matches: [], status: 'prep', intervalUntil: 0,
      nextAction: null, standings: {}, stats: {}, lastStep: 0, playoff: null, results: [], label: 'Elencos definidos',
    };
    ids.forEach((id) => { s.standings[id] = { w: 0, l: 0, pf: 0, pa: 0 }; });
    for (const m of this.managers) {
      // mantém a quadra montada no leilão; só completa se faltar alguém
      const lu = m.lineup;
      if (!lu || D.POS_ORDER.some((k) => !lu[k] || !m.roster.includes(lu[k]))) m.lineup = D.autoLineup(m.roster.map((id) => this.player(id)).filter(Boolean));
      else lu.bench = m.roster.filter((id) => !D.POS_ORDER.some((k) => lu[k] === id));
      if (m.isBot) this.botPlan(m);
    }
    this.season = s;
    this.phase = 'season';
    if (fmt === 'oitenta') {
      s.stage = 'liga';
      s.fast = true;
      this.buildLeague(); // completa a liga com times de lendas até 30
      Object.keys(s.cpu).forEach((id) => { ids.push(id); s.standings[id] = { w: 0, l: 0, pf: 0, pa: 0 }; });
      s.rounds = this.schedule82(ids);
      s.feed = [];
      s.streak = {};
      s.gp82 = GAMES_82;
    } else if (fmt === 'liga' || fmt === 'ambos') {
      s.stage = 'liga';
      s.rounds = this.roundRobin(ids, this.settings.turns);
    } else {
      s.stage = 'playoffs';
      this.buildPlayoffs(shuffle(ids));
    }
    s.label = 'Ajustem os times — os jogos começam quando todos estiverem prontos';
    this.ready = new Set();
    this.touch();
  }

  roundRobin(ids, turns) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length;
    const rounds = [];
    let arr = shuffle(list);
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
    }
    if (turns === 2) {
      const back = rounds.map((rd) => rd.map(([a, b]) => [b, a]));
      return rounds.concat(back);
    }
    return rounds;
  }

  // 82-0: repete o turno até cada time ter 82 jogos (mando alternado a cada volta)
  schedule82(ids) {
    const base = this.roundRobin(ids, 1);
    const gp = Object.fromEntries(ids.map((id) => [id, 0]));
    const rounds = [];
    let idle = 0;
    for (let k = 0; k < 4000 && ids.some((id) => gp[id] < GAMES_82); k++) {
      const flip = Math.floor(k / base.length) % 2 === 1;
      const pairs = base[k % base.length]
        .filter(([a, b]) => gp[a] < GAMES_82 && gp[b] < GAMES_82)
        .map(([a, b]) => (flip ? [b, a] : [a, b]));
      if (!pairs.length) { if (++idle > base.length) break; continue; }
      idle = 0;
      pairs.forEach(([a, b]) => { gp[a]++; gp[b]++; });
      rounds.push(pairs);
    }
    return rounds;
  }

  // 82-0: uma rodada inteira simulada de uma vez (sem lance a lance)
  fastRound(now) {
    const s = this.season;
    const pairs = s.rounds[s.roundIdx];
    s.matches = pairs.map(([h, a], i) => this.makeMatch(`82-${s.roundIdx}-${i}`, h, a, true));
    s.matches.forEach((m) => m.finish());
    this.recordResults();
    for (const r of s.results) {
      const w = r.score[0] > r.score[1] ? 0 : 1;
      r.teams.forEach((mid, i) => {
        const st = s.streak[mid] || 0;
        s.streak[mid] = i === w ? (st > 0 ? st + 1 : 1) : (st < 0 ? st - 1 : -1);
      });
      // no feed só entram jogos dos times da sala (os das lendas aparecem só na tabela)
      if (r.teams.some((mid) => this.managers.some((m) => m.id === mid))) {
        s.feed.unshift({ ...r, round: s.roundIdx + 1, clutch: !!(s.matches.find((m) => m.teams[0].mid === r.teams[0] && m.teams[1].mid === r.teams[1]) || {}).lastChallenge });
      }
    }
    s.feed = s.feed.slice(0, 30);
    s.matches = [];
    s.roundIdx++;
    s.lastStep = now;
    s.label = this.label82();
    if (s.roundIdx >= s.rounds.length) return s.cpu ? this.startPost(now) : this.finishGame(now);
    this.touch();
  }

  label82() {
    const s = this.season;
    const unbeaten = this.sortedStandings().filter((r) => r.l === 0 && r.w > 0);
    if (s.roundIdx >= s.rounds.length) return 'Fim das 82 rodadas';
    if (unbeaten.length) return `82-0 — ${unbeaten.map((r) => this.mgr(r.mid).name).join(', ')} ainda invicto${unbeaten.length > 1 ? 's' : ''} (${unbeaten[0].w}-0)`;
    return '82-0 — ninguém mais está invicto. Quem termina com a melhor campanha?';
  }

  seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2;
      order = order.flatMap((s) => [s, n + 1 - s]);
    }
    return order;
  }

  buildPlayoffs(seeds) {
    const s = this.season;
    let size = 1;
    while (size < seeds.length) size *= 2;
    const order = this.seedOrder(size);
    const slots = order.map((seed) => seeds[seed - 1] || null);
    const first = [];
    for (let i = 0; i < slots.length; i += 2) first.push({ teams: [slots[i], slots[i + 1]], score: null, winner: null });
    s.playoff = { seeds: seeds.slice(), rounds: [first], cur: 0 };
    s.stage = 'playoffs';
  }

  playoffLabel(teamsLeft) {
    if (teamsLeft <= 2) return 'Final';
    if (teamsLeft <= 4) return 'Semifinal';
    if (teamsLeft <= 8) return 'Quartas de final';
    return 'Oitavas de final';
  }

  startRound(now) {
    const s = this.season;
    let pairs, label;
    if (s.stage === 'liga') {
      pairs = s.rounds[s.roundIdx];
      label = `Temporada regular — Rodada ${s.roundIdx + 1} de ${s.rounds.length}`;
    } else {
      const pr = s.playoff.rounds[s.playoff.cur];
      // byes avançam direto
      pr.forEach((g) => {
        if (!g.teams[0] || !g.teams[1]) g.winner = g.teams[0] || g.teams[1];
      });
      pairs = pr.filter((g) => g.teams[0] && g.teams[1]).map((g) => g.teams);
      label = `Playoffs — ${this.playoffLabel(pr.length * 2)}`;
    }
    s.label = label;
    s.matches = pairs.map(([h, a], i) => this.makeMatch(`${s.stage}-${s.stage === 'liga' ? s.roundIdx : s.playoff.cur}-${i}`, h, a, false));
    s.status = 'playing';
    s.lastStep = now;
    if (s.matches.length === 0) return this.endRound(now);
    this.touch();
  }

  makeMatch(id, h, a, auto) {
    const mh = this.mgr(h), ma = this.mgr(a);
    return new Match(id,
      [{ mid: h, roster: mh.roster, tactics: mh.tactics, lineup: mh.lineup, arena: this.arenaOf(mh), card: mh.card },
       { mid: a, roster: ma.roster, tactics: ma.tactics, lineup: ma.lineup, arena: this.arenaOf(ma), card: ma.card }], this.extraAll || this.extra, { auto });
  }

  setTactics(mid, t) {
    const m = this.mgr(mid);
    if (!m || !t) return;
    for (const k of Object.keys(TACTICS)) if (TACTICS[k].includes(t[k])) m.tactics[k] = t[k];
    this.touch();
  }

  arenaOf(m) { return D.ARENAS.find((a) => a.id === m.arena) || null; }

  setLineup(mid, lu) {
    const m = this.mgr(mid);
    if (!m || !m.lineup || !lu || this.phase !== 'season') return { error: 'Escalação indisponível agora.' };
    const ids = D.POS_ORDER.map((k) => lu[k]);
    if (ids.some((id) => !m.roster.includes(id)) || new Set(ids).size !== 5) return { error: 'Escalação inválida.' };
    const bench = m.roster.filter((id) => !ids.includes(id))
      .sort((a, b) => this.player(b).ovr - this.player(a).ovr);
    // altera o objeto existente: a partida em andamento enxerga a mudança na próxima posse
    D.POS_ORDER.forEach((k, i) => { m.lineup[k] = ids[i]; });
    m.lineup.bench = bench;
    this.touch();
    return { ok: true };
  }

  autoLineup(mid) {
    const m = this.mgr(mid);
    if (!m || !m.lineup) return;
    const lu = D.autoLineup(m.roster.map((id) => this.player(id)).filter(Boolean));
    Object.assign(m.lineup, lu);
    this.touch();
  }

  // bots escolhem o esquema e a defesa que mais encaixam no elenco
  botPlan(m) {
    const starters = D.POS_ORDER.map((k) => this.player(m.lineup[k])).filter(Boolean);
    let best = 'equilibrado', bf = 0;
    for (const k of Object.keys(D.SCHEMES)) {
      const f = D.schemeFit(D.SCHEMES[k], starters).fit;
      if (f > bf + 0.05) { bf = f; best = k; }
    }
    m.style = best;
    m.tactics.esquema = best;
    const z = D.schemeFit(D.DEF_SCHEMES.zona, starters).fit, pr = D.schemeFit(D.DEF_SCHEMES.pressao, starters).fit;
    m.defStyle = z >= 0.6 && z >= pr ? 'zona' : pr >= 0.6 ? 'pressao' : 'individual';
    m.tactics.defesa = m.defStyle;
  }

  botTactics() {
    const s = this.season;
    for (const match of s.matches) {
      if (match.done) continue;
      match.teams.forEach((t, i) => {
        const m = this.mgr(t.mid);
        if (!m || !m.isBot) return;
        const diff = match.score[i] - match.score[1 - i];
        const tac = m.tactics;
        tac.esquema = m.style || 'equilibrado';
        tac.defesa = m.defStyle || 'individual';
        if (match.q >= 4 && diff < -8) { tac.ritmo = 'rapido'; tac.defesa = 'pressao'; }
        else if (match.q >= 4 && diff > 10) { tac.ritmo = 'lento'; }
        else tac.ritmo = 'normal';
      });
    }
  }

  // bots usam a carta no 4º quarto quando o jogo está apertado (senão ela ativa sozinha no fim)
  botCards() {
    for (const match of this.season.matches) {
      if (match.done || match.q < 4) continue;
      match.teams.forEach((t, i) => {
        const m = this.mgr(t.mid);
        if (!m || !m.isBot) return;
        const diff = match.score[i] - match.score[1 - i];
        if (match.clock <= 420 && Math.abs(diff) <= 8) match.activateCard(i, false);
      });
    }
  }

  updateSeason(now) {
    const s = this.season;
    if (s.status === 'prep') {
      if (this.allReady()) { this.sys('Todos prontos! Bola ao alto.'); this.advance(now); }
      return;
    }
    if (s.status === 'interval') {
      if (now >= s.intervalUntil) this.advance(now);
      return;
    }
    if (s.status !== 'playing') return;
    if (s.fast && !s.post) {
      if (!s.paused && now - s.lastStep >= FAST_MS[this.settings.speed]) this.fastRound(now);
      return;
    }
    const stepMs = SPEED_MS[this.settings.speed];
    if (now - s.lastStep < stepMs) return;
    s.lastStep = now;
    this.botTactics();
    this.botCards();
    this.botTimeouts();
    const games = [];
    for (const match of s.matches) {
      if (match.done) continue;
      let plays = [];
      if (match.challenge) this.updateChallenge(match, now);                        // esperando as escolhas
      else if (!(match.hold && match.hold.until > now)) { match.hold = null; plays = match.step(); } // tempo pedido: jogo parado
      if (match.challenge && !match.challenge.deadline) this.updateChallenge(match, now); // acabou de começar a bola decisiva
      plays = plays.concat(match.pending.splice(0));
      games.push({ id: match.id, s: match.score, t: match.clockStr(), q: match.q, done: match.done, plays, lead: match.leaders(), cards: match.cardState(), ...this.liveInfo(match, now) });
    }
    if (games.length) this.io.to(this.code).emit('tick', { games });
    // espera o resultado da bola decisiva ficar um pouco na tela antes de fechar a rodada
    if (s.matches.every((m) => m.done) && !s.matches.some((m) => m.hold && m.hold.until > now)) this.endRound(now);
  }

  skipRound(mid, now) {
    if (!this.isHost(mid) || this.phase !== 'season') return;
    const s = this.season;
    if (s.fast && !s.post) { if (s.status === 'playing') s.paused = !s.paused; this.touch(); return; }
    if (s.status === 'playing') {
      s.matches.forEach((m) => m.finish());
      this.endRound(now);
    } else if (s.status === 'interval') {
      s.intervalUntil = now;
    }
    // em 'prep' não pula: os jogos só começam com todos prontos
  }

  endRound(now) {
    const s = this.season;
    if (s.post) return this.endPostDay(now);
    this.recordResults();
    s.status = 'interval';
    s.intervalUntil = now + INTERVAL_MS;
    this.touch();
  }

  recordResults() {
    const s = this.season;
    const results = s.matches.map((m) => this.tallyMatch(m));
    s.results = results;
    s.lastBoxes = s.matches.map((m) => ({ id: m.id, box: m.box, q: m.qScores }));
  }

  // estatísticas, campanha e tabela de uma partida terminada
  tallyMatch(match) {
    const s = this.season;
    const [h, a] = match.teams.map((t) => t.mid);
    const [sh, sa] = match.score;
    for (const [pid, b] of Object.entries(match.box)) {
      const st = s.stats[pid] || (s.stats[pid] = { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, mid: match.teams[b.tm].mid });
      st.gp++; st.pts += b.pts; st.reb += b.reb; st.ast += b.ast; st.stl += b.stl; st.blk += b.blk;
    }
    // campanha completa (temporada + playoffs) para o histórico
    s.record = s.record || {};
    const rh = s.record[h] || (s.record[h] = { w: 0, l: 0, pf: 0, pa: 0 });
    const ra = s.record[a] || (s.record[a] = { w: 0, l: 0, pf: 0, pa: 0 });
    rh.pf += sh; rh.pa += sa; ra.pf += sa; ra.pa += sh;
    if (sh > sa) { rh.w++; ra.l++; } else { ra.w++; rh.l++; }
    if (s.stage === 'liga') {
      const A = s.standings[h], B = s.standings[a];
      A.pf += sh; A.pa += sa; B.pf += sa; B.pa += sh;
      if (sh > sa) { A.w++; B.l++; } else { B.w++; A.l++; }
    } else if (s.playoff && !s.post) {
      const g = s.playoff.rounds[s.playoff.cur].find((x) => x.teams[0] === h && x.teams[1] === a);
      if (g) { g.score = [sh, sa]; g.winner = sh > sa ? h : a; }
    }
    return { teams: [h, a], score: [sh, sa], ot: match.q > 4 ? match.q - 4 : 0, lead: match.leaders(), stage: s.stage };
  }

  sortedStandings() {
    const s = this.season;
    return Object.entries(s.standings)
      .map(([mid, r]) => ({ mid, ...r }))
      .sort((a, b) => (b.w - a.w) || ((b.pf - b.pa) - (a.pf - a.pa)) || (b.pf - a.pf));
  }

  advance(now) {
    const s = this.season;
    // primeira rodada ainda não começou
    if (s.post) return this.postDay(now);
    if (!s.started) {
      s.started = true;
      if (s.fast) { s.status = 'playing'; s.lastStep = 0; s.label = this.label82(); this.touch(); return; }
      s.status = 'interval';
      return this.startRound(now);
    }
    if (s.stage === 'liga') {
      s.roundIdx++;
      if (s.roundIdx < s.rounds.length) return this.startRound(now);
      if (this.settings.format === 'ambos') {
        const n = this.managers.length;
        const k = n <= 3 ? 2 : n <= 8 ? 4 : 8;
        const seeds = this.sortedStandings().slice(0, k).map((r) => r.mid);
        this.buildPlayoffs(seeds);
        s.matches = [];
        s.results = [];
        s.status = 'interval';
        s.intervalUntil = now + INTERVAL_MS;
        s.label = `Fim da temporada regular! Os ${k} melhores vão aos playoffs`;
        s.playoffAnnounced = true;
        this.touch();
        return;
      }
      return this.finishGame(now);
    }
    // playoffs
    const po = s.playoff;
    const cur = po.rounds[po.cur];
    if (s.playoffAnnounced) { s.playoffAnnounced = false; return this.startRound(now); }
    const winners = cur.map((g) => g.winner);
    if (winners.length === 1) return this.finishGame(now);
    const next = [];
    for (let i = 0; i < winners.length; i += 2) next.push({ teams: [winners[i], winners[i + 1]], score: null, winner: null });
    po.rounds.push(next);
    po.cur++;
    this.startRound(now);
  }

  finishGame(now) {
    const s = this.season;
    let champion;
    if (s.post && s.post.champion) champion = s.post.champion;
    else if (s.playoff && s.playoff.rounds.length) {
      const last = s.playoff.rounds[s.playoff.rounds.length - 1];
      champion = last[0].winner;
    }
    if (!champion) champion = this.sortedStandings()[0].mid;

    // prêmios
    const statsArr = Object.entries(s.stats).map(([pid, st]) => ({ pid, ...st }));
    const winPct = (mid) => { const r = s.standings[mid]; return r && r.w + r.l ? r.w / (r.w + r.l) : 0.5; };
    const score = (st) => (st.pts + 1.2 * st.reb + 1.5 * st.ast) / st.gp + winPct(st.mid) * 8;
    statsArr.sort((a, b) => score(b) - score(a));
    const mvp = statsArr[0] || null;
    let bargain = null, priciest = null;
    for (const m of this.managers) {
      for (const pid of m.roster) {
        const price = m.prices[pid] || 0;
        const st = s.stats[pid];
        if (!st || !st.gp) continue;
        const prod = (st.pts + st.reb + st.ast) / st.gp;
        const val = prod / Math.max(1, price);
        if (price > 0 && (!bargain || val > bargain.val)) bargain = { pid, mid: m.id, price, val, ppg: st.pts / st.gp };
        if (!priciest || price > priciest.price) priciest = { pid, mid: m.id, price, ppg: st.pts / st.gp };
      }
    }
    this.end = { champion, mvp: mvp && { pid: mvp.pid, mid: mvp.mid, ppg: mvp.pts / mvp.gp, rpg: mvp.reb / mvp.gp, apg: mvp.ast / mvp.gp }, bargain, priciest };
    if (s.fast) {
      const r = s.standings[champion];
      const rec = (s.record || {})[champion] || r;
      this.end.record = { w: r.w, l: r.l };
      this.end.full = { w: rec.w, l: rec.l };
      // 82-0 é a temporada regular invicta (de quem for); campeão invicto também nos playoffs = 16-0
      const unbeaten = this.sortedStandings().filter((x) => x.l === 0 && x.w >= GAMES_82).map((x) => x.mid);
      this.end.perfect = unbeaten.includes(champion);
      this.end.unbeaten = unbeaten;
    }
    this.phase = 'end';
    const cm = this.mgr(champion);
    const team = TEAMS.find((t) => t.id === cm.team);
    if (s.post) this.sys(`🏆 Finais da NBA: ${cm.name} é o campeão!`);
    this.sys(this.end.perfect ? `🏆 ${cm.name} fez 82-0! TEMPORADA PERFEITA com o ${team.city} ${team.name}!` : `🏆 ${cm.name} (${team.city} ${team.name}) é o CAMPEÃO!${this.end.record ? ` Campanha ${this.end.record.w}-${this.end.record.l}.` : ''}`);
    this.saveHistory(champion);
    this.touch();
  }

  // grava a partida no histórico do computador que está rodando o servidor
  saveHistory(champion) {
    try {
      const s = this.season;
      const rankIdx = Object.fromEntries(this.sortedStandings().map((r, i) => [r.mid, i]));
      // até que rodada dos playoffs cada um chegou
      let reach = {};
      let finalist = null;
      if (s.post) {
        reach = this.postReach();
        const fin = s.post.series.find((x) => x.round === 3);
        if (fin) finalist = fin.winner === fin.hi ? fin.lo : fin.hi;
      } else if (s.playoff) {
        s.playoff.rounds.forEach((rd, ri) => rd.forEach((g) => g.teams.forEach((t) => { if (t) reach[t] = ri; })));
        const last = s.playoff.rounds[s.playoff.rounds.length - 1][0];
        finalist = last.teams.find((t) => t && t !== champion) || null;
      }
      const order = this.managers.map((m) => m.id).sort((a, b) => {
        if (a === champion) return -1;
        if (b === champion) return 1;
        if (a === finalist) return -1;
        if (b === finalist) return 1;
        return ((reach[b] ?? -1) - (reach[a] ?? -1)) || ((rankIdx[a] ?? 99) - (rankIdx[b] ?? 99));
      });
      const mvp = this.end && this.end.mvp;
      history.recordGame({
        date: new Date().toISOString(),
        mode: this.settings.pool,
        format: this.settings.format,
        champion: { name: this.mgr(champion).name, team: this.mgr(champion).team },
        mvp: mvp ? { name: this.mgr(mvp.mid) ? this.mgr(mvp.mid).name : '', player: this.player(mvp.pid).name } : null,
        // jogadores escolhidos no leilão (versão exata) e o que fizeram na temporada, para o ranking de jogadores
        atletas: this.managers.flatMap((m) => m.roster.filter((pid) => PLAYERS[pid]).map((pid) => {
          const st = s.stats[pid] || { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
          return {
            id: pid, name: PLAYERS[pid].name, ident: D.identity(PLAYERS[pid]), year: PLAYERS[pid].year || null, team: PLAYERS[pid].team || null,
            price: m.prices[pid] || 0, by: m.name, byBot: !!m.isBot, gp: st.gp, pts: st.pts, reb: st.reb, ast: st.ast, stl: st.stl || 0, blk: st.blk || 0,
            champion: m.id === champion, mvp: !!(mvp && mvp.pid === pid),
          };
        })),
        managers: order.map((mid, i) => {
          const m = this.mgr(mid);
          const r = (s.record || {})[mid] || { w: 0, l: 0, pf: 0, pa: 0 };
          return {
            name: m.name, team: m.team, isBot: m.isBot, place: i + 1, ...r,
            champion: mid === champion, finalist: mid === finalist, mvp: !!(mvp && mvp.mid === mid),
          };
        }),
      });
    } catch (e) { console.error('Erro ao gravar histórico:', e); }
  }

  restart(mid) {
    if (!this.isHost(mid) || this.phase !== 'end') return;
    this.phase = 'lobby';
    this.auction = null;
    this.season = null;
    this.end = null;
    for (const m of this.managers) { m.budget = this.baseBudget(); m.roster = []; m.prices = {}; m.tactics = defaultTactics(); m.lineup = null; m.arena = null; m.card = null; m.pending = null; }
    this.ready = new Set();
    this.touch();
  }

  // ---------- loop ----------
  update(now) {
    if (this.phase === 'lobby') this.cleanupLobby(now);
    else if (this.phase === 'teampick') this.updateTeamPick(now);
    else if (this.phase === 'arenas') { if (this.allReady()) this.beginDraw(now); }
    else if (this.phase === 'draw') this.updateDraw(now);
    else if (this.phase === 'cards') {
      if (this.present().every((m) => m.card)) {
        for (const m of this.managers) if (!m.card) m.card = this.botCard(m); // quem caiu recebe uma carta automática
        this.sys('Cartas escolhidas! Ajustem os times e cliquem em Pronto.');
        this.startSeason(now);
      }
    }
    else if (this.phase === 'auction') this.updateAuction(now);
    else if (this.phase === 'season') this.updateSeason(now);
  }

  // ---------- estado para os clientes ----------
  serialize(now) {
    const st = {
      code: this.code, phase: this.phase, hostId: this.hostId, settings: this.settings,
      managers: this.managers.map((m) => ({
        id: m.id, name: m.name, team: m.team, isBot: m.isBot, connected: m.connected,
        budget: m.budget, roster: m.roster, prices: m.prices, tactics: m.tactics, lineup: m.lineup, arena: m.arena, pending: m.pending || null,
        card: this.phase === 'cards' ? (m.card ? 'escolhida' : null) : m.card,
      })),
      ready: [...this.ready],
      budget: this.baseBudget(),
      extra: this.extra,
    };
    if (this.phase === 'teampick' && this.teamPick) {
      const tp = this.teamPick;
      st.teamPick = { order: tp.order, idx: tp.idx, done: !!tp.done, waitMs: Math.max(0, tp.turnStart - now), leftMs: Math.max(0, tp.endsAt - now), total: PICK_MS };
    }
    if (this.phase === 'draw') {
      st.draw = { elapsed: now - this.draw.start, per: this.draw.per, left: Math.max(0, this.draw.until - now) };
    }
    if (this.auction) {
      const a = this.auction, lot = a.lot;
      st.auction = {
        lotNo: a.lotNo, total: a.total, left: a.queue.length, paused: a.paused, history: a.history.slice(0, 25),
        lot: lot && {
          pid: lot.pid, bid: lot.bid, leader: lot.leader, bids: lot.bids,
          remainingMs: a.paused ? a.pausedLeft : Math.max(0, lot.endsAt - now),
          passed: [...lot.passed], result: lot.result, owner: lot.owner, price: lot.price, basePrice: lot.basePrice, discount: lot.discount,
        },
      };
    }
    if (this.season) {
      const s = this.season;
      st.season = {
        stage: s.stage, status: s.status, label: s.label,
        intervalMs: s.status === 'interval' ? Math.max(0, s.intervalUntil - now) : 0,
        round: s.roundIdx, totalRounds: s.rounds.length,
        standings: this.sortedStandings(),
        matches: s.matches.map((m) => ({
          id: m.id, teams: m.teams.map((t) => t.mid), s: m.score, t: m.clockStr(), q: m.q, done: m.done,
          plays: m.plays.slice(-40), lead: m.leaders(), cards: m.cardState(), lineups: [m.starterIds(0), m.starterIds(1)],
          ...this.liveInfo(m, now),
        })),
        fast: !!s.fast, paused: !!s.paused, feed: s.feed || null, streak: s.streak || null, gp82: s.gp82 || null,
        cpu: s.cpu ? Object.fromEntries(Object.values(s.cpu).map((c) => [c.id, { id: c.id, name: c.name, team: c.team, cpu: true, isBot: true, roster: c.roster, lineup: c.lineup }])) : null,
        post: s.post ? this.postSerialize() : null,
        results: s.results,
        boxes: s.status === 'interval' ? s.lastBoxes : null,
        playoff: s.playoff && { rounds: s.playoff.rounds, cur: s.playoff.cur, seeds: s.playoff.seeds },
        leaders: Object.entries(s.stats).map(([pid, x]) => ({ pid, ...x }))
          .sort((a, b) => b.pts / b.gp - a.pts / a.gp).slice(0, 12),
      };
    }
    if (this.end) st.end = this.end;
    return st;
  }

  broadcast(now) {
    if (!this.dirty) return;
    this.dirty = false;
    this.io.to(this.code).emit('state', this.serialize(now));
  }
}

module.exports = { Room, VALID };

league82.install(Room);
