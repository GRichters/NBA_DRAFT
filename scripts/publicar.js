// Publica uma versão nova do Draft 100 com um comando só:
//   node scripts/publicar.js            → 1.5.1 vira 1.5.2 (correções)
//   node scripts/publicar.js minor      → 1.5.1 vira 1.6.0 (novidades)
//   node scripts/publicar.js 2.0.0      → versão exata
//
// O que acontece:
//   1. roda os testes (se algum falhar, nada é publicado);
//   2. aumenta a versão no package.json e grava no git;
//   3a. COM GitHub configurado: envia o código e a tag → o GitHub gera e assina o .exe e publica.
//       Seu PC (anfitrião) baixa sozinho; os amigos baixam do seu PC.
//   3b. SEM GitHub: gera o .exe aqui mesmo (dist\Draft100.exe) e instala por cima do seu.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');
const isWin = process.platform === 'win32';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin, ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const fail = (msg) => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

function nextVersion(cur, how = 'patch') {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [a, b, c] = cur.split('.').map(Number);
  if (how === 'major') return `${a + 1}.0.0`;
  if (how === 'minor') return `${a}.${b + 1}.0`;
  if (how === 'patch') return `${a}.${b}.${c + 1}`;
  return fail(`Não entendi "${how}". Use patch, minor, major ou um número como 1.6.0.`);
}

function hasRemote() { try { return !!out('git', ['remote', 'get-url', 'origin']); } catch (e) { return false; } }

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const version = nextVersion(pkg.version, process.argv[2]);
console.log(`\n🏀  Publicando Draft 100 ${pkg.version} → ${version}\n`);

console.log('▸ Rodando os testes');
try { run('npm', ['test']); } catch (e) { fail('Algum teste falhou. Nada foi publicado.'); }

pkg.version = version;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
try { run('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund', '--silent']); } catch (e) { /* lock fica como está */ }

console.log('\n▸ Gravando no git');
run('git', ['add', '-A']);
run('git', ['commit', '-m', `Versão ${version}`]);
run('git', ['tag', `v${version}`]);

if (hasRemote()) {
  console.log('\n▸ Enviando para o GitHub');
  run('git', ['push', '-u', 'origin', 'HEAD', '--follow-tags']);
  console.log(`\n✓ Versão ${version} enviada. Em ~5 minutos o GitHub termina de gerar o .exe`);
  console.log('  (acompanhe na aba "Actions" do repositório).');
  console.log('  Seu Draft 100 se atualiza sozinho (ao abrir, ou em até 30 min se ninguém estiver jogando)');
  console.log('  e os amigos se atualizam pelo seu PC quando abrirem o jogo.\n');
} else {
  console.log('\n▸ Sem GitHub configurado: gerando o .exe aqui');
  if (!fs.existsSync(path.join(ROOT, 'build', 'node_modules', 'esbuild'))) run('npm', ['install'], { cwd: path.join(ROOT, 'build') });
  run(process.execPath, ['build-exe.js'], { cwd: path.join(ROOT, 'build'), shell: false });
  const exe = path.join(ROOT, 'dist', 'Draft100.exe');
  console.log(`\n✓ Pronto: ${exe}`);
  console.log('  Feche o Draft 100 e dê duplo clique nesse arquivo para instalar por cima.');
  console.log('  Os amigos se atualizam pelo seu PC quando abrirem o jogo.\n');
}
