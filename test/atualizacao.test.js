// Atualização automática: assinatura, arquivo adulterado e o caminho do anfitrião pelo GitHub
// (com um "GitHub" falso rodando aqui mesmo, sem internet).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const crypto = require('crypto');
require('./helpers');
const updater = require('../src/updater');

// par de chaves só para teste (a chave de verdade fica em build/chave-atualizacao.pem)
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });
const fakeExe = (v) => updater.sign(Buffer.from(`conteudo do exe ${v} `.repeat(500)), v, PRIV);

test('compara versões', () => {
  assert.ok(updater.cmpVersion('1.5.10', '1.5.9') > 0);
  assert.ok(updater.cmpVersion('2.0.0', '1.99.99') > 0);
  assert.equal(updater.cmpVersion('v1.6.0', '1.6.0'), 0);
  assert.ok(updater.cmpVersion('1.5.1', '1.6') < 0);
});

test('arquivo assinado é aceito e mostra a versão', () => {
  assert.equal(updater.signedVersion(fakeExe('1.6.0'), PUB), '1.6.0');
});

test('arquivo adulterado ou de outra chave é recusado', () => {
  const buf = fakeExe('1.6.0');
  buf[10] ^= 0xff;
  assert.equal(updater.signedVersion(buf, PUB), null);
  assert.equal(updater.signedVersion(fakeExe('1.6.0')), null, 'a chave oficial não pode aceitar um arquivo assinado com outra chave');
  assert.equal(updater.signedVersion(Buffer.from('sem assinatura nenhuma'), PUB), null);
});

// "GitHub" falso: responde a última versão publicada e serve o arquivo para download
function fakeGithub(files) {
  const routes = { ...files };
  const server = http.createServer((req, res) => {
    if (routes[req.url]) return res.end(routes[req.url]);
    res.statusCode = 404; res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    routes['/repos/dono/draft100/releases/latest'] = JSON.stringify({
      tag_name: 'v1.6.0', assets: [{ name: 'Draft100.exe', browser_download_url: `${base}/dl/Draft100.exe` }],
    });
    resolve({ server, base });
  }));
}

test('anfitrião acha e baixa a versão nova publicada no GitHub', async () => {
  const { server, base } = await fakeGithub({ '/dl/Draft100.exe': fakeExe('1.6.0') });
  process.env.DRAFT100_UPDATE_API = base;
  try {
    // o módulo lê a URL da API ao carregar: recarrega com a variável já definida
    delete require.cache[require.resolve('../src/updater')];
    const up = require('../src/updater');
    const rel = await up.latestRelease('dono/draft100');
    assert.deepEqual(rel, { version: '1.6.0', url: `${base}/dl/Draft100.exe` });
    const got = await up.downloadRelease(rel, '1.5.1', PUB);
    assert.equal(got.version, '1.6.0');
    assert.equal(await up.downloadRelease(rel, '1.6.0', PUB), null, 'mesma versão: não baixa nada');
    await assert.rejects(up.downloadRelease(rel, '1.5.1'), /assinatura/, 'assinatura de outra chave tem que ser recusada');
  } finally {
    delete process.env.DRAFT100_UPDATE_API;
    server.close();
  }
});

test('sem repositório configurado, o anfitrião não procura atualização', async () => {
  process.env.DRAFT100_UPDATE_REPO = '';
  try {
    assert.equal(updater.updateRepo(), '');
    assert.equal(await updater.updateFromGithub('1.0.0', null), null);
  } finally { delete process.env.DRAFT100_UPDATE_REPO; }
});
