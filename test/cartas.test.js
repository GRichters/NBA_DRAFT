// Cartas de reforço (leilão antes dos jogadores), tetos dos atributos (98 / MVP das Finais 99 / MVP 100)
// e a pausa do líder nos playoffs do 82-0.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { useFakeClock, fakeIo, fakeSocket } = require('./helpers');
const { Room } = require('../src/room');
const D = require('../public/data.js');

const STEP_MS = 100;

function runUntil(room, clock, pred, maxMs = 6 * 60 * 60 * 1000) {
  const t0 = clock.now();
  while (!pred()) {
    const now = clock.advance(STEP_MS);
    room.update(now);
    room.broadcast(now);
    if (now - t0 > maxMs) assert.fail(`não chegou lá (fase "${room.phase}")`);
  }
}

test('atributos: ninguém passa de 98; atributo principal do MVP é 100 e do MVP das Finais é 99', () => {
  let mvps = 0, fmvps = 0;
  for (const p of Object.values(D.PLAYERS)) {
    const a = D.attrs(p);
    const main = D.mainAttr(p, a);
    for (const [k, v] of Object.entries(a)) {
      if ((p.mvp || p.fmvp) && k === main) continue;
      assert.ok(v <= 98, `${p.name}: ${k} = ${v}`);
    }
    if (p.mvp) { mvps++; assert.equal(a[D.mainAttr(p, a)], 100, `${p.name} (MVP)`); }
    else if (p.fmvp) { fmvps++; assert.equal(a[D.mainAttr(p, a)], 99, `${p.name} (MVP das Finais)`); }
  }
  assert.ok(mvps > 50 && fmvps > 30, `MVPs ${mvps}, MVPs das Finais (que não foram MVP no ano) ${fmvps}`);
  // jogando fora de posição o MVP perde a penalidade
  const jordan = Object.values(D.PLAYERS).find((p) => p.name === "Michael Jordan '96");
  assert.ok(jordan.mvp && jordan.fmvp);
  const a8 = D.attrs(jordan, 8);
  assert.ok(a8[D.mainAttr(jordan, a8)] < 98, 'fora de posição o 100 não vale');
});

test('todos os MVPs e MVPs das Finais (desde 1956/1969) têm a versão do ano', () => {
  const all = Object.values(D.PLAYERS);
  for (const [map, flag] of [[D.MVPS, 'mvp'], [D.FMVPS, 'fmvp']]) {
    for (const [year, name] of Object.entries(map)) {
      assert.ok(all.some((p) => p.base === name && p.year === Number(year) && p[flag]), `${flag} ${year} ${name}`);
    }
  }
});

test('cartas de reforço mudam o jogador do jeito descrito', () => {
  const pg = Object.values(D.PLAYERS).find((p) => p.positions.length === 1 && p.pos === 'PG' && p.ovr < 90);
  // Versatilidade: PG puro vira PG/SG e joga de SG sem penalidade
  assert.equal(D.posPenalty(pg, 'SG'), 8);
  const v = D.applyBoost(pg, 'versatil', 'SG');
  assert.deepEqual(v.positions, ['PG', 'SG']);
  assert.equal(D.posPenalty(v, 'SG'), 0);
  assert.deepEqual(D.attrs(v), D.attrs(pg), 'trocar de posição não muda o rendimento');
  assert.equal(D.applyBoost(pg, 'versatil', 'C'), null, 'só posição vizinha');
  // Evolução: +3 de overall
  assert.equal(D.applyBoost(pg, 'evolucao').ovr, pg.ovr + 3);
  // Treino de fundamentos: os 2 atributos mais baixos sobem 10
  const low = D.lowestCardAttrs(pg);
  const f = D.applyBoost(pg, 'fundamentos');
  const a0 = D.cardAttrs(pg), a1 = D.cardAttrs(f);
  // (acima de 92 o ganho é menor: o atributo cresce mais devagar até o teto de 98)
  for (const k of Object.keys(a0)) {
    const d = a1[k] - a0[k];
    if (low.includes(k)) assert.ok(d > 0 && d <= 10 && (a0[k] + 10 > 92 || d === 10), `${k}: ${a0[k]} → ${a1[k]}`);
    else assert.equal(d, 0, k);
  }
  // Nova característica
  const t = D.boostTraits(pg)[0];
  assert.ok(D.applyBoost(pg, 'dna', t).tags.includes(t));
  // Especialista: atributo principal sobe, sem passar de 98
  const e = D.applyBoost(pg, 'especialista');
  const k = D.mainAttr(pg, D.attrs(pg));
  assert.ok(D.attrs(e)[k] > D.attrs(pg)[k] && D.attrs(e)[k] <= 98);
});

test('leilão de cartas antes dos jogadores: no máximo uma por técnico, o dinheiro sai do caixa e a carta vale no jogo', () => {
  const clock = useFakeClock();
  try {
    const room = new Room('CARTA', fakeIo());
    const sock = fakeSocket();
    const { id } = room.join(sock, 'Ana', 'tok-ana');
    room.setSettings(id, { pool: 'atual', format: 'playoffs', speed: 'rapido' });
    for (let i = 0; i < 3; i++) room.addBot(id);
    room.start(id);
    room.setReady(id, true);
    runUntil(room, clock, () => room.phase === 'auction');
    assert.equal(room.auction.lot.kind, 'boost', 'o primeiro lote é uma carta');
    assert.equal(room.auction.boostTotal, 3, '4 técnicos → 3 cartas');
    // Ana compra a primeira carta (os bots ficam de fora deste lote)
    room.auction.lot.botMax = {};
    const r = room.bid(id, 7, clock.now());
    assert.ok(r.ok, r.error);
    const ana = room.mgr(id);
    runUntil(room, clock, () => !!ana.boost);
    assert.equal(ana.boost.price, 7);
    const paid = ana.boost.price;
    assert.equal(ana.budget, 100 - paid);
    // com carta, não dá lance em outra
    runUntil(room, clock, () => room.auction.lot && (room.auction.lot.kind !== 'boost' || !room.auction.lot.result));
    if (room.auction.lot.kind === 'boost') assert.ok(room.bid(id, room.auction.lot.bid + 1, clock.now()).error);
    runUntil(room, clock, () => room.phase === 'cards');
    const owners = room.managers.filter((m) => m.boost);
    assert.ok(owners.length <= 3);
    assert.ok(room.managers.every((m) => m.budget >= 0));
    // bots já aplicaram; Ana escolhe o jogador
    for (const m of owners) if (m.isBot) assert.ok(m.boost.pid, `${m.name} não aplicou a carta`);
    const pid = ana.roster[0];
    const p0 = room.player(pid);
    const choice = ana.boost.type === 'versatil' ? D.boostPositions(p0)[0] : ana.boost.type === 'dna' ? D.boostTraits(p0)[0] : null;
    assert.ok(room.applyBoost(id, 'nao-e-meu', choice).error);
    const ok = room.applyBoost(id, pid, choice);
    assert.ok(ok.ok, ok.error);
    assert.ok(room.applyBoost(id, ana.roster[1], choice).error, 'só um jogador');
    assert.equal(room.player(pid).boost.type, ana.boost.type);
    room.chooseCard(id, 'mira');
    runUntil(room, clock, () => room.phase === 'season');
    // a partida enxerga a versão reforçada
    room.setReady(id, true);
    runUntil(room, clock, () => room.season.matches.some((m) => m.teams.some((t) => t.mid === id)));
    const match = room.season.matches.find((m) => m.teams.some((t) => t.mid === id));
    const ti = match.teams.findIndex((t) => t.mid === id);
    const info = match.lineupInfo(ti);
    const all = info.starters.concat(info.bench);
    assert.ok(all.some((x) => x.id === pid && x.boost), 'a partida não usou o jogador com a carta');
    const st = room.serialize(clock.now());
    assert.ok(st.boosted[pid]);
  } finally { clock.restore(); }
});

test('o líder consegue pausar os playoffs do 82-0', () => {
  const clock = useFakeClock();
  try {
    const room = new Room('PAUSA', fakeIo());
    const sock = fakeSocket();
    const { id } = room.join(sock, 'Líder', 'tok-lider');
    room.setSettings(id, { pool: 'atual', format: 'oitenta', speed: 'rapido' });
    room.addBot(id);
    room.start(id);
    room.disconnect(sock.id); // deixa os bots jogarem até os playoffs
    runUntil(room, clock, () => room.phase === 'season' && room.season.post && room.season.post.phase === 'playoffs');
    room.join(fakeSocket(), 'Líder', 'tok-lider');
    const s = room.season;
    room.togglePauseSeason(id, clock.now());
    assert.equal(s.paused, true);
    const before = JSON.stringify([s.post.day, s.status, s.post.series.map((x) => x.w), s.matches.map((m) => m.score)]);
    for (let i = 0; i < 600; i++) { const now = clock.advance(STEP_MS); room.update(now); } // 1 minuto pausado
    assert.equal(JSON.stringify([s.post.day, s.status, s.post.series.map((x) => x.w), s.matches.map((m) => m.score)]), before, 'andou pausado');
    assert.equal(room.serialize(clock.now()).season.paused, true);
    room.togglePauseSeason(id, clock.now());
    assert.equal(s.paused, false);
    runUntil(room, clock, () => room.phase === 'end');
  } finally { clock.restore(); }
});

test('82-0: pedido de tempo e carta funcionam nos jogos ao vivo do play-in/playoffs', () => {
  const clock = useFakeClock();
  try {
    const room = new Room('TEMPO', fakeIo());
    const sock = fakeSocket();
    const { id } = room.join(sock, 'Chiquinho', 'tok-c');
    room.setSettings(id, { pool: 'atual', format: 'oitenta', speed: 'rapido' });
    room.addBot(id);
    room.start(id);
    room.disconnect(sock.id); // os bots fazem leilão e cartas por ele
    runUntil(room, clock, () => room.phase === 'season' && room.season.started);
    room.join(fakeSocket(), 'Chiquinho', 'tok-c');
    // temporada regular é simulada: não tem pedido de tempo
    assert.ok(room.callTimeout(id, clock.now()).error);
    room.debugSkip82(id, clock.now()); // termina a temporada com o time dele bem colocado
    runUntil(room, clock, () => !!room.myLiveMatch(id) && room.myLiveMatch(id).q === 1);
    const match = room.myLiveMatch(id);
    const ti = match.teams.findIndex((t) => t.mid === id);
    const r = room.callTimeout(id, clock.now());
    assert.ok(r.ok, r.error);
    assert.equal(match.timeouts[ti], 0);
    assert.equal(match.hold.kind, 'timeout');
    assert.ok(room.callTimeout(id, clock.now()).error, 'só um por jogo');
    // a carta também pode ser ativada na mão
    runUntil(room, clock, () => !match.hold || match.hold.until <= clock.now());
    const c = room.useCard(id);
    assert.ok(c.ok, c.error);
  } finally { clock.restore(); }
});

test('durante o leilão dá para trocar os jogadores de lugar na quadra', () => {
  const room = new Room('MOVE', fakeIo());
  const { id } = room.join(fakeSocket(), 'Ana', 'tok-ana');
  room.setSettings(id, { pool: 'atual', rosterSize: 8 });
  room.addBot(id);
  room.start(id);
  room.phase = 'auction'; // (pula arenas e sorteio)
  const m = room.mgr(id);
  const [a, b, c] = ['a0', 'a1', 'a2'];
  m.roster = [a, b, c];
  Object.assign(m.lineup, { PG: a, SG: b, SF: null, PF: null, C: null, bench: [c] });
  // troca PG ↔ SG
  assert.ok(room.moveLineup(id, 'PG', 'SG').ok);
  assert.equal(m.lineup.PG, b); assert.equal(m.lineup.SG, a);
  // banco → posição vazia
  assert.ok(room.moveLineup(id, 'b0', 'C').ok);
  assert.equal(m.lineup.C, c); assert.deepEqual(m.lineup.bench, []);
  // quadra → banco vazio (ainda faltam 5 compras para 3 buracos: pode)
  assert.ok(room.moveLineup(id, 'C', 'bench').ok);
  assert.deepEqual(m.lineup.bench, [c]); assert.equal(m.lineup.C, null);
  // não pode deixar mais buracos na quadra do que vagas para comprar
  m.roster = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  Object.assign(m.lineup, { PG: 'a0', SG: 'a1', SF: 'a3', PF: 'a4', C: null, bench: ['a2', 'a5'] });
  // falta 1 compra e já há 1 buraco (C): tirar o PG deixaria 2 buracos
  assert.ok(room.moveLineup(id, 'PG', 'bench').error);
  assert.ok(room.moveLineup(id, 'b0', 'C').ok, 'mas pode tapar o buraco com quem está no banco');
  // com jogador para posicionar, primeiro posiciona
  m.pending = 'a7';
  assert.ok(room.moveLineup(id, 'SG', 'PG').error);
  m.pending = null;
  room.phase = 'season';
  assert.ok(room.moveLineup(id, 'SG', 'PG').error, 'na temporada é pela Prancheta');
});
