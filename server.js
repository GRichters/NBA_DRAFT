// Draft 100 — Leilão NBA multiplayer
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');
const launcher = require('./src/launcher');

process.title = 'Draft 100';
launcher.keepOpenOnCrash();
const PORT = Number(process.env.PORT) || 3000;

(async () => {
  if (!launcher.installIfNeeded()) return; // o .exe baixado se instalou e abriu a cópia instalada
  // no PC de um amigo o jogo só procura o anfitrião e abre o navegador nele
  if ((await launcher.decideRole(PORT)) !== 'host') return;
  startServer();
})();

function startServer() {
  const express = require('express');
  const { Server } = require('socket.io');
  const paths = require('./src/paths');
  paths.prepare();
  const { Room } = require('./src/room');
  const assets = require('./src/assets');

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000, serveClient: false });

  const SOCKET_JS = assets.socketClient();
  app.get('/vendor/socket.io.min.js', (_, res) => res.type('text/javascript').set('Cache-Control', 'no-cache').send(SOCKET_JS));
  app.use(assets.publicMiddleware(__dirname));
  // fotos colocadas pelo usuário em Documentos\Draft100\fotos (e, por compatibilidade, em public/fotos)
  app.use('/fotos', express.static(paths.FOTOS_DIR));
  if (!launcher.isSea) app.use('/fotos', express.static(path.join(__dirname, 'public', 'fotos')));
  app.get('/health', (_, res) => res.send('ok'));
  const history = require('./src/history');
  app.get('/api/historico', (_, res) => res.json(history.ranking()));

  // endereços de rede deste PC (para montar o link do Radmin/LAN no lobby)
  function lanAddresses() {
    const out = [];
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
      for (const a of addrs || []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        const radmin = /radmin/i.test(name) || a.address.startsWith('26.');
        out.push({ name, address: a.address, radmin });
      }
    }
    return out.sort((x, y) => (y.radmin ? 1 : 0) - (x.radmin ? 1 : 0));
  }
  const IMG = /\.(jpe?g|png|webp)$/i;
  function listFotos(dir) { try { return fs.readdirSync(dir).filter((f) => IMG.test(f)).map((f) => f.toLowerCase()); } catch (e) { return []; } }
  app.get('/fotos.json', (_, res) => {
    const dirs = [paths.FOTOS_DIR];
    if (!launcher.isSea) dirs.push(path.join(__dirname, 'public', 'fotos'));
    res.json([...new Set(dirs.flatMap(listFotos))]);
  });
  app.get('/info', (_, res) => res.json({ port: PORT, version: launcher.VERSION, addresses: lanAddresses() }));

  // salas abertas (tela inicial e descoberta na rede)
  function listRooms() {
    const out = [];
    for (const r of rooms.values()) {
      const humans = r.humans();
      if (!humans.some((m) => m.connected)) continue;
      const lider = r.mgr(r.hostId);
      out.push({ codigo: r.code, lider: lider ? lider.name : humans[0].name, tecnicos: humans.length, fase: r.phase === 'lobby' ? 'lobby' : 'jogo' });
    }
    return out;
  }
  // o .exe do anfitrião (assinado) fica disponível para os PCs dos amigos se atualizarem sozinhos
  const updater = require('./src/updater');
  const exeShared = launcher.isSea && updater.selfIsSigned();
  if (exeShared) app.get('/api/exe', (_, res) => res.sendFile(process.execPath, { headers: { 'Content-Type': 'application/octet-stream' } }));
  const announce = () => ({ app: 'draft100', v: launcher.VERSION, port: PORT, pc: os.hostname(), exe: exeShared, salas: listRooms() });
  app.get('/api/salas', (_, res) => res.json(listRooms()));
  app.get('/api/anuncio', (_, res) => res.json(announce()));
  // outros PCs que também abriram o jogo como anfitrião (aviso na tela inicial de quem está no próprio PC)
  const discovery = require('./src/discovery');
  let otherHosts = [];
  app.get('/api/rede', (_, res) => res.json(otherHosts.map((h) => ({ pc: h.pc, address: h.address, v: h.v, salas: h.salas || [], url: discovery.hostUrl(h) }))));
  if (launcher.discoveryOn()) {
    discovery.startResponder(announce);
    const mine = discovery.ownAddresses();
    const scan = () => discovery.search(1500).then((l) => { otherHosts = l.filter((h) => !(h.port === PORT && mine.has(h.address))); }).catch(() => {});
    scan();
    setInterval(scan, 8000).unref();
  }

  const rooms = new Map();
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newCode() {
    let c;
    do { c = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c));
    return c;
  }
  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Técnico';
  const cleanToken = (t) => String(t || '').slice(0, 64);

  io.on('connection', (socket) => {
    // o navegador compara com a versão que carregou: se o anfitrião atualizou, ele recarrega sozinho
    socket.emit('hello', { v: launcher.VERSION });
    let room = null;
    let myId = null;

    const enter = (r, name, token, cb) => {
      const res = r.join(socket, cleanName(name), cleanToken(token));
      if (!res.ok) return cb && cb(res);
      room = r;
      myId = res.id;
      socket.join(r.code);
      cb && cb({ ok: true, code: r.code, id: myId, spectator: !!res.spectator });
      socket.emit('chatHistory', r.chat);
      r.touch();
      r.broadcast(Date.now());
    };

    socket.on('create', ({ name, token } = {}, cb) => {
      if (room) return cb && cb({ ok: false, error: 'Você já está em uma sala.' });
      const r = new Room(newCode(), io);
      rooms.set(r.code, r);
      enter(r, name, token, cb);
    });

    socket.on('join', ({ code, name, token } = {}, cb) => {
      const r = rooms.get(String(code || '').toUpperCase().trim());
      if (!r) return cb && cb({ ok: false, error: 'Sala não encontrada. Confira o código.' });
      if (room && room !== r) return cb && cb({ ok: false, error: 'Você já está em outra sala.' });
      enter(r, name, token, cb);
    });

    const act = (fn) => (data, cb) => {
      if (!room) return;
      let out;
      try { out = fn(data || {}, Date.now()); } catch (e) { console.error(e); out = { error: 'Erro interno.' }; }
      if (typeof cb === 'function') cb(out || { ok: true });
      room.broadcast(Date.now());
    };

    socket.on('team', act((d) => room.setTeam(myId, d.team)));
    socket.on('pickTeam', act((d, now) => room.pickTeam(myId, d.team, now)));
    socket.on('settings', act((d) => room.setSettings(myId, d)));
    socket.on('addBot', act(() => room.addBot(myId)));
    socket.on('remove', act((d) => room.removeManager(myId, d.id)));
    socket.on('start', act((d, now) => room.start(myId, now)));
    socket.on('bid', act((d, now) => room.bid(myId, d.amount, now)));
    socket.on('pass', act(() => room.pass(myId)));
    socket.on('place', act((d) => room.place(myId, d.slot)));
    socket.on('moveLineup', act((d) => room.moveLineup(myId, String(d.from || ''), String(d.to || ''))));
    socket.on('ready', act((d) => room.setReady(myId, !!d.ready)));
    socket.on('card', act((d) => room.chooseCard(myId, d.card)));
    socket.on('applyBoost', act((d) => room.applyBoost(myId, d.pid, d.choice)));
    socket.on('useCard', act(() => room.useCard(myId)));
    socket.on('timeout', act((d, now) => room.callTimeout(myId, now)));
    if (process.env.DRAFT100_DEBUG) {
      socket.on('debugClutch', act((d) => room.debugClutch(myId, !!d.defend)));
      socket.on('debugSkip82', act((d, now) => room.debugSkip82(myId, now)));
    }
    socket.on('clutchPick', act((d) => room.clutchPick(myId, String(d.pid || ''))));
    socket.on('skipDraw', act((d, now) => room.skipDraw(myId, now)));
    socket.on('pause', act((d, now) => room.togglePause(myId, now)));
    socket.on('skipLot', act((d, now) => room.skipLot(myId, now)));
    socket.on('tactics', act((d) => room.setTactics(myId, d)));
    socket.on('lineup', act((d) => room.setLineup(myId, d)));
    socket.on('autoLineup', act(() => room.autoLineup(myId)));
    socket.on('skipRound', act((d, now) => room.skipRound(myId, now)));
    socket.on('pauseSeason', act((d, now) => room.togglePauseSeason(myId, now)));
    socket.on('restart', act(() => room.restart(myId)));
    socket.on('chat', act((d) => room.chatMsg(myId, d.text)));
    socket.on('rename', act((d) => {
      const m = room.mgr(myId);
      if (m && room.phase === 'lobby') { m.name = cleanName(d.name); room.touch(); }
    }));

    socket.on('leave', () => {
      if (!room) return;
      const r = room;
      socket.leave(r.code);
      r.disconnect(socket.id);
      if (r.phase === 'lobby') {
        r.managers = r.managers.filter((m) => m.id !== myId);
        if (r.hostId === myId) { const h = r.humans().find((x) => x.connected); r.hostId = h ? h.id : null; }
        r.touch();
      }
      r.broadcast(Date.now());
      room = null; myId = null;
    });

    socket.on('disconnect', () => {
      if (!room) return;
      room.disconnect(socket.id);
      room.broadcast(Date.now());
    });
  });

  // loop principal
  setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      try {
        r.update(now);
        r.broadcast(now);
      } catch (e) { console.error('Erro na sala', code, e); }
      const anyone = r.humans().some((m) => m.connected);
      if (anyone) r.lastActive = now;
      else if (now - r.lastActive > 20 * 60 * 1000) rooms.delete(code);
    }
  }, 50);

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') return launcher.onPortBusy(PORT);
    throw e;
  });

  server.listen(PORT, '0.0.0.0', () => {
    launcher.markStarted();
    console.log(`\n🏀  DRAFT 100 v${launcher.VERSION} — Leilão NBA rodando!\n`);
    console.log(`   Neste computador:  http://localhost:${PORT}`);
    const addrs = lanAddresses();
    for (const a of addrs) {
      console.log(`   Rede (${a.name}):  http://${a.address}:${PORT}${a.radmin ? '  ← Radmin VPN (mande este para os amigos)' : ''}`);
    }
    if (!addrs.some((a) => a.radmin)) console.log('   (Radmin VPN não encontrado: ligue o Radmin e reabra o jogo para ver o link dos amigos.)');
    console.log(`\n   Histórico e fotos ficam em: ${paths.DATA_DIR}`);
    console.log('   (Atualizar ou apagar o jogo não mexe nessa pasta.)');
    console.log('\n   Deixe esta janela aberta enquanto jogam. Fechar a janela encerra o jogo.\n');
    if (!launcher.quietStart()) launcher.openBrowser(`http://localhost:${PORT}`);
  });

  // servidor ligado o tempo todo: de tempos em tempos confere se saiu versão nova no GitHub.
  // Só troca quando ninguém está numa sala, para nunca derrubar uma partida.
  const UPDATE_EVERY_MS = 30 * 60 * 1000;
  const someonePlaying = () => [...rooms.values()].some((r) => r.humans().some((m) => m.connected));
  let updating = false;
  setInterval(async () => {
    if (updating || someonePlaying()) return;
    updating = true;
    try {
      if (await launcher.updateHostNow({ quiet: true }) && !someonePlaying()) {
        console.log('   Reabrindo o Draft 100 na versão nova...');
        io.close();
        server.close();
        launcher.relaunch(['--sem-navegador']);
      }
    } finally { updating = false; }
  }, UPDATE_EVERY_MS).unref();
}
