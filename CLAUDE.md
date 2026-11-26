# Draft 100 — Leilão NBA

Jogo multiplayer em português: técnicos compram jogadores da NBA num leilão (US$ 100M cada), escalam o time e disputam um campeonato simulado posse a posse, com prancheta ao vivo. Joga-se no navegador; um PC é o anfitrião (servidor) e os amigos entram pela rede do Radmin VPN.

Todo texto visível ao usuário é em **português do Brasil**. O dono do projeto não é programador: explique mudanças em linguagem simples.

## Rodar e testar

- `npm install` e depois `node server.js` → http://localhost:3000 (porta via `PORT`).
- `DATA_DIR=/tmp/x` grava histórico/config fora de `Documentos\Draft100`.
- `DRAFT100_DEBUG=1` liga eventos de teste no socket: `debugClutch` (leva o seu jogo aos 30 s finais empatado; `{defend:true}` para defender) e `debugSkip82` (termina a temporada regular do 82-0).
- O cliente expõe `window.__d100 = { emit, state, me }` para testes automatizados (Playwright).
- Não há suíte de testes formal: valide com simulações em Node instanciando `Room` com um `io` falso e `Date.now` controlado, e com Playwright no navegador.

## Estrutura

- `server.js` — entrada. Decide o papel do PC (anfitrião/amigo, ver `src/launcher.js`), sobe Express + Socket.IO, rotas `/info`, `/api/historico`, `/api/salas`, `/api/anuncio`, `/api/rede`, `/api/exe`, e o loop de 50 ms que chama `room.update(now)` e transmite `state`/`tick`.
- `src/room.js` — classe `Room`, máquina de fases: `lobby → (teampick) → arenas → draw → auction → cards → season → end`. Tudo é autoritativo no servidor. `serialize(now)` gera o estado do cliente; `touch()` marca para reenviar.
- `src/league82.js` — modo 82-0 (liga de 30 times com times de lendas, play-in e playoffs melhor de 7). Instalado como mixin em `Room.prototype`.
- `src/sim.js` — `Match`: simulação posse a posse (características, esquemas, arenas, cartas, fogo/gelo, corridas, pedido de tempo, bola decisiva). `step()` devolve os lances novos; `finish()` simula até o fim no automático.
- `src/history.js` — `historico.json` (ranking de técnicos e de jogadores por versão).
- `src/launcher.js`, `discovery.js`, `updater.js`, `paths.js`, `assets.js` — empacotamento Windows: instalação em `%LOCALAPPDATA%\Draft100`, dados em `Documentos\Draft100`, descoberta UDP na porta 41530, atualização automática assinada (ed25519) dos PCs dos amigos.
- `public/data.js` — dados compartilhados (UMD: `module.exports` no Node, `window.DATA` no navegador): times, jogadores atuais e lendas (várias versões por ano), MVPs, arenas, cartas, características, esquemas, posições e penalidades.
- `public/app.js` — cliente em JS puro, renderiza por fase a partir do estado do servidor. `public/style.css` — tema; o layout é desenhado para 1560×900 e usa zoom automático.

## Build do Draft100.exe

`cd build && npm install && node build-exe.js` (ou `build\gerar-exe.bat`). Gera `dist/Draft100.exe` com Node SEA: esbuild junta o servidor, os arquivos de `public/` viram assets e tudo é injetado no `node.exe` oficial (baixado do pacote npm `node-win-x64` e conferido pela assinatura da OpenJS Foundation), com ícone e nome via `resedit`. `--linux` gera também `dist/draft100-linux` para testar o pacote sem Windows.

- **Sempre aumente `version` no `package.json`** antes de gerar uma versão nova: é ela que aparece no jogo e que dispara a atualização automática dos amigos.
- `build/chave-atualizacao.pem` é a chave privada que assina o .exe. Nunca a publique nem a apague; sem ela os amigos não se atualizam sozinhos. Está no `.gitignore`.

## Convenções

- Não use `confirm()`/`alert()` do navegador (o Chrome pode bloquear): use `askConfirm({ title, text, ok })` e `toast()` do `app.js`.
- Mudanças de regra que afetam o equilíbrio (sim.js, preços, força dos times) devem ser medidas com milhares de jogos simulados antes de entregar.
- Atualize o `LEIA-ME.md` (manual do jogador) quando mudar regras ou telas.
