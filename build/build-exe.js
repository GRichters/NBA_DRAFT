// Gera dist/Draft100.exe (Windows 64 bits) a partir do código do jogo.
// Uso (em qualquer sistema com Node 22):  cd build && npm install && node build-exe.js
// Opção --linux gera também dist/draft100-linux (mesmo pacote, para testar o .exe sem Windows).
//
// Como funciona: o servidor vira um arquivo só (esbuild), os arquivos do site entram como
// "assets" de um Single Executable Application do Node e tudo é injetado numa cópia do
// node.exe oficial (assinado pela OpenJS Foundation), com ícone e nome do Draft 100.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const TMP = path.join(__dirname, '.tmp');
const CACHE = path.join(__dirname, '.cache');
const NODE_VERSION = process.versions.node; // o blob precisa ser feito pela mesma versão do node.exe
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const pkg = require(path.join(ROOT, 'package.json'));

const step = (m) => console.log(`\n▸ ${m}`);

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// ---------- node.exe oficial (pacote npm node-win-x64, mesmo binário do nodejs.org) ----------
function peAuthenticode(buf) {
  const pe = buf.readUInt32LE(0x3c);
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  const checksum = opt + 64;
  const certDir = opt + (magic === 0x20b ? 112 : 96) + 8 * 4;
  const off = buf.readUInt32LE(certDir);
  const size = buf.readUInt32LE(certDir + 4);
  if (!off || !size) return null;
  const h = crypto.createHash('sha256');
  h.update(buf.subarray(0, checksum));
  h.update(buf.subarray(checksum + 4, certDir));
  h.update(buf.subarray(certDir + 8, off));
  h.update(buf.subarray(off + size));
  return { digest: h.digest(), cert: buf.subarray(off + 8, off + size) };
}

function windowsNode() {
  const dir = path.join(CACHE, `node-win-x64-${NODE_VERSION}`);
  const exe = path.join(dir, 'package', 'bin', 'node.exe');
  if (!fs.existsSync(exe)) {
    step(`Baixando node.exe ${NODE_VERSION} (npm: node-win-x64)`);
    fs.mkdirSync(dir, { recursive: true });
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const tgz = execFileSync(npm, ['pack', `node-win-x64@${NODE_VERSION}`, '--silent'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' }).trim().split('\n').pop();
    execFileSync('tar', ['-xzf', tgz], { cwd: dir });
  }
  // confere que é o binário original: o hash do arquivo bate com o que está dentro da assinatura
  // e quem assinou foi a OpenJS Foundation (dona do Node.js)
  const buf = fs.readFileSync(exe);
  const sig = peAuthenticode(buf);
  if (!sig || !sig.cert.includes(sig.digest) || !sig.cert.includes(Buffer.from('OpenJS Foundation'))) {
    throw new Error('node.exe sem a assinatura original da OpenJS Foundation — build abortado.');
  }
  console.log('  node.exe conferido: assinatura da OpenJS Foundation e hash batem.');
  return buf;
}

// ---------- 1. servidor num arquivo só ----------
async function bundle() {
  step('Empacotando o servidor (esbuild)');
  const esbuild = require('esbuild');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server.js')],
    bundle: true, platform: 'node', target: 'node22', format: 'cjs',
    outfile: path.join(TMP, 'bundle.js'),
    external: ['bufferutil', 'utf-8-validate'], // opcionais do socket.io
    logLevel: 'warning',
    logOverride: { 'require-resolve-not-external': 'silent' }, // require.resolve só roda fora do .exe
  });
}

// ---------- 2. blob do SEA com os arquivos do site ----------
function seaBlob() {
  step('Montando os arquivos do site dentro do executável');
  const pub = path.join(ROOT, 'public');
  const keys = walk(pub).filter((k) => !k.startsWith('fotos/'));
  const assets = {};
  for (const k of keys) assets[k] = path.join(pub, k);
  assets['vendor/socket.io.min.js'] = path.join(ROOT, 'node_modules', 'socket.io', 'client-dist', 'socket.io.min.js');
  fs.writeFileSync(path.join(TMP, 'manifest.json'), JSON.stringify(keys));
  assets['manifest.json'] = path.join(TMP, 'manifest.json');
  const cfg = {
    main: path.join(TMP, 'bundle.js'),
    output: path.join(TMP, 'sea-prep.blob'),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false, // assim o mesmo blob serve para Windows e Linux
    assets,
  };
  fs.writeFileSync(path.join(TMP, 'sea-config.json'), JSON.stringify(cfg, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', path.join(TMP, 'sea-config.json')], { stdio: 'inherit' });
  console.log(`  ${keys.length} arquivos do site + cliente do socket.io`);
  return fs.readFileSync(cfg.output);
}

// ---------- 3. ícone e informações do .exe ----------
function brand(exeBuf) {
  step('Aplicando ícone e nome "Draft 100"');
  const ResEdit = require('resedit');
  const exe = ResEdit.NtExecutable.from(exeBuf, { ignoreCert: true }); // a assinatura do Node deixa de valer ao modificar
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  for (const g of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, ico.icons.map((i) => i.data));
  }
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [a, b, c] = pkg.version.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
  vi.setStringValues(lang, {
    ProductName: 'Draft 100',
    FileDescription: 'Draft 100 - Leilao NBA',
    CompanyName: 'Draft 100',
    InternalName: 'Draft100',
    OriginalFilename: 'Draft100.exe',
    FileVersion: pkg.version,
    ProductVersion: pkg.version,
    Comments: `Feito com Node.js ${NODE_VERSION}`,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  return Buffer.from(exe.generate());
}

async function inject(file, blob, macho) {
  const { inject: postject } = require('postject');
  await postject(file, 'NODE_SEA_BLOB', blob, { sentinelFuse: FUSE, machoSegmentName: macho ? 'NODE_SEA' : undefined, overwrite: true });
}

(async () => {
  console.log(`Draft 100 v${pkg.version} — gerando executável (Node ${NODE_VERSION})`);
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'socket.io'))) {
    throw new Error('Rode "npm install" na pasta do jogo antes (precisa de express e socket.io).');
  }
  await bundle();
  const blob = seaBlob();
  const nodeExe = windowsNode();
  fs.mkdirSync(OUT, { recursive: true });

  // primeiro injeta o jogo no node.exe original e depois aplica ícone/nome
  // (o resedit regrava a seção de recursos inteira e preserva o NODE_SEA_BLOB)
  const exePath = path.join(OUT, 'Draft100.exe');
  fs.writeFileSync(exePath, nodeExe);
  step('Injetando o jogo no Draft100.exe');
  await inject(exePath, blob);
  fs.writeFileSync(exePath, brand(fs.readFileSync(exePath)));
  // assinatura para a atualização automática dos amigos (só quem tem a chave privada consegue)
  const keyFile = path.join(__dirname, 'chave-atualizacao.pem');
  const updater = require(path.join(ROOT, 'src', 'updater'));
  const signFile = (f) => {
    if (!fs.existsSync(keyFile)) return false;
    fs.writeFileSync(f, updater.sign(fs.readFileSync(f), pkg.version, fs.readFileSync(keyFile, 'utf8')));
    if (updater.signedVersion(fs.readFileSync(f)) !== pkg.version) throw new Error('assinatura não conferiu');
    return true;
  };
  console.log(signFile(exePath) ? '  assinado para atualização automática' : '  ⚠ sem build/chave-atualizacao.pem: os amigos não vão atualizar sozinhos com este .exe');
  console.log(`  ✓ ${exePath} (${(fs.statSync(exePath).size / 1048576).toFixed(1)} MB)`);

  if (process.argv.includes('--linux')) {
    const lin = path.join(OUT, 'draft100-linux');
    fs.copyFileSync(process.execPath, lin);
    fs.chmodSync(lin, 0o755);
    await inject(lin, blob);
    signFile(lin);
    console.log(`  ✓ ${lin} (para teste)`);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nPronto.');
})().catch((e) => { console.error('\n✗', e.message || e); process.exit(1); });
