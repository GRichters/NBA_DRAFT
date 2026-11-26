// Atualização automática do .exe dos amigos a partir do PC do anfitrião.
// O build assina o .exe (chave privada que só o dono tem) e grava a assinatura no fim do arquivo:
//   [exe][versão, 16 bytes][assinatura ed25519, 64 bytes]["D100SIG1"]
// O PC do amigo só troca o próprio .exe se a assinatura bater com a chave pública embutida.
// O PC do anfitrião se atualiza do mesmo jeito, mas buscando a versão publicada no GitHub
// (campo "updateRepo" do package.json); a assinatura é conferida igual.
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const PUBLIC_KEY = require('./update-key');

const MAGIC = Buffer.from('D100SIG1');
const TRAILER = 16 + 64 + MAGIC.length;

function cmpVersion(a, b) {
  const parse = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// versão assinada contida no arquivo, ou null se não estiver assinado/for inválido
function signedVersion(buf, publicKey = PUBLIC_KEY) {
  if (!buf || buf.length <= TRAILER || !buf.subarray(-MAGIC.length).equals(MAGIC)) return null;
  const ver = buf.subarray(-TRAILER, -TRAILER + 16);
  const sig = buf.subarray(-TRAILER + 16, -MAGIC.length);
  const body = buf.subarray(0, -TRAILER);
  try {
    if (!crypto.verify(null, Buffer.concat([body, ver]), publicKey, sig)) return null;
  } catch (e) { return null; }
  return ver.toString('utf8').replace(/\0+$/, '');
}

// o próprio .exe tem assinatura no fim? (só olha o final, sem ler os 85 MB)
function selfIsSigned() {
  try {
    const fd = fs.openSync(process.execPath, 'r');
    const size = fs.fstatSync(fd).size;
    const tail = Buffer.alloc(MAGIC.length);
    fs.readSync(fd, tail, 0, MAGIC.length, size - MAGIC.length);
    fs.closeSync(fd);
    return tail.equals(MAGIC);
  } catch (e) { return false; }
}

function sign(body, version, privateKeyPem) {
  const ver = Buffer.alloc(16);
  ver.write(version, 'utf8');
  const sig = crypto.sign(null, Buffer.concat([body, ver]), crypto.createPrivateKey(privateKeyPem));
  return Buffer.concat([body, ver, sig, MAGIC]);
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const total = Number(res.headers['content-length']) || 0;
      const parts = [];
      let got = 0;
      let shown = -1;
      res.on('data', (c) => {
        parts.push(c);
        got += c.length;
        const pct = total ? Math.floor((got / total) * 10) * 10 : -1;
        if (pct > shown) { shown = pct; process.stdout.write(`\r   Baixando atualização... ${pct >= 0 ? pct + '%' : Math.round(got / 1048576) + ' MB'}   `); }
      });
      res.on('end', () => { process.stdout.write('\n'); resolve(Buffer.concat(parts)); });
      res.on('error', reject);
    });
    req.setTimeout(30000, () => req.destroy(new Error('sem resposta do anfitrião')));
    req.on('error', reject);
  });
}

// troca o .exe em uso: no Windows dá para renomear um .exe aberto, mas não sobrescrever
function replaceSelf(buf) {
  const target = process.execPath;
  const old = target + '.antigo';
  try { fs.rmSync(old, { force: true }); } catch (e) { /* pode estar em uso */ }
  fs.renameSync(target, old);
  try {
    fs.writeFileSync(target, buf, { mode: 0o755 });
  } catch (e) {
    fs.renameSync(old, target); // desfaz
    throw e;
  }
}

// ---------- atualização do anfitrião pelo GitHub ----------
const GITHUB_API = process.env.DRAFT100_UPDATE_API || 'https://api.github.com';
const ASSET_NAME = 'Draft100.exe';

// repositório "dono/nome" onde as versões são publicadas (vazio = desligado)
function updateRepo() {
  if (process.env.DRAFT100_UPDATE_REPO !== undefined) return process.env.DRAFT100_UPDATE_REPO.trim();
  try { return String(require('../package.json').updateRepo || '').trim(); } catch (e) { return ''; }
}

async function fetchWithTimeout(url, ms, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': 'Draft100-atualizador', ...(opts.headers || {}) } });
  } finally { clearTimeout(timer); }
}

// pergunta ao GitHub qual é a última versão publicada; devolve { version, url } ou null
async function latestRelease(repo = updateRepo()) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const res = await fetchWithTimeout(`${GITHUB_API}/repos/${repo}/releases/latest`, 8000, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  const rel = await res.json();
  const asset = (rel.assets || []).find((a) => a.name === ASSET_NAME);
  if (!asset || !rel.tag_name) return null;
  return { version: String(rel.tag_name).replace(/^v/i, ''), url: asset.browser_download_url };
}

// baixa e confere a versão nova; devolve o arquivo pronto (ainda não instalado) ou null
async function downloadRelease(rel, myVersion, publicKey = PUBLIC_KEY) {
  if (!rel || cmpVersion(rel.version, myVersion) <= 0) return null;
  const res = await fetchWithTimeout(rel.url, 10 * 60 * 1000);
  if (!res.ok) throw new Error(`download respondeu ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const v = signedVersion(buf, publicKey);
  if (!v || cmpVersion(v, myVersion) <= 0) throw new Error('o arquivo publicado não tem a assinatura oficial do Draft 100');
  return { version: v, buf };
}

// usado pelo anfitrião: confere o GitHub e troca o próprio .exe se houver versão nova.
// devolve a versão instalada ou null (sem internet, sem versão nova, desligado...)
async function updateFromGithub(myVersion, versionFile, { quiet = false } = {}) {
  const repo = updateRepo();
  if (!repo) return null;
  try {
    const rel = await latestRelease(repo);
    if (!rel || cmpVersion(rel.version, myVersion) <= 0) return null;
    console.log(`   Versão nova publicada: ${rel.version} (este PC: ${myVersion}). Baixando...`);
    const got = await downloadRelease(rel, myVersion);
    replaceSelf(got.buf);
    if (versionFile) { try { fs.writeFileSync(versionFile, got.version); } catch (e) { /* ok */ } }
    console.log(`   ✓ Atualizado para a versão ${got.version}.\n`);
    return got.version;
  } catch (e) {
    if (!quiet) console.log(`   (Não deu para procurar atualização agora: ${e.message}. Segue na versão atual.)\n`);
    return null;
  }
}

function cleanupOld() {
  try { fs.rmSync(process.execPath + '.antigo', { force: true }); } catch (e) { /* ainda em uso: fica para a próxima */ }
}

// devolve a versão instalada se atualizou, senão null
async function updateFromHost(host, myVersion, versionFile) {
  if (!host.exe || cmpVersion(host.v, myVersion) <= 0) return null;
  console.log(`   O anfitrião está com a versão ${host.v} (este PC: ${myVersion}). Atualizando...`);
  try {
    const buf = await download(`http://${host.address}:${host.port}/api/exe`);
    const v = signedVersion(buf);
    if (!v || cmpVersion(v, myVersion) <= 0) {
      console.log('   A atualização não tem a assinatura oficial do Draft 100. Ignorada por segurança.\n');
      return null;
    }
    replaceSelf(buf);
    if (versionFile) { try { fs.writeFileSync(versionFile, v); } catch (e) { /* ok */ } }
    console.log(`   ✓ Atualizado para a versão ${v}.\n`);
    return v;
  } catch (e) {
    console.log(`   Não deu para atualizar agora (${e.message}). Segue na versão atual.\n`);
    return null;
  }
}

module.exports = {
  cmpVersion, signedVersion, selfIsSigned, sign, updateFromHost, cleanupOld, MAGIC, TRAILER,
  updateRepo, latestRelease, downloadRelease, updateFromGithub,
};
