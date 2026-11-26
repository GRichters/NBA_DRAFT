// Comportamento do Draft100.exe no Windows:
//  - na primeira vez (ou ao abrir um .exe novo baixado) se instala em %LOCALAPPDATA%\Draft100,
//    cria os atalhos na Área de Trabalho e no Menu Iniciar e reabre a cópia instalada;
//  - abre o navegador sozinho quando o servidor sobe;
//  - se o jogo já estiver aberto, só abre o navegador;
//  - libera o jogo no Firewall do Windows (uma vez, com a permissão do usuário);
//  - no anfitrião: pode iniciar junto com o Windows e se atualiza sozinho pelo GitHub.
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const VERSION = require('../package.json').version;
const isWin = process.platform === 'win32';
let isSea = false;
try { isSea = require('node:sea').isSea(); } catch (e) { /* node sem SEA */ }

const INSTALL_DIR = path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'Draft100');
const INSTALLED_EXE = path.join(INSTALL_DIR, 'Draft100.exe');

// abrir sem navegador: usado ao iniciar com o Windows e ao reabrir depois de uma atualização
const NO_BROWSER_ARG = '--sem-navegador';
const AUTOSTART_ARG = '--auto-iniciar';
const quietStart = () => process.argv.includes(NO_BROWSER_ARG);

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function waitAndExit(code, ms) {
  setTimeout(() => process.exit(code), ms);
}

function openBrowser(url) {
  if (!isWin || process.env.DRAFT100_NO_BROWSER) { if (process.env.DRAFT100_NO_BROWSER) console.log(`   [abriria o navegador em ${url}]`); return; }
  try {
    spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (e) { /* abre manualmente */ }
}

const psQuote = (s) => String(s).replace(/'/g, "''");
function runPowerShell(script, timeout = 20000) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function makeShortcuts() {
  const ps = `
$s = New-Object -ComObject WScript.Shell
$targets = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($dir in $targets) {
  if (-not (Test-Path $dir)) { continue }
  $l = $s.CreateShortcut((Join-Path $dir 'Draft 100.lnk'))
  $l.TargetPath = '${INSTALLED_EXE.replace(/'/g, "''")}'
  $l.WorkingDirectory = '${INSTALL_DIR.replace(/'/g, "''")}'
  $l.Description = 'Draft 100 - Leilão NBA'
  $l.IconLocation = '${INSTALLED_EXE.replace(/'/g, "''")},0'
  $l.Save()
}
$l = $s.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Draft 100 - trocar modo.lnk'))
$l.TargetPath = '${INSTALLED_EXE.replace(/'/g, "''")}'
$l.Arguments = '--trocar-modo'
$l.WorkingDirectory = '${INSTALL_DIR.replace(/'/g, "''")}'
$l.Description = 'Escolher de novo: anfitriao ou amigo'
$l.IconLocation = '${INSTALLED_EXE.replace(/'/g, "''")},0'
$l.Save()
$l = $s.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Draft 100 - iniciar com o Windows.lnk'))
$l.TargetPath = '${INSTALLED_EXE.replace(/'/g, "''")}'
$l.Arguments = '${AUTOSTART_ARG}'
$l.WorkingDirectory = '${INSTALL_DIR.replace(/'/g, "''")}'
$l.Description = 'Liga ou desliga o servidor do Draft 100 junto com o Windows'
$l.IconLocation = '${INSTALLED_EXE.replace(/'/g, "''")},0'
$l.Save()`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { timeout: 20000, windowsHide: true, stdio: 'ignore' });
    return true;
  } catch (e) { return false; }
}

// fecha qualquer outro Draft100.exe aberto (menos este processo)
function closeOtherCopies() {
  try {
    execFileSync('taskkill.exe', ['/F', '/T', '/IM', 'Draft100.exe', '/FI', `PID ne ${process.pid}`], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
  } catch (e) { /* nenhum aberto, ou sem permissão */ }
}

// devolve true se este processo deve continuar e subir o servidor
function installIfNeeded() {
  if (!isWin || !isSea || process.env.DRAFT100_PORTABLE) return true;
  const self = path.resolve(process.execPath);
  if (self.toLowerCase() === INSTALLED_EXE.toLowerCase()) return true;

  let installed = null;
  try { installed = fs.readFileSync(path.join(INSTALL_DIR, 'versao.txt'), 'utf8').trim(); } catch (e) { /* primeira vez */ }
  console.log(`\n🏀  DRAFT 100 v${VERSION} — ${installed ? `atualizando (versão instalada: v${installed})` : 'instalando'}...\n`);

  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  const tryCopy = (tries) => {
    for (let i = 0; i < tries; i++) {
      try { fs.copyFileSync(self, INSTALLED_EXE); return null; } catch (e) { if (i === tries - 1) return e; sleep(800); }
    }
    return null;
  };
  let err = tryCopy(3);
  if (err) {
    // quase sempre é uma janela do Draft 100 ainda aberta (às vezes minimizada, esperando o anfitrião)
    console.log('   Tem um Draft 100 aberto neste PC (talvez numa janela minimizada). Fechando para atualizar...');
    closeOtherCopies();
    sleep(1500);
    err = tryCopy(4);
  }
  if (err) {
    // plano B: o Windows deixa renomear um .exe em uso; a cópia nova entra no lugar dele
    try {
      const old = INSTALLED_EXE + '.antigo';
      try { fs.rmSync(old, { force: true }); } catch (e) { /* em uso */ }
      fs.renameSync(INSTALLED_EXE, old);
      err = tryCopy(2);
    } catch (e) { err = e; }
  }
  if (err) {
    console.log(`   Não deu para atualizar (${err.code || err.message}).`);
    console.log('   Rode o "Fechar Draft 100.bat" (vem junto no zip) ou reinicie o PC, e abra este arquivo de novo.');
    console.log('   Se o antivírus avisar algo sobre o Draft100.exe, libere o arquivo nele.\n');
    waitAndExit(1, 60000);
    return false;
  }
  fs.writeFileSync(path.join(INSTALL_DIR, 'versao.txt'), VERSION);
  const sc = makeShortcuts();
  console.log(`   Instalado em: ${INSTALL_DIR}`);
  console.log(sc ? '   Atalho "Draft 100" criado na Área de Trabalho e no Menu Iniciar.' : '   (Não consegui criar o atalho: abra pelo Draft100.exe na pasta acima.)');
  console.log('   Seu histórico continua em Documentos\\Draft100.\n');
  console.log('   Abrindo o jogo... você já pode apagar este arquivo baixado.\n');

  // "start" abre a cópia instalada numa janela nova (com o console dela) e esta aqui fecha
  spawn('cmd.exe', ['/c', 'start', '"Draft 100"', '/d', `"${INSTALL_DIR}"`, `"${INSTALLED_EXE}"`],
    { windowsVerbatimArguments: true, stdio: 'inherit' });
  waitAndExit(0, 3000);
  return false;
}

// reabre o jogo numa janela nova (depois de uma atualização) e fecha esta
function relaunch(extraArgs = []) {
  // só as opções "--alguma-coisa" (no .exe, argv[1] também é o caminho do próprio .exe)
  const flags = process.argv.slice(1).filter((a) => a.startsWith('--') && a !== '--trocar-modo' && a !== AUTOSTART_ARG);
  const args = [...new Set([...flags, ...extraArgs])];
  if (!isWin) {
    spawn(process.execPath, isSea ? args : [process.argv[1], ...args], { detached: true, stdio: 'inherit' }).unref();
    return waitAndExit(0, 200);
  }
  // espera ~2 s (para esta janela soltar a porta) e abre a cópia nova numa janela minimizada
  const cmd = `ping -n 3 127.0.0.1 >nul & start "Draft 100" /min /d "${path.dirname(process.execPath)}" "${process.execPath}" ${args.join(' ')}`;
  spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
  waitAndExit(0, 300);
}

// ---------- iniciar junto com o Windows (só faz sentido no anfitrião) ----------
function startupShortcut() {
  try { return path.join(runPowerShell("[Environment]::GetFolderPath('Startup')").trim(), 'Draft 100 (servidor).lnk'); } catch (e) { return null; }
}
function autostartEnabled() { const f = startupShortcut(); return !!f && fs.existsSync(f); }
function setAutostart(on) {
  const f = startupShortcut();
  if (!f) return false;
  try {
    if (!on) { fs.rmSync(f, { force: true }); return true; }
    runPowerShell([
      `$l = (New-Object -ComObject WScript.Shell).CreateShortcut('${psQuote(f)}')`,
      `$l.TargetPath = '${psQuote(INSTALLED_EXE)}'`,
      `$l.Arguments = '${NO_BROWSER_ARG}'`,
      `$l.WorkingDirectory = '${psQuote(INSTALL_DIR)}'`,
      '$l.WindowStyle = 7', // minimizado
      "$l.Description = 'Servidor do Draft 100'",
      `$l.IconLocation = '${psQuote(INSTALLED_EXE)},0'`,
      '$l.Save()',
    ].join('\n'));
    return true;
  } catch (e) { return false; }
}
// atalho "Draft 100 - iniciar com o Windows" no Menu Iniciar: liga/desliga
function toggleAutostart() {
  const on = !autostartEnabled();
  const ok = setAutostart(on);
  if (!ok) console.log('\n   Não consegui mudar a inicialização automática.\n');
  else if (on) console.log('\n   ✓ Ligado: o servidor do Draft 100 abre sozinho (minimizado) quando o Windows iniciar.\n');
  else console.log('\n   ✓ Desligado: o Draft 100 não abre mais sozinho com o Windows.\n');
  waitAndExit(0, 6000);
}

// ---------- Firewall do Windows ----------
// A janela padrão do Windows só libera "redes privadas", e o Radmin costuma ser tratado como "pública".
// Por isso criamos uma regra para o Draft100.exe instalado valendo em todas as redes (pede permissão uma vez).
const FIREWALL_RULE = 'Draft 100';
function firewallRuleExists() {
  try {
    execFileSync('netsh.exe', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE}`], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    return true;
  } catch (e) { return false; }
}
function ensureFirewall(cfg) {
  if (!isWin || !isSea || process.env.DRAFT100_NO_FIREWALL) return;
  if (path.resolve(process.execPath).toLowerCase() !== INSTALLED_EXE.toLowerCase()) return;
  if (firewallRuleExists()) return;
  if (cfg.firewallRecusado === VERSION) return; // já perguntamos nesta versão e a pessoa disse não
  console.log('   Liberando o Draft 100 no Firewall do Windows (para os amigos conseguirem entrar)...');
  console.log('   O Windows vai pedir permissão: clique em SIM.\n');
  const rule = `advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow program="${INSTALLED_EXE}" enable=yes profile=any`;
  try {
    runPowerShell(`Start-Process -FilePath netsh.exe -ArgumentList '${psQuote(rule)}' -Verb RunAs -WindowStyle Hidden -Wait`, 120000);
  } catch (e) { /* recusou o pedido de permissão */ }
  if (firewallRuleExists()) {
    console.log('   ✓ Firewall liberado em todas as redes (inclusive Radmin).\n');
    delete cfg.firewallRecusado;
  } else {
    cfg.firewallRecusado = VERSION;
    console.log('   Sem a permissão: quando o Windows perguntar sobre o Firewall, marque redes PRIVADAS e PÚBLICAS.\n');
  }
  saveConfig(cfg);
}

function onPortBusy(port) {
  console.log(`\n   O Draft 100 já está aberto neste computador (porta ${port} em uso).`);
  if (quietStart()) return waitAndExit(0, 0);
  console.log('   Abrindo o navegador no jogo que já está rodando...\n');
  openBrowser(`http://localhost:${port}`);
  waitAndExit(0, isWin ? 6000 : 0);
}

// no .exe a janela fecharia na hora num erro; assim dá tempo de ler. Com o jogo já rodando,
// um erro isolado só é registrado e a partida continua.
let started = false;
const markStarted = () => { started = true; };
function keepOpenOnCrash() {
  if (!isSea) return;
  process.on('uncaughtException', (e) => {
    console.error('\n   Erro inesperado:', (e && e.stack) || e);
    if (started) return;
    console.error('   Tire um print desta janela. Ela fecha em 2 minutos.\n');
    waitAndExit(1, 120000);
  });
}

// ---------- anfitrião ou amigo ----------
const discoveryOn = () => (isWin && isSea) || !!process.env.DRAFT100_DISCOVERY;

function configFile() { return path.join(require('./paths').DATA_DIR, 'config.json'); }
function loadConfig() { try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {}; } catch (e) { return {}; } }
function saveConfig(cfg) {
  try { fs.mkdirSync(path.dirname(configFile()), { recursive: true }); fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2)); } catch (e) { /* segue sem salvar */ }
}
// IPs escritos à mão em Documentos\Draft100\anfitriao.txt (plano B se o broadcast não passar)
function manualHosts() {
  try {
    return fs.readFileSync(path.join(require('./paths').DATA_DIR, 'anfitriao.txt'), 'utf8')
      .split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter((l) => /^\d+\.\d+\.\d+\.\d+$/.test(l));
  } catch (e) { return []; }
}

function localRunning(port) {
  return new Promise((resolve) => {
    const req = require('http').get({ host: '127.0.0.1', port, path: '/health', timeout: 800 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

function askMode(current) {
  if (!process.stdin.isTTY) return Promise.resolve(current || 'anfitriao');
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n🏀  DRAFT 100 — como este computador vai jogar?\n');
  console.log('   [1] ANFITRIÃO — o jogo roda neste PC e o histórico/ranking fica salvo aqui.');
  console.log('       (Só uma pessoa da turma escolhe esta.)');
  console.log('   [2] AMIGO — este PC só entra no jogo do anfitrião pela rede do Radmin.');
  console.log('       O navegador abre sozinho quando o anfitrião estiver com o jogo aberto.\n');
  if (current) console.log(`   Hoje está como: ${current === 'anfitriao' ? 'ANFITRIÃO' : 'AMIGO'}\n`);
  return new Promise((resolve) => {
    const ask = () => rl.question('   Digite 1 ou 2 e aperte Enter: ', (a) => {
      const v = String(a).trim();
      if (v !== '1' && v !== '2') return ask();
      const modo = v === '1' ? 'anfitriao' : 'amigo';
      console.log(`\n   Certo: ${modo === 'anfitriao' ? 'ANFITRIÃO' : 'AMIGO'}. Para mudar depois, use "Draft 100 - trocar modo" no Menu Iniciar.\n`);
      if (modo !== 'anfitriao' || !isWin || !isSea) { rl.close(); return resolve(modo); }
      rl.question('   Abrir o servidor sozinho (minimizado) toda vez que o Windows ligar? [S/N]: ', (b) => {
        rl.close();
        const on = /^s/i.test(String(b).trim());
        if (setAutostart(on) && on) console.log('   ✓ Combinado. Para desligar: "Draft 100 - iniciar com o Windows" no Menu Iniciar.\n');
        resolve(modo);
      });
    });
    ask();
  });
}

async function friendLoop(cfg, port) {
  const D = require('./discovery');
  console.log('\n🏀  DRAFT 100 — procurando o jogo do anfitrião na rede...\n');
  let hostNow = false;
  const tty = process.stdin.isTTY;
  const onKey = (d) => {
    const k = d.toString();
    if (k === '\u0003') process.exit(0);
    if (/^a$/i.test(k)) hostNow = true;
  };
  if (tty) { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', onKey); }
  const stopKeys = () => { if (tty) { process.stdin.off('data', onKey); process.stdin.setRawMode(false); process.stdin.pause(); } };

  let warned = false;
  for (;;) {
    const known = [...new Set([cfg.ultimoAnfitriao, ...manualHosts()].filter(Boolean))];
    const [found, probed] = await Promise.all([D.search(1800), Promise.all(known.map((ip) => D.probe(ip, port)))]);
    if (hostNow) {
      stopKeys();
      console.log('\n   Ok! Desta vez este PC é o anfitrião.\n');
      return 'host';
    }
    const h = D.pickHost([...found, ...probed.filter(Boolean)]);
    if (h) {
      stopKeys();
      cfg.ultimoAnfitriao = h.address;
      saveConfig(cfg);
      const url = D.hostUrl(h);
      const waiting = (h.salas || []).filter((r) => r.fase === 'lobby');
      console.log(`   ✓ Achei o jogo de ${h.pc} (${h.address}) — versão ${h.v}`);
      if (canSelfUpdate()) await require('./updater').updateFromHost(h, VERSION, installedVersionFile());
      console.log(waiting.length === 1 ? `   Entrando na sala ${waiting[0].codigo} de ${waiting[0].lider}...` : '   Abrindo o jogo no navegador...');
      console.log(`\n   Link: ${url}`);
      console.log('\n   O jogo agora é no navegador. Pode fechar esta janela.\n');
      openBrowser(url);
      waitAndExit(0, 12000);
      return 'joined';
    }
    if (!warned) {
      warned = true;
      console.log('   Ainda não achei. Esta janela fica procurando e o navegador abre sozinho');
      console.log('   assim que o anfitrião abrir o Draft 100.\n');
      console.log('   Confira: o Radmin VPN está ligado e você está na mesma rede que ele?\n');
      console.log(tty ? '   (Aperte A para ser você o anfitrião desta vez.)\n' : '');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

// 'host' = sobe o servidor aqui · 'joined' = abriu o jogo de outro PC · 'busy' = já estava aberto aqui
// 'restart' = trocou o .exe por uma versão nova e está reabrindo
async function decideRole(port) {
  if (isSea) require('./updater').cleanupOld();
  if (process.argv.includes(AUTOSTART_ARG)) { toggleAutostart(); return 'busy'; }
  if (await localRunning(port)) { onPortBusy(port); return 'busy'; }
  if (!discoveryOn()) return 'host';
  const cfg = loadConfig();
  if (!cfg.modo || process.argv.includes('--trocar-modo')) {
    cfg.modo = await askMode(cfg.modo);
    saveConfig(cfg);
  }
  ensureFirewall(cfg);
  if (cfg.modo === 'anfitriao') {
    // o anfitrião confere se há versão nova publicada antes de subir o servidor
    if (await updateHostNow()) { relaunch(); return 'restart'; }
    return 'host';
  }
  return friendLoop(cfg, port);
}

const installedVersionFile = () => (path.resolve(process.execPath).toLowerCase() === INSTALLED_EXE.toLowerCase() ? path.join(INSTALL_DIR, 'versao.txt') : null);
const canSelfUpdate = () => (isWin && isSea) || !!process.env.DRAFT100_UPDATE_TEST;

// true se trocou o .exe por uma versão nova (aí é preciso reabrir)
async function updateHostNow(opts) {
  if (!canSelfUpdate()) return false;
  return !!(await require('./updater').updateFromGithub(VERSION, installedVersionFile(), opts));
}

module.exports = {
  decideRole, discoveryOn, VERSION, isSea, isWin, INSTALL_DIR, installIfNeeded, openBrowser, onPortBusy, keepOpenOnCrash, markStarted,
  quietStart, relaunch, updateHostNow,
};
