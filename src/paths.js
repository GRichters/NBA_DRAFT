// Onde o jogo guarda o que é do usuário (histórico e fotos).
// No Windows fica em Documentos\Draft100 — FORA da pasta do jogo —, então apagar,
// mover ou atualizar o jogo nunca apaga o ranking. Em servidor (Render/Linux) fica em ./data.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_DIR = path.join(__dirname, '..');
const LEGACY_DATA = path.join(APP_DIR, 'data');

function windowsDocuments() {
  // pega a pasta Documentos de verdade (funciona também quando o OneDrive redireciona)
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetFolderPath('MyDocuments')"],
      { encoding: 'utf8', timeout: 8000, windowsHide: true }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch (e) { /* cai no padrão abaixo */ }
  const guess = path.join(os.homedir(), 'Documents');
  return fs.existsSync(guess) ? guess : os.homedir();
}

function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (process.platform === 'win32') return path.join(windowsDocuments(), 'Draft100');
  return LEGACY_DATA;
}

const DATA_DIR = resolveDataDir();
const FOTOS_DIR = path.join(DATA_DIR, 'fotos');

const FOTOS_README = [
  'FOTOS DOS JOGADORES (opcional)',
  '',
  'Coloque aqui imagens com o nome do jogador, em minúsculas e com hífens:',
  '  lebron-james.jpg   michael-jordan.png   stephen-curry.webp',
  'Para uma versão específica, use o ano no fim:  michael-jordan-96.jpg',
  '',
  'Formatos aceitos: jpg, jpeg, png, webp. Sem foto, aparece a camisa do time.',
  'Esta pasta não é apagada quando o jogo é atualizado.',
  '',
].join('\r\n');

function prepare() {
  try {
    fs.mkdirSync(FOTOS_DIR, { recursive: true });
    const readme = path.join(FOTOS_DIR, 'LEIA-ME.txt');
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, FOTOS_README);
    // traz o histórico antigo (data/historico.json da pasta do jogo) na primeira vez
    const oldFile = path.join(LEGACY_DATA, 'historico.json');
    const newFile = path.join(DATA_DIR, 'historico.json');
    if (DATA_DIR !== LEGACY_DATA && !fs.existsSync(newFile) && fs.existsSync(oldFile)) {
      fs.copyFileSync(oldFile, newFile);
      console.log(`   Histórico antigo copiado para ${newFile}`);
    }
  } catch (e) {
    console.error('Não consegui preparar a pasta de dados:', e.message);
  }
}

module.exports = { APP_DIR, DATA_DIR, FOTOS_DIR, prepare };
