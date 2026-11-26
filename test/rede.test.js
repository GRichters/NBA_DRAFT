// Descoberta do anfitrião na rede (Radmin / Wi-Fi): escolha do anfitrião e link de entrada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/discovery');

const host = (pc, salas) => ({ app: 'draft100', pc, address: `26.0.0.${pc.length}`, port: 3000, v: '1.5.1', salas });

test('prefere o anfitrião que tem sala esperando gente', () => {
  const jogando = host('PC-A', [{ codigo: 'AAAAA', fase: 'jogo', tecnicos: 6 }]);
  const esperando = host('PC-BB', [{ codigo: 'BBBBB', fase: 'lobby', tecnicos: 1 }]);
  assert.equal(D.pickHost([jogando, esperando]), esperando);
  assert.equal(D.pickHost([]), null);
});

test('com uma sala esperando, o link já entra nela', () => {
  const h = host('PC-A', [{ codigo: 'ABCDE', fase: 'lobby', tecnicos: 2 }]);
  assert.equal(D.hostUrl(h), 'http://26.0.0.4:3000/?sala=ABCDE&auto=1');
  assert.equal(D.hostUrl(host('PC-A', [])), 'http://26.0.0.4:3000/');
});

test('o próprio PC responde à procura na rede (UDP)', async () => {
  process.env.DRAFT100_DISCOVERY_SELF = '1';
  const sock = D.startResponder(() => ({ v: '9.9.9', port: 3000, pc: 'PC-TESTE', salas: [] }));
  try {
    await new Promise((r) => sock.once('listening', r));
    const found = await D.search(600);
    assert.ok(found.some((h) => h.pc === 'PC-TESTE' && h.v === '9.9.9'), 'não achou o anfitrião de teste');
  } finally {
    sock.close();
    delete process.env.DRAFT100_DISCOVERY_SELF;
  }
});
