// Joga partidas inteiras (do lobby ao campeão) só com bots, em todos os formatos e listas.
// Se alguma mudança de regra travar o jogo ou quebrar o fim da partida, estes testes acusam.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, useFakeClock, fakeIo, fakeSocket } = require('./helpers');
const { Room } = require('../src/room');

const STEP_MS = 100;
const MAX_SIM_MS = 6 * 60 * 60 * 1000; // 6 h de jogo simulado: muito acima de qualquer partida real

// cria uma sala, o "líder" humano escolhe as regras, completa com bots, começa e sai:
// a partir daí os bots jogam por todo mundo (quem caiu não trava o jogo)
function playFullGame(settings, bots = 3) {
  const clock = useFakeClock();
  try {
    const io = fakeIo();
    const room = new Room('TESTE', io);
    const sock = fakeSocket();
    const { id } = room.join(sock, 'Líder', 'token-lider');
    room.setSettings(id, settings);
    for (let i = 0; i < bots; i++) room.addBot(id);
    const res = room.start(id, clock.now());
    assert.ok(!res || !res.error, `start falhou: ${res && res.error}`);
    room.disconnect(sock.id);

    const phases = [room.phase];
    const t0 = clock.now();
    while (room.phase !== 'end') {
      const now = clock.advance(STEP_MS);
      room.update(now);
      room.broadcast(now);
      if (phases[phases.length - 1] !== room.phase) phases.push(room.phase);
      if (now - t0 > MAX_SIM_MS) assert.fail(`a partida não terminou (parou na fase "${room.phase}"; fases: ${phases.join(' → ')})`);
    }
    room.serialize(clock.now()); // o estado final precisa ser serializável para os navegadores
    return { room, phases, io };
  } finally {
    clock.restore();
  }
}

const CASES = [
  { pool: 'atual', format: 'ambos', speed: 'rapido' },
  { pool: 'lendas', format: 'liga', speed: 'rapido', turns: 2 },
  { pool: 'mix', format: 'playoffs', speed: 'rapido', rosterSize: 8 },
  { pool: 'franquia', format: 'ambos', speed: 'rapido' },
  { pool: 'atual', format: 'oitenta', speed: 'rapido' },
];

for (const settings of CASES) {
  test(`partida completa: ${JSON.stringify(settings)}`, () => {
    const { room, phases, io } = playFullGame(settings);
    assert.equal(room.phase, 'end');
    assert.ok(phases.includes('auction'), `não passou pelo leilão: ${phases.join(' → ')}`);
    assert.ok(phases.includes('season'), `não passou pela temporada: ${phases.join(' → ')}`);
    for (const m of room.managers) {
      assert.equal(m.roster.length, room.settings.rosterSize, `${m.name} terminou com elenco incompleto`);
      assert.ok(m.budget >= 0, `${m.name} ficou com caixa negativo`);
    }
    assert.ok(io.sent.some((s) => s.ev === 'state'), 'nenhum estado foi enviado aos navegadores');
  });
}

test('o histórico grava a partida terminada (fora da pasta do jogo)', () => {
  playFullGame({ pool: 'atual', format: 'playoffs', speed: 'rapido' }, 1);
  const file = path.join(DATA_DIR, 'historico.json');
  assert.ok(fs.existsSync(file), 'historico.json não foi criado');
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(db.games.length >= 1);
  assert.ok(db.players['lider'], 'o técnico humano não entrou no ranking');
});

test('quem recarrega a página volta para o mesmo time', () => {
  const room = new Room('TESTE', fakeIo());
  const a = room.join(fakeSocket(), 'Ana', 'tok-ana');
  room.disconnect(room.managers[0].socketId);
  const b = room.join(fakeSocket(), 'Ana', 'tok-ana');
  assert.equal(a.id, b.id);
  assert.equal(room.managers.length, 1);
  assert.ok(room.managers[0].connected);
});

test('regras inválidas vindas do navegador são ignoradas', () => {
  const room = new Room('TESTE', fakeIo());
  const { id } = room.join(fakeSocket(), 'Ana', 'tok-ana');
  room.setSettings(id, { rosterSize: 999, pool: 'hackeado', speed: 'rapido' });
  assert.equal(room.settings.rosterSize, 5);
  assert.equal(room.settings.pool, 'atual');
  assert.equal(room.settings.speed, 'rapido');
});
