// Utilidades dos testes: relógio controlado, socket.io falso e uma pasta de dados temporária.
const fs = require('fs');
const os = require('os');
const path = require('path');

// grava histórico/config numa pasta descartável (nunca em Documentos\Draft100)
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'draft100-test-'));
process.env.DATA_DIR = DATA_DIR;

// relógio falso: o jogo inteiro roda em segundos em vez de minutos
const realNow = Date.now;
let clock = realNow();
function useFakeClock() {
  Date.now = () => clock;
  return {
    now: () => clock,
    advance: (ms) => { clock += ms; return clock; },
    restore: () => { Date.now = realNow; },
  };
}

// socket.io falso: guarda o que a sala tentou mandar para os clientes
function fakeIo() {
  const sent = [];
  return { sent, to: (room) => ({ emit: (ev, data) => sent.push({ room, ev, data }) }) };
}

let sockSeq = 0;
const fakeSocket = () => ({ id: `sock-${++sockSeq}` });

module.exports = { DATA_DIR, useFakeClock, fakeIo, fakeSocket };
