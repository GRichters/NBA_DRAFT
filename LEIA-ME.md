# 🏀 Draft 100 — Leilão NBA com os amigos

Cada técnico tem **US$ 100 milhões** para montar seu elenco num leilão ao vivo. Depois, a temporada é simulada lance a lance e você muda a tática durante o jogo.

- Salas de **2 a 16 técnicos**, entrando por link ou código, cada um com uma franquia da NBA
- **Bots** para completar a sala (ou para jogar sozinho)
- Listas de jogadores: **NBA Atual**, **Lendas** (Jordan, Kobe, Shaq, Bird…) ou **as duas misturadas**
- Leilão com cronômetro: maior lance leva, cada lance novo dá pelo menos 6s para resposta, botão **Passar** para agilizar
- Campeonato em **pontos corridos**, **mata-mata** ou **os dois** (temporada regular + playoffs)
- Jogos ao vivo com placar, narração, cestinhas e **prancheta** (ritmo, foco no ataque, tipo de defesa). Duração de cada jogo: rápida ≈ 1 min, normal ≈ 2 min, lenta ≈ 3 min
- Prêmios no fim: MVP, pechincha do leilão e contratação mais cara
- Chat da sala, sons e funciona no celular
- **Encaixe automático na tela:** em telas menores (ex.: notebook 1366×768 ou Windows com escala de 125%/150%), o jogo reduz o zoom sozinho para mostrar o mesmo layout de três colunas. No topo há o controle **− Auto +** para aumentar ou diminuir na mão (↺ volta para o automático)

---

## Opção 1 — Jogar pelo Radmin VPN com o Draft100.exe (recomendado)

Todo mundo usa o **mesmo `Draft100.exe`**. Na primeira vez ele pergunta como aquele PC vai jogar:

- **[1] Anfitrião** — só uma pessoa da turma. O jogo roda no PC dela e o histórico/ranking fica salvo lá.
- **[2] Amigo** — o PC procura o jogo do anfitrião na rede do Radmin e abre o navegador direto nele. Ninguém precisa digitar IP nem link.

**Instalar (uma vez em cada PC):**
1. Dê duplo clique no **`Draft100.exe`**. Não precisa de Node.js nem de mais nada.
2. Se aparecer *"O Windows protegeu o computador"*, clique em **Mais informações → Executar assim mesmo** (o .exe não tem assinatura paga da Microsoft, por isso o aviso).
3. Ele se instala em `%LOCALAPPDATA%\Draft100`, cria o atalho **Draft 100** na Área de Trabalho e no Menu Iniciar e pergunta: digite **1** (anfitrião) ou **2** (amigo) e aperte Enter.
4. No anfitrião, ele pergunta se o servidor deve **abrir sozinho quando o Windows ligar** (minimizado, sem abrir o navegador). Responda **S** se o seu PC vai ser o servidor da turma. Para ligar/desligar depois: Menu Iniciar → **Draft 100 - iniciar com o Windows**.
5. O jogo pede para se liberar no **Firewall** (aparece o aviso do Windows pedindo permissão: clique em **Sim**). Ele cria uma regra valendo em **todas as redes**, inclusive a do Radmin, que o Windows costuma tratar como pública. Se você recusar, quando o Windows perguntar sobre o Firewall marque **redes privadas e públicas** e clique em **Permitir**.

**Toda vez que forem jogar:**
1. Todos ligam o **Radmin VPN** na mesma rede.
2. O anfitrião abre o atalho **Draft 100** e cria a sala.
3. Os amigos abrem o atalho **Draft 100**. A janela acha o jogo do anfitrião e abre o navegador:
   - se houver **uma sala esperando**, já entra nela (a partir da segunda vez, com o nome lembrado, entra sem digitar nada);
   - se houver mais de uma, aparece a lista **Salas abertas agora** na tela inicial: é só clicar.
   - Se o amigo abrir antes do anfitrião, a janela fica esperando e o navegador abre sozinho quando o anfitrião abrir o jogo.
4. O anfitrião deixa a janela preta aberta enquanto jogam. No PC dos amigos, a janela pode ser fechada depois que o navegador abriu.

Quem não tem o .exe (celular, outro PC) continua entrando pelo link: na sala, **Copiar link** já sai com o IP do Radmin (ex.: `http://26.12.34.56:3000/?sala=ABCDE`).

**Se o amigo não achar o anfitrião:** confira se os dois estão online na mesma rede do Radmin e se o Firewall do anfitrião liberou o **Draft 100** (Painel de Controle → Firewall do Windows Defender → Permitir um aplicativo → marque Privada e Pública). Se mesmo assim não achar, crie no PC do amigo o arquivo `Documentos\Draft100\anfitriao.txt` com o IP do Radmin do anfitrião (ex.: `26.12.34.56`). Depois da primeira conexão o IP fica lembrado.

**Se dois PCs virarem anfitrião sem querer**, a tela inicial avisa *"Fulano também está com o Draft 100 aberto na rede"* com um botão para ir para o jogo dele. Na janela de espera do amigo, apertar **A** faz aquele PC ser o anfitrião só desta vez (útil se o anfitrião oficial não puder jogar).

**Trocar de papel:** Menu Iniciar → **Draft 100 - trocar modo**.

**Atualizar (você faz uma vez e vale para todos):**
- O jogo em si (regras, jogadores, telas) roda no PC do anfitrião. Atualizou o seu, **todo mundo já joga a versão nova** — os amigos jogam no navegador, no seu jogo. Quem estiver com a página aberta vê *"O jogo foi atualizado. Recarregando…"* e a página se recarrega sozinha.
- **Com o GitHub configurado** (veja *Atualização 100% automática* abaixo): o seu Draft 100 procura versão nova ao abrir e, se ficar ligado, a cada 30 minutos — **só troca quando ninguém está numa sala**, para nunca derrubar uma partida. Depois se reabre sozinho, minimizado.
- **Sem GitHub:** baixe o `Draft100.exe` novo e dê duplo clique com o jogo fechado. Ele substitui a versão instalada e mantém atalho, modo e histórico.
- O `Draft100.exe` dos amigos se atualiza sozinho: quando ele acha o seu jogo e vê que o seu é mais novo, baixa a versão do seu PC, confere a assinatura oficial e se troca. Na tela aparece *"Atualizando... ✓ Atualizado para a versão X"*. Ninguém precisa mandar arquivo para ninguém.
- A versão aparece na tela inicial, ao lado de "Sem cadastro".

**"Não deu para atualizar" / "está aberto":** a partir da versão 1.3.1 o instalador fecha sozinho o Draft 100 que ficou aberto (às vezes numa janela minimizada esperando o anfitrião). Se ainda assim reclamar, dê duplo clique no **`Fechar Draft 100.bat`** (vem no zip junto com o .exe) e abra o `Draft100.exe` de novo. Ele roda o comando `taskkill /F /T /IM Draft100.exe`, que você também pode digitar direto no CMD.

**Desinstalar:** apague a pasta `%LOCALAPPDATA%\Draft100` e os atalhos. (O histórico e as configurações ficam em `Documentos\Draft100` até você apagar.)

O mesmo vale para quem está na mesma rede Wi-Fi: a descoberta automática também funciona na rede de casa.

### Jeito antigo (código-fonte com Node.js)

Também dá para rodar pela pasta do código: instale o **Node.js** (LTS) em https://nodejs.org e dê duplo clique em `iniciar.bat`. Funciona igual e usa a mesma pasta de histórico.

### Atualização 100% automática (configurar uma vez)

Depois disso, publicar uma versão nova é **um duplo clique** e chega sozinha em todo mundo:
`publicar.bat` → o GitHub gera e assina o `.exe` → o seu PC baixa e se reabre → os amigos baixam do seu PC.

1. Crie uma conta grátis no **GitHub** e um repositório (pode ser **público**: a chave de assinatura nunca vai para lá). Se for privado, o seu PC não consegue baixar as versões sem senha.
2. Envie esta pasta para o repositório (o `.gitignore` já deixa a chave de fora). Na pasta do jogo:
   `git remote add origin https://github.com/SEU-USUARIO/draft100.git` e depois `git push -u origin HEAD`.
3. No repositório: **Settings → Secrets and variables → Actions → New repository secret**, nome **`CHAVE_ATUALIZACAO`**, e cole **o conteúdo inteiro** do arquivo `build\chave-atualizacao.pem`. Só o GitHub Actions lê esse segredo; ninguém mais vê.
4. No `package.json`, preencha `"updateRepo": "SEU-USUARIO/draft100"`. Rode `publicar.bat` uma vez e instale o `.exe` que sair (aba **Releases** do repositório) no seu PC: a partir dele, o seu Draft 100 já sabe onde procurar as próximas versões.

Para lançar uma versão nova depois: duplo clique em **`publicar.bat`** → escolha *correção* ou *novidade*. Ele roda as partidas de teste (se algo quebrou, não publica), aumenta a versão, envia ao GitHub e em ~5 minutos o `.exe` novo está publicado. Sem GitHub configurado, o mesmo `publicar.bat` gera o `.exe` aqui mesmo em `dist\`.

O que **não** dá para automatizar: o Radmin VPN precisa estar ligado nos PCs (por padrão ele já abre com o Windows) e o seu PC precisa estar ligado para a turma jogar. Para não depender do seu PC, veja a Opção 2.

## Opção 2 — Deixar hospedado na internet 24 h

O jogo roda igual em qualquer servidor Linux (e por um link `https://…`, ninguém precisa de Radmin). Opções grátis (conferidas em nov/2026):

| Onde | Fica ligado sempre? | Guarda o histórico? | Cartão de crédito? |
|---|---|---|---|
| **Oracle Cloud "Always Free"** (recomendado) | Sim | Sim | Pede para verificar, não cobra |
| Google Cloud e2-micro | Sim | Sim | Pede; cobra se passar de 1 GB/mês de tráfego |
| Render (plano Free) | Dorme após 15 min sem uso | **Não** (perde ao dormir) | Não |
| Fly.io | Sim (dentro de US$ 5/mês de crédito) | Sim | Pede; cobra se passar do crédito |

**Oracle Cloud (24 h, grátis, com histórico):**
1. Crie a conta em https://www.oracle.com/cloud/free e uma máquina **Compute → Instance** com Ubuntu, formato *Always Free* (VM.Standard.E2.1.Micro ou Ampere A1).
2. Em **Networking → Virtual Cloud Network → Security List**, adicione uma regra de entrada TCP na porta **3000** vinda de `0.0.0.0/0`.
3. Entre na máquina por SSH e rode:
   `git clone https://github.com/SEU-USUARIO/draft100.git && cd draft100 && sudo bash deploy/instalar-servidor-linux.sh`
4. O script instala o Node, cria o serviço (liga sozinho se a máquina reiniciar) e mostra o link `http://IP:3000`. Para atualizar: `git pull` e rode o script de novo.
5. Atenção: a Oracle pode recuperar máquinas grátis que ficam **quase sem uso por 7 dias**. Se acontecer, crie outra e rode o script de novo (o histórico fica em `/var/lib/draft100/historico.json`: faça backup de vez em quando).

Com Docker (qualquer VPS ou Fly.io): `docker build -t draft100 .` e `docker run -d --restart unless-stopped -p 3000:3000 -v draft100-dados:/dados draft100`.

**Seu PC como servidor, mas sem Radmin:** o **Tailscale Funnel** (grátis) dá um link fixo `https://seu-pc.algum-nome.ts.net` que qualquer pessoa abre no navegador, sem instalar nada. Instale o Tailscale no seu PC e rode `tailscale funnel 3000` com o Draft 100 aberto.

### Render (mais fácil, mas dorme e não guarda histórico)

Todo mundo acessa por um link `https://…onrender.com`.

1. Crie uma conta grátis no **GitHub** e outra no **Render** (https://render.com). Pode entrar no Render com a conta do GitHub.
2. No GitHub, crie um repositório novo e envie **todos os arquivos desta pasta** (menos `node_modules`). Dá para fazer pelo site: *Add file → Upload files* e arrastar os arquivos e pastas.
3. No Render: **New → Blueprint** e escolha o repositório. O arquivo `render.yaml` já configura tudo. (Ou **New → Web Service**, com Build Command `npm install` e Start Command `node server.js`, plano **Free**.)
4. Espere o deploy terminar e abra o link que o Render gerar. Pronto: crie a sala e mande o link para a galera.

**Sobre o plano grátis do Render:** o servidor "dorme" depois de 15 minutos sem ninguém usando. O primeiro acesso depois disso demora por volta de 1 minuto para acordar. Quando ele dorme ou reinicia, as salas abertas se perdem. Durante a partida ele fica acordado normalmente.

Outras hospedagens que rodam Node.js com WebSocket também servem. O jogo usa a porta da variável `PORT` e a pasta da variável `DATA_DIR` automaticamente.

## Histórico e ranking da galera

O computador que roda o servidor guarda o resultado de **todas as partidas terminadas** em **`Documentos\Draft100\historico.json`** — fora da pasta do jogo. Atualizar, mover ou apagar o jogo **não apaga o ranking**. A janela preta mostra o caminho ao abrir.

- O ranking aparece na tela inicial, no lobby e no fim de cada partida, com títulos 🏆, finais disputadas, vitórias e derrotas, aproveitamento, temporadas jogadas e quantas vezes o MVP era do seu time. A tela inicial também mostra as últimas partidas.
- Cada técnico é reconhecido **pelo nome**, sem diferenciar maiúsculas e acentos. Por isso cada amigo precisa usar sempre o mesmo nome.
- Bots não entram no ranking (mas as vitórias contra eles contam).
- **Vindo da versão antiga (pasta com `iniciar.bat`)?** Copie o arquivo `data\historico.json` dela para `Documentos\Draft100` com o jogo fechado. Rodando a versão nova pelo `iniciar.bat` na mesma pasta, isso acontece sozinho.
- Para zerar o ranking, apague `Documentos\Draft100\historico.json` com o jogo fechado. Para fazer backup, copie esse arquivo.
- Para usar outra pasta, defina a variável de ambiente `DATA_DIR`.
- Hospedado no Render (plano grátis), o arquivo fica em `data/` e some quando o servidor reinicia ou dorme. Para guardar histórico, o ideal é rodar no seu PC.

## Ranking dos jogadores da NBA

Na tela inicial e no fim de cada partida, o ranking tem duas abas: **Técnicos** (a galera) e **Jogadores da NBA**. A segunda soma tudo o que cada jogador fez em todas as partidas em que foi escolhido no leilão:

- **Escolhido:** quantas vezes foi comprado (ou recebido no fim do leilão);
- **Jogos, PTS, REB, AST, ROU (roubos) e TOC (tocos)** somados (temporada e playoffs) e a média de pontos por jogo;
- **🏆** quantas vezes estava no time campeão, **MVP** quantas vezes foi o MVP, e o **preço médio** pago no leilão.

*Por versão* separa cada temporada (Kobe Bryant '06, Kobe Bryant '08…); *Por jogador* soma todas as versões. Dá para ordenar por pontos, mais escolhidos, pontos por jogo, rebotes, assistências, roubos, tocos ou títulos. Entram os jogadores dos técnicos e dos bots da sala; os times de lendas do 82-0 e os agentes livres não entram. Fica salvo no mesmo `historico.json` (só partidas jogadas a partir da versão 1.5.0).

## Rodando no Mac/Linux

```bash
npm install
npm start
```

---

## Regras rápidas

- **Quantos jogadores vão a leilão:** 60% a mais do que o número de vagas, arredondado para dar a **mesma quantidade em cada posição** (PG, SG, SF, PF e C). Exemplos com elenco de 5: 2 técnicos (10 vagas) → 20 jogadores, 4 de cada posição; 4 técnicos (20 vagas) → 35 jogadores, 7 de cada posição. Bots contam como técnicos. O leilão termina quando todos completam o elenco. O número aparece no lobby e durante o leilão ("Jogador 3 de 20").
- **Modo Lendas da franquia:** quando o líder começa, o jogo **sorteia a ordem de escolha**, e cada técnico escolhe a sua franquia na vez dele (30 segundos; se o tempo acabar, o jogo escolhe por ele). A tela mostra quantas lendas cada time tem e as 3 melhores. Depois, cada técnico só recebe lendas da franquia que escolheu (quem pega os Lakers só vê lendas dos Lakers; times antigos contam para a franquia atual, como Sonics → Thunder e Nets de New Jersey → Brooklyn). Não há disputa: os lotes se alternam entre os técnicos, e só o dono decide se **contrata pelo preço fixo** (pelo overall; versões de MVP custam um pouco mais) ou passa. **Lendas mais fracas que o seu time custam menos**: abaixo da média do seu elenco, 40% de desconto; 4 pontos abaixo, 65%; 8 pontos abaixo, US$ 1M. E uma lenda que não supera a média do seu time **sempre cabe no seu caixa** (o preço cai para o que você tem), então ninguém fica sem dinheiro para completar o elenco. Estrelas continuam com preço cheio. Para compensar, o caixa é menor: **US$ 60M** com elenco de 5, US$ 75M com 8 e US$ 85M com 10. Cada técnico recebe a mesma proporção de ofertas (elenco de 5 → 10 lendas, 2 por posição). Cada franquia tem de 13 a 18 lendas diferentes.
- **Sorteio dos jogadores:** a cada partida os jogadores são sorteados da lista escolhida, então cada leilão é diferente. As lendas têm versões de temporadas diferentes (ex.: Jordan '85, '88, '91, '92, '93, '96, '97, '98 e '03), e só uma versão de cada jogador entra por leilão. Jogadores com overall maior têm um pouco mais de chance de aparecer. O jogo **lembra os últimos 4 leilões**: quem foi ofertado há pouco tem menos chance de voltar, e a mesma versão de uma lenda menos ainda (as repetições da partida anterior caem pela metade).
- **Atributos:** nenhum jogador passa de **98** em nenhum atributo. Só o **atributo principal** (o da 1ª característica) de quem foi **MVP da temporada** chega a **100**, e o de quem foi **MVP das Finais** chega a **99**, jogando na posição dele. O número que aparece no card é exatamente o que vale na simulação.
- **MVP da temporada 🏆:** a versão do ano em que ele foi MVP ganha **+7 na característica principal** e fica com **100** no atributo principal (Kobe '08 em pontuação, Curry '16 na bola de 3, Russell '62 na proteção de aro…). Na NBA Atual, o MVP de 2025-26 é o Shai Gilgeous-Alexander. Todos os MVPs desde 1956 têm a versão do ano.
- **MVP das Finais 🥇:** a versão do ano em que ele foi MVP das Finais ganha um bônus um pouco menor (**+4,5**) e fica com **99** no atributo principal (Magic '80, Duncan '99, Iguodala '15, Brown '24…). Quem foi os dois no mesmo ano (Jordan '91, '96 e '98, por exemplo) fica com o do MVP (100) e os dois selos. Na NBA Atual, o MVP das Finais de 2026 é o Jalen Brunson. Todos os MVPs das Finais desde 1969 têm a versão do ano.
- **Arenas:** quando o líder começa, cada técnico recebe uma arena histórica por sorteio (Chicago Stadium dos Bulls de Jordan, The Forum do Showtime, Boston Garden, Oracle Arena…). Não repete, não dá para trocar: o que caiu, caiu. Toda arena dá um bônus diferente, que vale em todos os jogos do seu time. As lendárias dão bônus maiores e as comuns, menores, mas nenhuma tem ônus. Os níveis são Lendária, Histórica, Tradicional e Comum.
- **Orçamento:** US$ 100M por técnico. Lance mínimo de US$ 1M. É preciso guardar US$ 1M para cada vaga ainda aberta, então todo mundo consegue completar o elenco.
- **Ordem do jogo:** lobby → **arenas** (todos veem as 32 arenas e os bônus e clicam em *Pronto*) → **sorteio das arenas** → **leilão de cartas de reforço** → **leilão de jogadores** → **cartas** (aplicar o reforço e escolher a carta de jogo) → **ajuste do time** (todos clicam em *Pronto*) → temporada.
- **Cartas de reforço 🃏:** antes dos jogadores, vão a leilão cartas que melhoram um jogador do seu time. São menos cartas do que técnicos (4 técnicos → 3 cartas; 8 → 6), e **cada técnico só pode comprar uma**. O dinheiro sai do **mesmo caixa** do leilão de jogadores (é preciso guardar US$ 1M para cada vaga do elenco). Depois do leilão de jogadores, quem comprou escolhe **um único jogador** do seu elenco para receber a carta (a tela mostra como ele fica antes de confirmar). Vale para o jogo todo e não dá para trocar. Bots aplicam sozinhos no jogador que mais ganha.
  - ⬆️ **Evolução:** +3 de overall (até 99), então todos os atributos sobem.
  - 🏋️ **Treino de fundamentos:** +10 nos 2 atributos mais baixos do jogador.
  - 🎯 **Especialista:** +12 no atributo da 1ª característica e +6 no da 2ª (Pontuador: +7 nos três arremessos).
  - 🔄 **Versatilidade:** ganha uma posição vizinha à sua escolha (um PG vira PG/SG) e joga nela **sem perder rendimento**.
  - 🧬 **Nova característica:** ganha uma característica à sua escolha, que entra como a 2ª mais forte dele, com +8 no atributo dela (se ele já tinha 3, a 3ª sai).
  - Nenhum reforço passa do teto de 98 (o 100 do MVP e o 99 do MVP das Finais continuam valendo). Medido em milhares de jogos simulados, cada carta aumenta a chance de vitória de **4 a 7 pontos percentuais**; a Versatilidade rende mais quando você precisa escalar alguém fora de posição.
- **Pronto:** as arenas só são sorteadas e os jogos só começam quando **todos os jogadores presentes** clicarem em *Pronto*. Bots já estão sempre prontos, e quem caiu da sala não trava o jogo.
- **Lote:** um jogador por vez. Quando o cronômetro zera, o maior lance leva. Se alguém der lance com **menos de 3 segundos** no relógio, ele volta para 3 segundos. Se todos passarem, o lote fecha na hora.
- **Posicionar o jogador comprado:** quem ganha um lote escolhe na hora onde ele joga, na **Minha quadra** (PG na cabeça do garrafão, SF e SG nas alas, PF e C dos lados do garrafão, e o banco embaixo quando o elenco tem mais de 5). Passando o mouse em cada posição aparece se ele joga na posição de origem ou quanto perde fora dela. **O leilão só continua quando o técnico posiciona o jogador.** Durante o leilão não dá para mexer em quem já foi colocado; os ajustes ficam para depois das cartas, na Prancheta, que tem a mesma quadra: clique num jogador e depois no lugar para trocar. Bots se posicionam sozinhos, e quem cair da sala tem o jogador posicionado automaticamente.
- **Passar:** quem clica em *Passar* não pode mais dar lance naquele jogador, por mais que a disputa continue entre os outros.
- **Sem lances / vagas abertas:** quem ninguém comprou fica sem time. Se o leilão acabar e algum técnico ainda tiver vaga aberta, ela é completada de graça com o **pior jogador disponível daquela posição** (e o banco com os piores que sobraram). No modo Lendas da franquia, vêm as piores lendas da posição de qualquer time. Ou seja: vale mais arriscar no leilão do que esperar.
- **Dinheiro que sobra não vale nada.** Ganha quem gastou melhor.
- **Atalhos no leilão:** `1`, `2`, `5`, `0` (+10) para dar lance e `P` para passar.
- **Características:** cada jogador tem até 3 características pelas quais é conhecido, em ordem de força. A 1ª (★) pesa mais, a 2ª um pouco menos e a 3ª menos ainda. Exemplo: Wilt Chamberlain é *Reboteiro* → *Pontuador* → *Jogo de garrafão*, então pega muitos rebotes e também pontua, mas o rebote é o forte dele. As características mudam o jogo de verdade: quem chuta, que tipo de arremesso, quem dá a assistência, quem pega o rebote, quem dá o toco e quem cresce no fim do jogo.
  - 🎯 Bola de 3 · 🌀 Meia distância · ⚡ Infiltrador · 🏋️ Jogo de garrafão · 🔥 Pontuador · 🪄 Passe mágico · 🧲 Reboteiro · 🛡️ Defesa/roubos · ✋ Protetor de aro · ❄️ Decisivo
- **Escalação:** na Prancheta você escolhe quem joga em cada posição (PG, SG, SF, PF, C). Cada jogador tem suas posições de origem (o LeBron, por exemplo, joga de SF, PF e PG). Fora delas ele perde rendimento: **−8** de overall numa posição vizinha, **−16** a duas posições de distância e **−24 ou mais** além disso. O botão *Escalação automática* monta o melhor quinteto. Os reservas entram na rotação na posição em que rendem mais.
- **Esquema ofensivo:** *Chuva de 3*, *Garrafão*, *Showtime* e *Isolação* dão bônus de acordo com quantos jogadores em quadra têm as características certas (o medidor de **Encaixe** mostra quanto). Se ninguém em quadra encaixa, o esquema funciona igual ao *Equilibrado*: **sem bônus e sem ônus**.
  - Chuva de 3 → 🎯 Bola de 3
  - Garrafão → 🏋️ Jogo de garrafão, ⚡ Infiltrador, 🧲 Reboteiro
  - Showtime → 🪄 Passe mágico, ⚡ Infiltrador, 🛡️ Defesa
  - Isolação → 🔥 Pontuador, 🌀 Meia distância, ❄️ Decisivo
- **Defesa:** *Zona* fecha o garrafão, mas libera a bola de 3. Rende mais com ✋ protetores de aro e 🧲 reboteiros. *Pressão* força erros, mas comete mais faltas, e rende mais com 🛡️ defensores. *Individual* é a marcação padrão.
- **Cartas de jogo:** depois do leilão, cada técnico escolhe **uma** carta, sem troca:
  - 🧃 **Isotônico** (verde, 4 min): o time corre mais. Atacantes ganham +4% de acerto, e cada defensor, protetor de aro ou reboteiro em quadra tira 1,2% do acerto do adversário (até 3,5%). Mais contra-ataques.
  - 🛡️ **Escudo** (cinza, 4 min): adversário com −3,5% de acerto e +2% de erros forçados.
  - 🎯 **Mira** (vermelha, 3 min): arremessadores natos (Bola de 3 e Meia distância) ganham +6% nos chutes de 3 e de meia distância, arriscam chutes mais difíceis, e +3% nos outros.
  - Em cada jogo a carta pode ser ativada **uma vez**, pelo botão na Prancheta. As cartas dos dois times podem ficar ativas ao mesmo tempo, no mesmo quarto. Se você não ativar, ela entra sozinha nos 3 minutos finais do 4º quarto.
- **Ritmo:** *Cadenciado* dá arremessos melhores e menos posses. *Acelerado* gera mais posses, mais contra-ataques e mais erros.
- Tudo na Prancheta pode ser mudado durante o jogo e vale a partir da próxima posse de bola.
- **Empate:** prorrogação de 5 minutos, quantas forem necessárias.
- **Camisas na quadra:** na Minha quadra e na Prancheta cada jogador aparece com a camisa do time e do número daquela versão (LeBron '16 com a do Cavaliers, LeBron atual com a do Lakers). Versões de **2014 a 2017** usam a camisa **com manga** daquela época; as outras, a regata padrão. Contorno vermelho = fora de posição.
- **Pegando fogo 🔥 / congelado 🧊:** acontece sozinho, ninguém escolhe nem ativa. Quem acerta **4 arremessos seguidos** (já com 12 pontos no jogo) pega fogo: +6% de acerto, pede mais a bola e ainda atrapalha o ataque adversário (−1,5% no acerto deles). O fogo apaga **no primeiro erro** (ou depois de uns 3 minutos sem cestas novas). Quem erra **5 seguidos** congela: −7% de acerto e arrisca menos, até **acertar** de novo. Aparece na quadra, no placar e no lance a lance.
- **Pedido de tempo ⏸️:** cada técnico tem **1 por jogo**, pelo botão na Prancheta. O jogo para por alguns segundos e o adversário perde o ritmo: a corrida dele zera, quem estava pegando fogo esfria e o time dele erra mais nas 6 posses seguintes (−3,5% de acerto e mais erros de passe). Use quando o outro time engatar uma corrida (a Prancheta avisa: "o adversário está numa corrida de 9-0!"). Corridas de 8-0 ou mais deixam o time **embalado** (+2% de acerto) até o adversário pontuar.
- **Bola decisiva ⏱️:** nos últimos 36 segundos do 4º quarto (ou da prorrogação), se o time com a bola estiver empatado ou até 3 pontos atrás, o jogo para. Quem ataca escolhe **quem arremessa**; quem defende escolhe **quem marca**, sem saber a escolha do outro (15 segundos; sem escolha, o jogo escolhe o melhor). O arremessador tenta o melhor arremesso para a situação (atrás por 3, só vale a de três), e a chance depende do ataque dele contra a defesa do marcador, da característica ❄️ Decisivo, de 🛡️ defensores e de quem está pegando fogo ou congelado. O resultado aparece na tela e o tempo acaba ali: se empatar, vai para a prorrogação. Bots escolhem na hora.
- **Modo 82-0:** escolha *82-0* em "Formato do campeonato". Vira uma **liga de 30 times como a NBA**: os times da sala e, nas franquias que ninguém pegou, **times de lendas daquela franquia** (Lendas do Celtics, Lendas do Lakers…). Um jogador pode aparecer num time da sala e também no time de lendas, sem problema. A força dos times de lendas acompanha a dos times do leilão: as franquias mais históricas ficam um pouco acima, as outras um pouco abaixo, para os times da sala brigarem por vaga.
  - **Temporada regular:** 82 jogos para cada time, simulados rodada após rodada sem lance a lance, com a tabela ao vivo dividida em **Leste e Oeste** (vitórias, derrotas, aproveitamento e sequência), quem ainda está invicto e os jogos dos times da sala. A Prancheta continua valendo a partir da próxima rodada. O líder pode pausar (e também no play-in e nos playoffs, pelo botão ⏸ *Pausar*).
  - **Play-in:** 7º x 8º (quem vence é o 7º), 9º x 10º (quem perde sai) e o perdedor do primeiro contra o vencedor do segundo pela vaga do 8º, em cada conferência.
  - **Playoffs:** 16 times, chaveamento da NBA (1x8, 4x5, 3x6, 2x7), **séries melhor de 7** com mando 2-2-1-1-1 para a melhor campanha, semifinais e finais de conferência, e as **Finais da NBA** entre o campeão do Leste e o do Oeste. O chaveamento aparece na tela.
  - **Jogos dos técnicos da sala no play-in e nos playoffs são ao vivo**, lance a lance, com Prancheta, carta, pedido de tempo e bola decisiva. Jogos só entre times de lendas e bots são simulados na hora e aparecem no chaveamento. O botão do líder acelera o jogo ao vivo, como nos outros formatos.
  - Campeão é quem vence as Finais (pode ser um time de lendas!). Quem terminar a temporada regular **82-0** ganha a faixa de *temporada perfeita*.
- O **líder da sala** (quem criou) escolhe as regras, pode pausar o leilão, fechar um lote e acelerar rodadas. Na temporada, no play-in e nos playoffs ele também tem o botão **⏸ Pausar**: os jogos ao vivo, os intervalos e os cronômetros (pedido de tempo, bola decisiva) param até ele clicar em **▶ Continuar**. Se ele cair, outro jogador vira líder.
- Se a internet cair ou a página for atualizada, é só abrir o mesmo link: você volta para o seu time.

## Editando os jogadores

A lista está em `public/data.js`. Cada linha é:

```js
['Nome do Jogador', 'POSIÇÕES', OVERALL, 'CARACTERÍSTICAS', 'NÚMERO', ANO, 'TIME DA ÉPOCA'],
// exemplo:
['Wilt Chamberlain', 'C', 96, 'RXG', '13', 1962, 'PHW'],
```

- Posições: `PG`, `SG`, `SF`, `PF`, `C`, separadas por `/` (a primeira é a principal)
- Overall: de 60 a 99
- Características, **em ordem de força**: `S` bola de 3, `M` meia distância, `I` infiltrador, `G` jogo de garrafão, `X` pontuador, `P` passe mágico, `R` reboteiro, `D` defesa/roubos, `B` protetor de aro, `C` decisivo
- Número, ano e time da época são opcionais e aparecem na camisa do card

## Fotos dos jogadores (opcional)

O jogo não vem com fotos. Cada jogador aparece com uma camisa nas cores do time, com o número e, nas lendas, o ano. Se quiser usar imagens suas, coloque-as na pasta `Documentos\Draft100\fotos` (criada na primeira vez que o jogo abre) com o nome do jogador em minúsculas e com hífens (ex.: `michael-jordan.jpg`, `lebron-james-13.png`). O jogo usa a imagem no lugar da camisa automaticamente.

Os overalls são uma estimativa própria do jogo e podem ser ajustados à vontade. Depois de editar, reinicie o servidor (ou faça um novo deploy).

## Gerando o Draft100.exe (para quem mexe no código)

**Guarde bem o arquivo `build\chave-atualizacao.pem`** e não mande para ninguém nem suba no GitHub (ele já está no `.gitignore`). É a "assinatura" que faz o .exe dos amigos aceitar as atualizações vindas do seu PC — sem ela, um .exe gerado continua funcionando, mas os amigos não se atualizam sozinhos com ele. Se pedir mudanças ao Claude num chat novo, mande também esse arquivo junto com o código.

Precisa do Node.js 22 no PC. Na pasta do jogo: `npm install`, depois na pasta `build`: `npm install` e `node build-exe.js` (ou duplo clique em `build\gerar-exe.bat`). O arquivo sai em `dist\Draft100.exe`. Antes de gerar uma versão nova, aumente o número em `"version"` no `package.json` — é ele que aparece no jogo e na instalação.
