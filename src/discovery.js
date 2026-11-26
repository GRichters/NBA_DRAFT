// Descoberta automática na rede (Radmin VPN, Wi-Fi da casa etc.).
// O anfitrião responde a um "tem Draft 100 aí?" mandado por broadcast UDP;
// o PC do amigo pergunta, recebe o IP do anfitrião e abre o navegador direto no jogo.
const dgram = require('dgram');
const http = require('http');
const os = require('os');

const UDP_PORT = 41530;
const MAGIC = 'draft100';

function ownAddresses() {
  const set = new Set(['127.0.0.1']);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4') set.add(a.address);
  return set;
}

// endereço de broadcast de cada placa de rede (ex.: Radmin 26.x.x.x/8 → 26.255.255.255)
function broadcastTargets() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      out.add(ip.map((b, i) => (b | (~mask[i] & 255))).join('.'));
    }
  }
  if (process.env.DRAFT100_DISCOVERY_SELF) out.add('127.0.0.1'); // só para teste num PC só
  return [...out];
}

// lado do anfitrião: responde quem perguntar
function startResponder(getInfo) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', (e) => { console.error('   (descoberta na rede desligada:', e.message + ')'); try { sock.close(); } catch (x) { /* já fechado */ } });
  sock.on('message', (buf, rinfo) => {
    let msg;
    try { msg = JSON.parse(buf.toString('utf8')); } catch (e) { return; }
    if (!msg || msg.app !== MAGIC || msg.t !== 'q') return;
    const reply = Buffer.from(JSON.stringify({ app: MAGIC, t: 'r', ...getInfo() }));
    sock.send(reply, rinfo.port, rinfo.address);
  });
  sock.bind(UDP_PORT, '0.0.0.0');
  return sock;
}

// lado do amigo: pergunta na rede e junta as respostas por alguns instantes
function search(ms = 1800) {
  return new Promise((resolve) => {
    const found = new Map();
    const mine = process.env.DRAFT100_DISCOVERY_SELF ? new Set() : ownAddresses();
    let sock;
    try { sock = dgram.createSocket('udp4'); } catch (e) { return resolve([]); }
    const done = () => { try { sock.close(); } catch (e) { /* ok */ } resolve([...found.values()]); };
    sock.on('error', done);
    sock.on('message', (buf, rinfo) => {
      try {
        const m = JSON.parse(buf.toString('utf8'));
        if (m.app !== MAGIC || m.t !== 'r' || mine.has(rinfo.address)) return;
        const key = `${m.pc}:${m.port}`; // o mesmo PC pode responder por mais de uma placa de rede
        const prev = found.get(key);
        if (!prev || prev.address.startsWith('127.')) found.set(key, { ...m, address: rinfo.address });
      } catch (e) { /* pacote estranho */ }
    });
    sock.bind(0, () => {
      try { sock.setBroadcast(true); } catch (e) { /* segue sem broadcast */ }
      const q = Buffer.from(JSON.stringify({ app: MAGIC, t: 'q' }));
      const send = () => { for (const t of broadcastTargets()) sock.send(q, UDP_PORT, t, () => {}); };
      send();
      setTimeout(send, ms / 3);
      setTimeout(done, ms);
    });
  });
}

// tentativa direta num IP conhecido (último anfitrião ou anfitriao.txt), caso o broadcast não passe
function probe(address, port = 3000, ms = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: address, port, path: '/api/anuncio', timeout: ms }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { const m = JSON.parse(body); resolve(m.app === MAGIC ? { ...m, address } : null); } catch (e) { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// melhor anfitrião: quem tem sala esperando gente, depois quem tem mais técnicos
function pickHost(hosts) {
  const score = (h) => (h.salas || []).reduce((s, r) => s + (r.fase === 'lobby' ? 100 : 10) + r.tecnicos, 0);
  return hosts.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

function hostUrl(h) {
  const base = `http://${h.address}:${h.port}/`;
  const waiting = (h.salas || []).filter((r) => r.fase === 'lobby');
  return waiting.length === 1 ? `${base}?sala=${waiting[0].codigo}&auto=1` : base;
}

module.exports = { UDP_PORT, startResponder, search, probe, pickHost, hostUrl, ownAddresses };
