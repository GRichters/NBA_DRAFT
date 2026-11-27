/* Draft 100 — cliente */
(() => {
  const D = window.DATA;
  const TEAM = Object.fromEntries(D.TEAMS.map((t) => [t.id, t]));
  const socket = io({ transports: ['websocket', 'polling'] });

  // ---------- estado local ----------
  let S = null;          // estado da sala vindo do servidor
  let ME = null;         // meu id de técnico
  let SPEC = false;      // espectador
  let roomCode = null;
  let curPhase = null;
  let selectedGame = null;
  let lot = { endsAt: 0, dur: 10000, pid: null, bid: 0 };
  let lastResultKey = null;
  let chatOpen = false, unread = 0;
  let muted = localStorage.getItem('d100_muted') === '1';
  let token = localStorage.getItem('d100_token');
  if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('d100_token', token); }

  // ---------- encaixe na tela ----------
  // O layout foi pensado para ~1560px de largura. Em telas menores (ou com escala do Windows em 125%/150%),
  // a página inteira é reduzida para caber igual em todo mundo. Dá para ajustar na mão no topo (− Auto +).
  const DESIGN_W = 1560, DESIGN_H = 900;
  let zoomPref = localStorage.getItem('d100_zoom') || 'auto';
  let zoomNow = 1;
  function fitScreen() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let z = 1;
    if (vw >= 900) {
      if (zoomPref === 'auto') {
        z = Math.min(1, vw / DESIGN_W, Math.max(0.8, vh / DESIGN_H));
        z = Math.max(0.6, Math.round(z * 100) / 100);
      } else z = Number(zoomPref) || 1;
    }
    zoomNow = z;
    document.body.style.zoom = z === 1 ? '' : String(z);
    document.documentElement.style.setProperty('--app-h', (vh / z) + 'px');
    const eff = vw / z; // largura efetiva em pixels do layout
    document.body.classList.toggle('w-md', eff <= 1500);
    document.body.classList.toggle('w-sm', eff <= 1180);
    const zv = document.querySelector('.zoom-ctl .zv');
    if (zv) zv.textContent = zoomPref === 'auto' ? `Auto ${Math.round(z * 100)}%` : `${Math.round(z * 100)}%`;
  }
  function setZoom(delta) {
    if (delta === 'auto') zoomPref = 'auto';
    else zoomPref = String(Math.max(0.5, Math.min(1.3, Math.round((zoomNow + delta) * 100) / 100)));
    localStorage.setItem('d100_zoom', zoomPref);
    fitScreen();
  }
  window.addEventListener('resize', fitScreen);
  fitScreen();

  // ---------- utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLONES = {};
  const P = (id) => {
    if (S && S.boosted && S.boosted[id]) return S.boosted[id]; // com carta de reforço aplicada
    if (D.PLAYERS[id]) return D.PLAYERS[id];
    if (S && S.extra && S.extra[id]) return S.extra[id];
    if (typeof id === 'string' && id.startsWith('c:')) {
      const b = D.PLAYERS[D.baseId(id)];
      if (b) return CLONES[id] || (CLONES[id] = { ...b, id });
    }
    return { id, name: '?', pos: '-', ovr: 0, tags: '' };
  };
  // técnicos da sala e, no 82-0, os times de lendas da liga
  const M = (id) => (S ? S.managers.find((m) => m.id === id) || (S.season && S.season.cpu ? S.season.cpu[id] : null) : null);
  const me = () => M(ME);
  const isHost = () => S && ME && S.hostId === ME;
  const money = (n) => `US$ ${n}M`;
  const teamOf = (mid) => { const m = M(mid); return m ? TEAM[m.team] : null; };
  const chip = (teamId, cls = '') => {
    const t = TEAM[teamId];
    if (!t) return '';
    return `<span class="tchip ${cls}" style="background:${t.c1};--c2:${t.c2}" title="${esc(t.city + ' ' + t.name)}">${t.id}</span>`;
  };
  const mchip = (mid, cls) => { const m = M(mid); return m ? chip(m.team, cls) : ''; };
  const mname = (mid) => { const m = M(mid); return m ? esc(m.name) : '—'; };
  const shortName = (n) => { const p = n.replace(/ '\d\d$/, '').split(' '); return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : n; };

  // ---------- visual do jogador ----------
  let FOTOS = new Set();
  const slug = (n) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/'(\d\d)$/, '-$1').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  fetch('/fotos.json').then((r) => r.json()).then((l) => { FOTOS = new Set(l); }).catch(() => {});
  function fotoOf(p) {
    const s = slug(p.name);
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) if (FOTOS.has(`${s}.${ext}`)) return `fotos/${s}.${ext}`;
    return null;
  }
  function jerseyColors(p) {
    if (p.team) { const t = TEAM[p.team] || D.OLD_TEAMS[p.team]; if (t) return t; }
    if (S) { const owner = S.managers.find((m) => m.roster.includes(p.id)); if (owner) return TEAM[owner.team]; }
    return { c1: '#25314a', c2: '#ff7a1a' };
  }
  function jersey(p, size = 120) {
    const c = jerseyColors(p);
    const num = p.num || p.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
    const light = /^#(f|e|d)/i.test(c.c1);
    const fg = light ? '#111' : '#fff';
    const foto = fotoOf(p);
    const svg = `<svg viewBox="0 0 120 130" width="${size}" height="${size * 130 / 120}" aria-hidden="true">
      <path d="M32 6 Q60 26 88 6 L104 12 Q100 34 108 46 L104 124 Q60 130 16 124 L12 46 Q20 34 16 12 Z" fill="${c.c1}" stroke="${c.c2}" stroke-width="4"/>
      <path d="M32 6 Q60 30 88 6" fill="none" stroke="${c.c2}" stroke-width="6"/>
      <text x="60" y="${p.num ? 88 : 82}" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="${p.num ? (String(num).length > 1 ? 52 : 58) : 40}" fill="${fg}" stroke="${c.c2}" stroke-width="1.5">${esc(num)}</text>
    </svg>`;
    const year = p.year ? `<span class="jy">${p.year}</span>` : '';
    return `<div class="jersey" style="width:${size}px">${foto ? `<img src="${esc(foto)}" alt="">` : svg}${year}</div>`;
  }
  const ARENA = (id) => D.ARENAS.find((a) => a.id === id);
  function arenaCard(a, opts = {}) {
    if (!a) return '';
    const c = D.arenaTeamColors(a);
    return `<div class="arena tier-${a.tier} ${opts.compact ? 'compact' : ''}" style="--a1:${c.c1};--a2:${c.c2}">
      <div class="arena-top"><span class="arena-tier">${D.ARENA_TIERS[a.tier]}</span><span class="arena-team">${esc(a.team)}</span></div>
      <div class="arena-name">${esc(a.name)}</div>
      <div class="arena-era">${esc(a.era)}</div>
      <div class="arena-buff">✚ ${esc(D.arenaText(a))}</div>
    </div>`;
  }
  // ---------- quadra (escalação visual) ----------
  const COURT_XY = { PG: [50, 20], SF: [15, 49], SG: [85, 49], PF: [28, 82], C: [72, 82] };
  function initials(name) {
    const w = name.replace(/ '\d\d$/, '').split(/\s+/).filter((x) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(x));
    if (!w.length) return '?';
    const a = w[0][0], b = w.length > 1 ? w[w.length - 1][0] : (w[0][1] || '');
    return (a + b).toUpperCase();
  }
  // camisa da quadra: regata padrão; versões de 2014 a 2017 usam a camisa com manga daquela época
  const SLEEVE_YEARS = [2014, 2017];
  function courtJersey(p) {
    const c = jerseyColors(p);
    const light = /^#(f|e|d)/i.test(c.c1);
    const fg = light ? '#111' : '#fff';
    const num = String(p.num != null && p.num !== '' ? p.num : initials(p.name));
    const sleeve = p.year >= SLEEVE_YEARS[0] && p.year <= SLEEVE_YEARS[1];
    const body = sleeve
      ? 'M34 6 Q50 20 66 6 L84 11 L99 33 L86 41 L83 37 L86 104 Q50 110 14 104 L17 37 L14 41 L1 33 L16 11 Z'
      : 'M31 4 Q50 24 69 4 L80 6 Q79 26 93 34 L90 104 Q50 110 10 104 L7 34 Q21 26 20 6 Z';
    const trim = sleeve
      ? `<path d="M34 6 Q50 22 66 6" fill="none" stroke="${c.c2}" stroke-width="5"/><path d="M1 33 L14 41 M99 33 L86 41" stroke="${c.c2}" stroke-width="5"/>`
      : `<path d="M31 4 Q50 26 69 4" fill="none" stroke="${c.c2}" stroke-width="5"/><path d="M80 6 Q79 26 93 34 M20 6 Q21 26 7 34" fill="none" stroke="${c.c2}" stroke-width="4"/>`;
    const fs = num.length > 2 ? 30 : num.length > 1 ? 40 : 46;
    return `<svg viewBox="0 0 100 110" aria-hidden="true"><path d="${body}" fill="${c.c1}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>${trim}
      <text x="50" y="${sleeve ? 76 : 74}" text-anchor="middle" font-family="Bebas Neue, Impact, sans-serif" font-size="${fs}" fill="${fg}" stroke="${c.c2}" stroke-width="1.2">${esc(num)}</text></svg>`;
  }
  const COURT_SVG = `<svg class="court-lines" viewBox="0 0 500 400" preserveAspectRatio="none" aria-hidden="true">
    <rect x="4" y="4" width="492" height="392" fill="none"/>
    <rect x="180" y="250" width="140" height="146"/>
    <circle cx="250" cy="250" r="60"/>
    <path d="M30 396 L30 300 A 225 225 0 0 1 470 300 L470 396"/>
    <path d="M222 386 L278 386" stroke-width="5"/>
    <circle cx="250" cy="370" r="10" class="rim"/>
    <path d="M215 370 A 35 35 0 0 1 285 370"/>
  </svg>`;
  // modos: 'view' (só ver), 'place' (escolher onde vai o jogador comprado), 'edit' (trocar posições)
  function courtHTML(m, opts = {}) {
    const lu = m.lineup || {};
    const heat = opts.heat || {};
    const t = TEAM[m.team] || { c1: '#333', c2: '#fff' };
    const pend = opts.pending ? P(opts.pending) : null;
    const selPid = opts.sel ? (opts.sel[0] === 'b' && opts.sel !== 'bench' ? (lu.bench || [])[+opts.sel.slice(1)] : lu[opts.sel]) : null;
    const selP = selPid ? P(selPid) : null;
    const tipFor = (p, slot) => {
      if (!p) return '';
      if (slot === 'bench') return `<span class="ct ok">Banco: entra na rotação</span>`;
      const pen = D.posPenalty(p, slot);
      return pen ? `<span class="ct bad">−${pen} fora de posição → ${p.ovr - pen}</span>` : `<span class="ct ok">✓ posição de origem · ${p.ovr}</span>`;
    };
    const spot = (key, pid, slotForPen, style, cls) => {
      const p = pid ? P(pid) : null;
      const pen = p && slotForPen !== 'bench' ? D.posPenalty(p, slotForPen) : 0;
      let click = false, tip = '';
      if (opts.mode === 'place' && !p) {
        const okBench = slotForPen !== 'bench' || opts.canBench;
        click = okBench; tip = okBench ? tipFor(pend, slotForPen) : '<span class="ct bad">Complete a quadra primeiro</span>';
      }
      if (opts.mode === 'edit') {
        click = !!p || !!selP;
        if (selP && key !== opts.sel) tip = tipFor(selP, slotForPen);
        else if (!selP && p) tip = '<span class="ct">Clique para trocar</span>';
      }
      const label = p ? `<span class="cs-name">${esc(shortName(p.name))}</span><span class="cs-ovr ${pen ? 'bad' : ''}">${p.ovr - pen}${pen ? ` (−${pen})` : ''}</span>` : `<span class="cs-name muted">${slotForPen === 'bench' ? 'banco' : D.POS_LABELS[slotForPen]}</span>`;
      return `<${click ? 'button' : 'div'} class="cspot ${cls} ${p ? 'filled' : 'empty'} ${pen ? 'bad' : ''} ${p && heat[p.id] ? heat[p.id] : ''} ${click ? 'clickable' : ''} ${opts.sel === key ? 'sel' : ''} ${opts.mode === 'place' && !p ? 'target' : ''}" ${click ? `data-cslot="${key}"` : ''} style="${style}">
        ${p ? `<span class="cjersey" title="${esc(p.name)}${p.year ? ' · ' + p.year : ''}">${courtJersey(p)}</span>` : `<span class="cball" style="--b1:${t.c1};--b2:${t.c2}">${slotForPen === 'bench' ? '+' : slotForPen}</span>`}
        ${p && heat[p.id] ? `<span class="chot">${heat[p.id] === 'fire' ? '🔥' : '🧊'}</span>` : ''}
        ${p && slotForPen !== 'bench' ? `<span class="cpos">${slotForPen}</span>` : ''}
        ${label}${tip ? `<span class="ctip">${tip}</span>` : ''}
      </${click ? 'button' : 'div'}>`;
    };
    const court = D.POS_ORDER.map((k) => spot(k, lu[k], k, `left:${COURT_XY[k][0]}%;top:${COURT_XY[k][1]}%`, 'oncourt')).join('');
    const cap = Math.max(0, (opts.benchCap != null ? opts.benchCap : m.roster.length - 5));
    let bench = '';
    if (cap > 0) {
      const b = lu.bench || [];
      bench = `<div class="cbench"><span class="cb-l">Banco</span>${Array.from({ length: cap }, (_, i) => spot(b[i] ? 'b' + i : 'bench', b[i], 'bench', '', 'onbench')).join('')}</div>`;
    }
    return `<div class="court ${opts.mode || 'view'}"><div class="court-floor">${COURT_SVG}${court}</div>${bench}</div>`;
  }

  // quadro com as posições do jogador: onde ele joga sem perder nada e quanto rende em cada uma
  function posInfoHTML(p, slot) {
    if (!p) return '';
    const chips = D.POS_ORDER.map((k) => {
      const pen = D.posPenalty(p, k);
      return `<span class="pchip ${pen ? 'bad' : 'ok'} ${slot === k ? 'here' : ''}" title="${D.POS_LABELS[k]}"><b>${k}</b> ${pen ? `${p.ovr - pen} <small>−${pen}</small>` : `${p.ovr} ✓`}</span>`;
    }).join('');
    const here = slot && slot !== 'bench' ? (D.posPenalty(p, slot) ? `Agora de <b>${slot}</b>: perde ${D.posPenalty(p, slot)} (rende ${p.ovr - D.posPenalty(p, slot)}).` : `Agora de <b>${slot}</b>: posição de origem.`) : slot ? 'Agora no banco.' : '';
    return `<div class="posinfo"><div class="pi-top">${mainTrait(p)} <b>${esc(p.name)}</b> <span class="muted">· ${p.ovr} · joga de</span> <b class="pi-pos">${posStr(p).split('/').map((x) => `${x} (${D.POS_LABELS[x]})`).join(', ')}</b></div>
      <div class="pi-chips">${chips}</div>${here ? `<div class="muted small">${here}</div>` : ''}</div>`;
  }
  const slotPid = (lu, k) => (k && k[0] === 'b' && k !== 'bench' ? (lu.bench || [])[+k.slice(1)] : lu[k]);

  const W_LABEL = ['Principal', 'Secundária', 'Terciária'];
  function traitsHTML(p, full) {
    const t = (p.tags || '').split('').filter((c) => D.TRAITS[c]);
    if (!t.length) return '<span class="muted small">Sem característica marcante</span>';
    return t.map((c, i) => `<span class="trait t${i}" title="${W_LABEL[i] || ''}">${i === 0 ? '★ ' : ''}${D.TRAITS[c].icon} ${D.TRAITS[c].label}${full && i > 0 ? '' : ''}</span>`).join('');
  }
  const mainTrait = (p) => { const c = (p.tags || '')[0]; return c && D.TRAITS[c] ? D.TRAITS[c].icon : ''; };
  const posStr = (p) => (p.positions || [p.pos]).join('/');

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => toast('Link copiado! Mande para os amigos.'));
    }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Link copiado! Mande para os amigos.'); } catch (e) { toast('Copie o link manualmente.'); }
    ta.remove();
  }

  // ---------- sons ----------
  let actx = null;
  function beep(freq, dur = 0.08, type = 'sine', vol = 0.06, delay = 0) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      const t0 = actx.currentTime + delay;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* sem áudio */ }
  }
  const sfx = {
    bid: () => beep(880, 0.07, 'triangle'),
    outbid: () => { beep(520, 0.1, 'square', 0.04); beep(390, 0.12, 'square', 0.04, 0.1); },
    sold: () => { beep(660, 0.1, 'triangle'); beep(990, 0.18, 'triangle', 0.06, 0.1); },
    mine: () => { beep(660, 0.1, 'triangle'); beep(880, 0.1, 'triangle', 0.06, 0.1); beep(1320, 0.25, 'triangle', 0.06, 0.2); },
    tick: () => beep(1200, 0.03, 'sine', 0.03),
    buzzer: () => beep(180, 0.6, 'sawtooth', 0.05),
    three: () => beep(1046, 0.06, 'triangle', 0.035),
  };

  // ---------- SVGs ----------
  const BALL = `<svg class="ball" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="bg" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffa04d"/><stop offset="1" stop-color="#d9580a"/></radialGradient></defs><circle cx="32" cy="32" r="29" fill="url(#bg)" stroke="#2a1405" stroke-width="2.5"/><path d="M32 3v58M3 32h58M12 11c9 8 9 34 0 42M52 11c-9 8-9 34 0 42" fill="none" stroke="#2a1405" stroke-width="2.5"/></svg>`;
  const TROPHY = `<svg class="trophy" viewBox="0 0 120 140" aria-hidden="true"><defs><linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".45" stop-color="#ffe58a"/><stop offset="1" stop-color="#c7920f"/></linearGradient></defs><circle cx="60" cy="26" r="20" fill="url(#gold)"/><path d="M42 20c8 4 28 4 36 0M40 30c10 5 30 5 40 0M60 6v40" stroke="#9a6d06" stroke-width="1.6" fill="none"/><path d="M44 48h32l-6 52H50z" fill="url(#gold)"/><path d="M44 48h32" stroke="#9a6d06" stroke-width="2"/><rect x="40" y="100" width="40" height="10" rx="2" fill="url(#gold)"/><rect x="32" y="110" width="56" height="22" rx="3" fill="#2a2a2a" stroke="url(#gold)" stroke-width="2"/></svg>`;

  // ---------- conexão ----------
  let autoJoin = false;
  socket.on('connect', () => {
    if (!roomCode) return;
    const name = localStorage.getItem('d100_name') || '';
    socket.emit('join', { code: roomCode, name, token }, (res) => {
      if (!res || !res.ok) {
        if (!autoJoin) toast(res ? res.error : 'Não foi possível reconectar.', true);
        autoJoin = false;
        goHome();
        return;
      }
      autoJoin = false;
      enterRoom(res, name);
    });
  });
  // o anfitrião reabriu o jogo numa versão nova: recarrega a página para pegar as telas e regras novas
  let serverVersion = null;
  socket.on('hello', ({ v } = {}) => {
    if (serverVersion && v && v !== serverVersion) { toast('O jogo foi atualizado. Recarregando…'); setTimeout(() => location.reload(), 800); return; }
    serverVersion = v || serverVersion;
  });
  socket.on('disconnect', () => { if (roomCode) toast('Conexão perdida… tentando reconectar.', true); });

  socket.on('state', (st) => {
    const prev = S;
    S = st;
    handleAuctionFx(prev, st);
    render();
  });

  socket.on('tick', ({ games }) => {
    if (!S || !S.season) return;
    for (const g of games) {
      const m = S.season.matches.find((x) => x.id === g.id);
      if (!m) continue;
      m.s = g.s; m.t = g.t; m.q = g.q; m.done = g.done; m.lead = g.lead; m.cards = g.cards;
      m.heat = g.heat; m.to = g.to; m.hold = g.hold; m.ch = g.ch; m.last = g.last; m.run = g.run; m.rx = performance.now();
      m.plays.push(...g.plays);
      if (m.plays.length > 80) m.plays.splice(0, m.plays.length - 80);
      if (g.id === selectedGame) {
        appendPlays(g.plays, m);
        renderScoreboard();
        if (g.plays.some((p) => p.kind === 'three')) sfx.three();
        if (g.done) sfx.buzzer();
      }
    }
    renderTicker();
    if (games.some((g) => S.season.matches.find((x) => x.id === g.id && x.teams.includes(ME)))) { renderCardBox(); renderTimeoutBox(); renderTactics(); renderClutch(); }
    for (const g of games) for (const p of g.plays) if (p.kind === 'clutch' && S.season.matches.find((x) => x.id === g.id && x.teams.includes(ME))) sfx.buzzer();
  });

  socket.on('bidFx', ({ mid }) => {
    if (mid !== ME) sfx.bid();
  });

  socket.on('chatHistory', (list) => {
    $('#chatLog').innerHTML = '';
    list.forEach(addChat);
    unread = 0; updateBadge();
  });
  socket.on('chat', (msg) => {
    addChat(msg);
    if (!chatOpen && !msg.sys) { unread++; updateBadge(); }
  });
  socket.on('kicked', () => { toast('Você foi removido da sala.', true); goHome(); });

  function enterRoom(res, name) {
    ME = res.id; SPEC = !!res.spectator; roomCode = res.code;
    localStorage.setItem('d100_room', res.code);
    localStorage.setItem('d100_name', name);
    history.replaceState(null, '', '?sala=' + res.code);
    if (SPEC && !enterRoom.warned) { enterRoom.warned = true; toast('A partida já começou — você está assistindo.'); }
  }

  function goHome() {
    S = null; ME = null; roomCode = null; curPhase = null; selectedGame = null;
    localStorage.removeItem('d100_room');
    history.replaceState(null, '', location.pathname);
    $('#chatLog').innerHTML = '';
    render();
  }

  // ---------- render principal ----------
  function render() {
    if (!S) {
      $('#topbar').classList.add('hidden');
      $('#chat').classList.add('hidden');
      if (curPhase !== 'home') { curPhase = 'home'; $('#screen').classList.remove('wide'); renderHome(); }
      return;
    }
    $('#topbar').classList.remove('hidden');
    $('#chat').classList.remove('hidden');
    renderTopbar();
    if (S.phase !== curPhase) {
      curPhase = S.phase;
      $('#screen').classList.toggle('wide', S.phase === 'season');
      ({ lobby: buildLobby, teampick: buildTeamPick, arenas: buildArenas, draw: buildDraw, cards: buildCards, auction: buildAuction, season: buildSeason, end: buildEnd })[S.phase]();
      window.scrollTo(0, 0);
    }
    ({ lobby: updateLobby, teampick: updateTeamPick, arenas: updateArenas, draw: updateDraw, cards: updateCards, auction: updateAuction, season: updateSeason, end: updateEnd })[S.phase]();
  }

  function renderTopbar() {
    const m = me();
    const phaseLbl = { lobby: 'Sala de espera', teampick: 'Escolha das franquias', arenas: 'Arenas', draw: 'Sorteio das arenas', cards: 'Cartas', auction: 'Leilão', season: 'Temporada', end: 'Fim de jogo' }[S.phase];
    $('#topbar').innerHTML = `
      <div class="logo">${BALL}<span>DRAFT <b>100</b></span></div>
      <span class="pill phase-pill">${phaseLbl}</span>
      <div class="top-info">
        <span class="pill code-pill">Sala <b>${esc(S.code)}</b></span>
        ${m ? `<span class="pill me-pill">${chip(m.team)} ${esc(m.name)}</span>` : '<span class="pill me-pill">Assistindo</span>'}
        ${m && S.phase === 'auction' ? `<span class="pill">Caixa <b style="color:var(--green)">${money(m.budget)}</b></span>` : ''}
        <span class="zoom-ctl" title="Tamanho da tela"><button id="zoomOut" title="Diminuir">−</button><span class="zv"></span><button id="zoomIn" title="Aumentar">+</button><button id="zoomAuto" title="Automático">↺</button></span>
        <button class="btn sm ghost" id="muteBtn" title="Som">${muted ? '🔇' : '🔊'}</button>
        <button class="btn sm ghost" id="leaveBtn">Sair</button>
      </div>`;
    $('#zoomOut').onclick = () => setZoom(-0.05);
    $('#zoomIn').onclick = () => setZoom(0.05);
    $('#zoomAuto').onclick = () => setZoom('auto');
    fitScreen();
    $('#muteBtn').onclick = () => { muted = !muted; localStorage.setItem('d100_muted', muted ? '1' : '0'); renderTopbar(); };
    $('#leaveBtn').onclick = () => {
      const go = () => { socket.emit('leave'); goHome(); };
      if (S.phase === 'lobby') return go();
      askConfirm({ title: 'Sair da sala?', text: 'Você pode voltar depois pelo mesmo link enquanto a sala existir.', ok: 'Sair', danger: true }).then((yes) => { if (yes) go(); });
    };
  }

  // ---------- HISTÓRICO / RANKING (salvo no computador do servidor) ----------
  function loadRanking(cb) {
    fetch('/api/historico').then((r) => r.json()).then(cb).catch(() => {});
  }
  // ranking dos jogadores da NBA escolhidos no leilão (por versão ou somando as versões)
  let atlView = 'versao', atlSort = 'pts';
  const ATL_SORTS = [['pts', 'Pontos'], ['picks', 'Mais escolhidos'], ['ppg', 'Pontos por jogo'], ['reb', 'Rebotes'], ['ast', 'Assistências'], ['stl', 'Roubos'], ['blk', 'Tocos'], ['titles', 'Títulos']];
  function atletasHTML(data) {
    let list = (data.atletas || []).slice();
    if (!list.length) return '<div class="empty-note">Ainda não há jogadores no ranking. Ele aparece depois da primeira partida terminada.</div>';
    if (atlView === 'jogador') {
      const g = {};
      for (const a of list) {
        const k = a.ident || a.name;
        const x = g[k] || (g[k] = { name: a.name.replace(/ '\d\d$/, ''), versions: [], picks: 0, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, titles: 0, mvps: 0, spent: 0, team: a.team });
        x.versions.push(a.year ? "'" + String(a.year).slice(2) : 'atual');
        for (const f of ['picks', 'gp', 'pts', 'reb', 'ast', 'stl', 'blk', 'titles', 'mvps']) x[f] += a[f];
        x.spent += a.avgPrice * a.picks;
      }
      list = Object.values(g).map((x) => ({ ...x, avgPrice: x.picks ? x.spent / x.picks : 0 }));
    }
    const key = (a) => (atlSort === 'ppg' ? (a.gp ? a.pts / a.gp : 0) : a[atlSort] || 0);
    list.sort((a, b) => key(b) - key(a) || b.picks - a.picks);
    const pg = (v, gp) => (gp ? (v / gp).toFixed(1) : '—');
    const rows = list.slice(0, 40).map((a, i) => {
      const ver = atlView === 'jogador' ? `<span class="muted small">${a.versions.length > 1 ? a.versions.length + ' versões' : a.versions[0]}</span>` : '';
      return `<tr><td>${i + 1}</td><td><div class="tmc">${a.team && (TEAM[a.team] || D.OLD_TEAMS[a.team]) ? chip(TEAM[a.team] ? a.team : D.franchiseOf(a.team)) : ''}<span class="nm">${esc(a.name)}</span>${ver}</div></td>
        <td class="n"><b>${a.picks}</b></td><td class="n">${a.gp}</td><td class="n"><b>${a.pts}</b></td><td class="n">${pg(a.pts, a.gp)}</td>
        <td class="n">${a.reb}</td><td class="n">${a.ast}</td><td class="n">${a.stl}</td><td class="n">${a.blk}</td>
        <td class="n">${a.titles || ''}</td><td class="n">${a.mvps || ''}</td><td class="n">${money(Math.round(a.avgPrice))}</td></tr>`;
    }).join('');
    return `<div class="atl-ctl"><div class="seg sm">${[['versao', 'Por versão'], ['jogador', 'Por jogador']].map(([v, l]) => `<button data-atlv="${v}" class="${atlView === v ? 'on o' : ''}">${l}</button>`).join('')}</div>
      <label class="muted small">Ordenar por <select data-atls class="field sel">${ATL_SORTS.map(([v, l]) => `<option value="${v}" ${atlSort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="scroll-x"><table class="tbl rank atl"><thead><tr><th>#</th><th>Jogador</th><th class="n" title="Vezes que foi escolhido no leilão">Escolhido</th><th class="n" title="Jogos disputados">Jogos</th><th class="n">PTS</th><th class="n" title="Pontos por jogo">PTS/J</th><th class="n">REB</th><th class="n">AST</th><th class="n" title="Roubos de bola">ROU</th><th class="n">TOC</th><th class="n" title="Títulos">🏆</th><th class="n" title="MVP da temporada">MVP</th><th class="n" title="Preço médio no leilão">Preço</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="muted small" style="margin-top:6px">Totais somando todas as partidas em que o jogador foi escolhido (temporada e playoffs). Times de lendas do 82-0 não entram.</div>`;
  }
  // painel de ranking com abas Técnicos / Jogadores
  function rankBoxHTML(data, opts = {}) {
    const tab = opts.tab || 'tecnicos';
    return `<div class="seg rank-tabs">${[['tecnicos', 'Técnicos'], ['jogadores', 'Jogadores da NBA']].map(([v, l]) => `<button data-rtab="${v}" class="${tab === v ? 'on o' : ''}">${l}</button>`).join('')}</div>
      <div class="rank-body">${tab === 'jogadores' ? atletasHTML(data) : rankingHTML(data, opts)}</div>`;
  }
  function mountRankBox(el, data, opts = {}) {
    if (!el) return;
    let tab = opts.tab || 'tecnicos';
    const draw = () => {
      el.innerHTML = rankBoxHTML(data, { ...opts, tab });
      el.querySelectorAll('[data-rtab]').forEach((b) => { b.onclick = () => { tab = b.dataset.rtab; draw(); }; });
      el.querySelectorAll('[data-atlv]').forEach((b) => { b.onclick = () => { atlView = b.dataset.atlv; draw(); }; });
      const sel = el.querySelector('[data-atls]');
      if (sel) sel.onchange = () => { atlSort = sel.value; draw(); };
    };
    draw();
  }
  function rankingHTML(data, opts = {}) {
    const list = (data.players || []).slice(0, opts.limit || 10);
    if (!list.length) return '<div class="empty-note">Ainda não há partidas terminadas. O ranking aparece aqui depois do primeiro campeão.</div>';
    const pct = (x) => Math.round(x * 100) + '%';
    let html = `<table class="tbl rank"><thead><tr><th>#</th><th>Técnico</th><th class="n" title="Títulos">🏆</th><th class="n" title="Finais disputadas">Finais</th><th class="n">V-D</th><th class="n">Aprov.</th>${opts.compact ? '' : '<th class="n" title="Temporadas jogadas">Temp.</th><th class="n" title="Vezes em que o MVP era do seu time">MVPs</th>'}</tr></thead><tbody>${list.map((p, i) => `
      <tr class="${S && me() && D.TEAMS && p.name.toLowerCase() === me().name.toLowerCase() ? 'me' : ''}"><td>${i + 1}</td><td><div class="tmc">${p.fav ? chip(p.fav) : ''}<span class="nm">${esc(p.name)}</span></div></td>
      <td class="n"><b>${p.titles}</b></td><td class="n">${p.finals}</td><td class="n">${p.wins}-${p.losses}</td><td class="n">${pct(p.pct)}</td>
      ${opts.compact ? '' : `<td class="n">${p.seasons}</td><td class="n">${p.mvps}</td>`}</tr>`).join('')}</tbody></table>`;
    if (opts.games && (data.games || []).length) {
      const fmtD = (d) => { try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch (e) { return ''; } };
      html += `<div class="last-games"><div class="muted small" style="font-weight:800;letter-spacing:1px;margin:12px 0 6px">ÚLTIMAS PARTIDAS</div>${data.games.slice(0, opts.games).map((g) => `
        <div class="lg">${chip(g.champion.team)} <b>${esc(g.champion.name)}</b> <span class="muted">campeão · ${g.managers.length} técnicos · ${fmtD(g.date)}${g.mvp ? ` · MVP ${esc(g.mvp.player)}` : ''}</span></div>`).join('')}</div>`;
    }
    return html;
  }

  // ---------- HOME ----------
  function renderHome() {
    const params = new URLSearchParams(location.search);
    const code = (params.get('sala') || '').toUpperCase();
    const savedName = localStorage.getItem('d100_name') || '';
    $('#screen').innerHTML = `
      <div class="home">
        <div id="netBanner" class="net-banner hidden"></div>
        <div class="hero">
          <div class="ball-big">${BALL}</div>
          <h1>DRAFT <span>100</span></h1>
          <p class="sub">O leilão da NBA para jogar com os amigos. Cada técnico tem <b>US$ 100 milhões</b> para montar o elenco no lance a lance. Depois, a temporada é simulada ao vivo — e você muda a tática durante o jogo.</p>
          <div class="steps">
            <div class="step"><div class="n">1</div><b>Crie a sala</b><p>Mande o link. De 2 a 16 técnicos, cada um com uma franquia. Complete com bots.</p></div>
            <div class="step"><div class="n">2</div><b>Leilão ao vivo</b><p>Um jogador por vez, cronômetro rodando. Maior lance leva. Dinheiro que sobra não vale nada.</p></div>
            <div class="step"><div class="n">3</div><b>Temporada</b><p>Pontos corridos, playoffs ou os dois. Jogos simulados lance a lance até o título.</p></div>
          </div>
        </div>
        <div class="panel join-card">
          <div><label for="nm">Seu nome de técnico</label><input id="nm" class="field" maxlength="20" placeholder="Ex.: Phil Jackson do Grajaú" value="${esc(savedName)}" /></div>
          <button class="btn primary lg" id="createBtn">Criar sala</button>
          <div class="or">ou entre numa sala</div>
          <div class="row"><input id="code" class="field code-input grow" maxlength="5" placeholder="CÓDIGO" value="${esc(code)}" /><button class="btn lg" id="joinBtn">Entrar</button></div>
          <div id="openRooms" class="open-rooms hidden"></div>
          <p class="muted small" style="margin:0">Sem cadastro. Funciona no celular e no computador.<span id="appVer">${appVersion ? ` · v${esc(appVersion)}` : ''}</span></p>
        </div>
      </div>
      <section class="panel hidden" id="homeRank" style="margin-top:8px"><div class="panel-h"><h3>Ranking</h3><span class="muted small">salvo no computador que roda o jogo · use sempre o mesmo nome</span></div><div class="panel-b" id="homeRankB"></div></section>`;
    loadRanking((d) => { if ((d.players || []).length && $('#homeRankB')) { $('#homeRank').classList.remove('hidden'); mountRankBox($('#homeRankB'), d, { games: 5 }); } });
    const nm = $('#nm');
    if (!savedName) nm.focus();
    const getName = () => {
      const n = nm.value.trim();
      if (!n) { toast('Digite seu nome de técnico.', true); nm.focus(); return null; }
      return n;
    };
    $('#createBtn').onclick = () => {
      const name = getName(); if (!name) return;
      socket.emit('create', { name, token }, (res) => {
        if (!res || !res.ok) return toast(res ? res.error : 'Erro ao criar sala.', true);
        enterRoom(res, name);
      });
    };
    const join = () => {
      const name = getName(); if (!name) return;
      const c = $('#code').value.trim().toUpperCase();
      if (c.length < 4) return toast('Digite o código da sala.', true);
      socket.emit('join', { code: c, name, token }, (res) => {
        if (!res || !res.ok) return toast(res ? res.error : 'Erro ao entrar.', true);
        enterRoom(res, name);
      });
    };
    $('#joinBtn').onclick = join;
    homeNet = { join };
    refreshHomeNet();
    $('#code').onkeydown = (e) => { if (e.key === 'Enter') join(); };
    nm.onkeydown = (e) => { if (e.key === 'Enter') ($('#code').value.trim() ? join() : $('#createBtn').click()); };
  }

  // salas abertas neste servidor + aviso de outro anfitrião na rede (só no próprio PC)
  let homeNet = null;
  function refreshHomeNet() {
    if (curPhase !== 'home' || !homeNet) return;
    fetch('/api/salas').then((r) => r.json()).then((list) => {
      const box = $('#openRooms'); if (!box) return;
      box.classList.toggle('hidden', !list.length);
      box.innerHTML = `<div class="or">salas abertas agora</div>` + list.map((r) => `
        <button class="open-room" data-code="${esc(r.codigo)}">
          <b>${esc(r.codigo)}</b><span>${esc(r.lider)} · ${r.tecnicos} técnico${r.tecnicos === 1 ? '' : 's'}</span>
          <em>${r.fase === 'lobby' ? 'Entrar' : 'Assistir'}</em>
        </button>`).join('');
      box.querySelectorAll('[data-code]').forEach((b) => { b.onclick = () => { $('#code').value = b.dataset.code; homeNet.join(); }; });
    }).catch(() => {});
    if (isLocalHost()) fetch('/api/rede').then((r) => r.json()).then((hosts) => {
      const ban = $('#netBanner'); if (!ban) return;
      const h = hosts[0];
      ban.classList.toggle('hidden', !h);
      if (!h) return;
      const n = (h.salas || []).length;
      ban.innerHTML = `<span>📡 <b>${esc(h.pc)}</b> também está com o Draft 100 aberto na rede${n ? ` (${n} sala${n > 1 ? 's' : ''})` : ''}. Para jogarem juntos, todos precisam estar no mesmo PC anfitrião.</span><a class="btn primary" href="${esc(h.url)}">Ir para o jogo dele</a>`;
    }).catch(() => {});
  }
  setInterval(refreshHomeNet, 4000);

  // janela de confirmação dentro do jogo (no lugar do confirm() do navegador, que o Chrome pode bloquear)
  function askConfirm({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false, icon = '' }) {
    return new Promise((resolve) => {
      const old = $('#gameModal');
      if (old) old.remove();
      const wrap = document.createElement('div');
      wrap.id = 'gameModal';
      wrap.className = 'gm-ov';
      wrap.innerHTML = `<div class="gm-box" role="dialog" aria-modal="true">
        ${icon ? `<div class="gm-ic">${icon}</div>` : ''}
        <div class="gm-t">${esc(title)}</div>
        ${text ? `<div class="gm-x">${text}</div>` : ''}
        <div class="gm-b"><button class="btn ghost" data-gm="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-gm="1">${esc(ok)}</button></div>
      </div>`;
      const close = (v) => { document.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(true); }
      };
      wrap.onclick = (e) => {
        const b = e.target.closest('[data-gm]');
        if (b) close(b.dataset.gm === '1');
        else if (e.target === wrap) close(false);
      };
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-gm="1"]').focus();
    });
  }

  // ---------- LOBBY ----------
  const SETTINGS_UI = [
    { k: 'pool', label: 'Jogadores', opts: [['atual', 'NBA Atual'], ['lendas', 'Lendas'], ['mix', 'Atual + Lendas'], ['franquia', 'Lendas da franquia']], hint: (v) => v === 'franquia' ? 'Cada técnico só recebe lendas do time que escolheu (Lakers → só lendas dos Lakers). Sem disputa: preço fixo e menos dinheiro.' : '' },
    { k: 'rosterSize', label: 'Jogadores por elenco', opts: [[5, '5'], [8, '8'], [10, '10']], hint: (v) => v === 5 ? 'Só titulares: cada lance pesa mais.' : `5 titulares + ${v - 5} reservas que entram na rotação.` },
    { k: 'bidTime', label: 'Cronômetro do lance', opts: [[8, '8s'], [10, '10s'], [15, '15s']], hint: () => 'Se alguém der lance com menos de 3s no relógio, ele volta para 3s. Quem passa num jogador não pode mais dar lance nele.' },
    { k: 'format', label: 'Formato do campeonato', opts: [['liga', 'Pontos corridos'], ['playoffs', 'Mata-mata'], ['ambos', 'Os dois'], ['oitenta', '82-0']], hint: (v) => v === 'ambos' ? 'Temporada regular e depois playoffs com os melhores.' : v === 'liga' ? 'Todos contra todos. Quem vencer mais é campeão.' : v === 'oitenta' ? 'Temporada de 82 jogos entre os times do leilão, simulada em sequência com a tabela ao vivo. Dá para fazer 82-0?' : 'Chaveamento sorteado, jogo único até a final.' },
    { k: 'turns', label: 'Turnos da temporada', opts: [[1, 'Turno único'], [2, 'Ida e volta']], show: (s) => s.format !== 'playoffs' && s.format !== 'oitenta' },
    { k: 'speed', label: 'Velocidade das partidas', opts: [['rapido', 'Rápida (~1 min)'], ['normal', 'Normal (~2 min)'], ['lento', 'Lenta (~3 min)']] },
  ];

  let lanInfo = null;
  let appVersion = '';
  const isLocalHost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  fetch('/info').then((r) => r.json()).then((d) => {
    appVersion = d.version || '';
    if ($('#appVer') && appVersion) $('#appVer').textContent = ` · v${appVersion}`;
    if (!isLocalHost()) return;
    lanInfo = d;
    if (S && S.phase === 'lobby') { curPhase = null; render(); }
  }).catch(() => {});

  function shareLink() {
    if (isLocalHost() && lanInfo && lanInfo.addresses.length) {
      const a = lanInfo.addresses[0];
      return { url: `http://${a.address}:${location.port || 80}${location.pathname}?sala=${S.code}`, note: a.radmin ? 'Link pelo Radmin VPN' : `Link pela rede local (${a.name})` };
    }
    return { url: `${location.origin}${location.pathname}?sala=${S.code}`, note: null };
  }

  const FRANCHISE_COUNT = (() => {
    const c = {};
    const seen = new Set();
    for (const id of D.POOLS.lendas) {
      const p = D.PLAYERS[id];
      const f = D.franchiseOf(p.team);
      const key = f + '|' + D.identity(p);
      if (seen.has(key)) continue;
      seen.add(key);
      c[f] = (c[f] || 0) + 1;
    }
    return c;
  })();

  function lotsInfoHTML() {
    const n = S.managers.length, r = S.settings.rosterSize;
    if (S.settings.pool === 'franquia') {
      const per = D.lotsFor(r);
      return `<div class="set"><label>Jogadores no leilão</label><div class="lots-box"><b>${per}</b> lendas da sua franquia serão oferecidas para você <span class="muted">(para ${r} vagas · ${per / 5} por posição)</span></div><div class="hint">Os lotes se alternam entre os técnicos. Só o dono da franquia decide: contratar pelo preço fixo ou passar. <b>Vaga que ficar aberta é completada com as piores lendas da posição (de qualquer time)</b>: vale mais contratar do que esperar.</div></div>`;
    }
    const total = D.lotsFor(n * r);
    return `<div class="set"><label>Jogadores no leilão</label><div class="lots-box"><b>${total}</b> jogadores serão ofertados <span class="muted">(${n * r} vagas: ${r} por técnico × ${n} · ${total / 5} por posição)</span></div><div class="hint">60% mais jogadores do que vagas, com a mesma quantidade de PG, SG, SF, PF e C. O leilão termina quando todos completarem o elenco. <b>Quem não completar recebe de graça os piores jogadores de cada posição vazia</b>: vale mais arriscar do que esperar.</div></div>`;
  }

  function buildLobby() {
    const sl = shareLink();
    const link = sl.url;
    $('#screen').innerHTML = `
      <div class="panel share">
        <div><div class="muted small" style="font-weight:700;letter-spacing:1px">CÓDIGO DA SALA</div><div class="big-code">${esc(S.code)}</div></div>
        <div class="link">${sl.note ? esc(sl.note) + ' — mande' : 'Mande'} este link para os amigos entrarem:<br><b style="color:var(--text)">${esc(link)}</b>${isLocalHost() && !sl.note ? '<br><span style="color:var(--orange2)">Você está em localhost: troque pelo IP do Radmin ao mandar.</span>' : ''}</div>
        <button class="btn primary" id="copyBtn">Copiar link</button>
      </div>
      <div class="lobby">
        <section class="panel col-mgrs">
          <div class="panel-h"><h3>Técnicos <span id="mcount" class="muted"></span></h3><button class="btn sm" id="addBot">+ Bot</button></div>
          <div class="panel-b"><div id="mgrList" class="mgr-list"></div></div>
          <div class="panel-b" style="border-top:1px solid var(--line)">
            <div class="row"><input id="renameIn" class="field grow" maxlength="20" placeholder="Mudar meu nome" /><button class="btn sm" id="renameBtn">OK</button></div>
          </div>
          <div class="panel-h" style="border-top:1px solid var(--line)"><h3>Ranking</h3><span class="muted small">todas as partidas</span></div>
          <div class="panel-b" id="lobbyRank"><div class="empty-note">Carregando…</div></div>
        </section>
        <section class="panel col-teams">
          <div class="panel-h"><h3>Escolha sua franquia</h3><span class="muted small" id="teamHint">Cada técnico representa um time</span></div>
          <div class="panel-b"><div id="teamGrid" class="team-grid"></div></div>
        </section>
        <section class="panel col-set">
          <div class="panel-h"><h3>Regras</h3><span id="setNote" class="muted small"></span></div>
          <div class="panel-b settings" id="settings"></div>
          <div class="panel-b" style="border-top:1px solid var(--line);display:grid;gap:8px">
            <button class="btn green lg" id="startBtn">Começar leilão</button>
            <div id="startNote" class="muted small" style="text-align:center"></div>
          </div>
        </section>
      </div>`;
    $('#copyBtn').onclick = () => copyText(link);
    loadRanking((d) => { if ($('#lobbyRank')) $('#lobbyRank').innerHTML = rankingHTML(d, { compact: true, limit: 8 }); });
    $('#addBot').onclick = () => socket.emit('addBot');
    $('#startBtn').onclick = () => socket.emit('start', {}, (r) => { if (r && r.error) toast(r.error, true); });
    $('#renameBtn').onclick = () => { const v = $('#renameIn').value.trim(); if (v) { socket.emit('rename', { name: v }); localStorage.setItem('d100_name', v); $('#renameIn').value = ''; } };
    $('#renameIn').onkeydown = (e) => { if (e.key === 'Enter') $('#renameBtn').click(); };
    $('#mgrList').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) socket.emit('remove', { id: b.dataset.rm }); };
    $('#teamGrid').onclick = (e) => { const b = e.target.closest('[data-team]'); if (b && !b.disabled) socket.emit('team', { team: b.dataset.team }); };
    $('#settings').onclick = (e) => {
      const b = e.target.closest('[data-k]');
      if (!b || !isHost()) return;
      let v = b.dataset.v;
      if (/^\d+$/.test(v)) v = Number(v);
      socket.emit('settings', { [b.dataset.k]: v });
    };
  }

  function updateLobby() {
    const host = isHost();
    $('#mcount').textContent = `(${S.managers.length}/16)`;
    $('#addBot').classList.toggle('hidden', !host || S.managers.length >= 16);
    $('#mgrList').innerHTML = S.managers.map((m) => {
      const t = TEAM[m.team];
      const frm = S.settings.pool === 'franquia';
      return `<div class="mgr ${m.id === ME ? 'me' : ''}">
        ${frm ? '<span class="tchip" style="background:#2a3550">?</span>' : chip(m.team)}
        <div class="nm">${esc(m.name)}<div class="muted small">${frm ? 'franquia por sorteio' : esc(t.city + ' ' + t.name)}</div></div>
        <span class="tags">${m.id === S.hostId ? '<span class="tag host">Líder</span>' : ''}${m.isBot ? '<span class="tag bot">Bot</span>' : ''}${!m.isBot && !m.connected ? '<span class="tag off">Offline</span>' : ''}${m.id === ME ? '<span class="tag you">Você</span>' : ''}</span>
        ${host && m.id !== ME ? `<button class="btn sm ghost x" data-rm="${m.id}" title="Remover">✕</button>` : ''}
      </div>`;
    }).join('');
    const fr = S.settings.pool === 'franquia';
    $('#teamHint').textContent = fr ? 'A ordem de escolha é sorteada ao começar' : 'Cada técnico representa um time';
    const owners = fr ? {} : Object.fromEntries(S.managers.map((m) => [m.team, m]));
    $('#teamGrid').innerHTML = D.TEAMS.map((t) => {
      const o = owners[t.id];
      const mine = o && o.id === ME;
      return `<button class="team-tile ${mine ? 'mine' : ''}" data-team="${t.id}" style="--c1:${t.c1};--c2:${t.c2}" ${o && !mine || SPEC || S.settings.pool === 'franquia' ? 'disabled' : ''}>
        <span class="ab">${t.id}</span><span class="tn">${esc(t.city)}<br>${esc(t.name)}</span>
        ${S.settings.pool === 'franquia' ? `<span class="tn" style="color:var(--gold)">${FRANCHISE_COUNT[t.id] || 0} lendas</span>` : ''}
        ${o ? `<span class="owner">${mine ? 'Você' : esc(o.name)}</span>` : ''}
      </button>`;
    }).join('');
    $('#setNote').textContent = host ? 'Você é o líder' : 'Só o líder altera';
    $('#settings').innerHTML = SETTINGS_UI.filter((s) => !s.show || s.show(S.settings)).map((s) => {
      const v = S.settings[s.k];
      return `<div class="set"><label>${s.label}</label>
        <div class="seg ${host ? '' : 'ro'}">${s.opts.map(([ov, ol]) => `<button data-k="${s.k}" data-v="${ov}" class="${ov === v ? 'on o' : ''}">${ol}</button>`).join('')}</div>
        ${s.hint && s.hint(v) ? `<div class="hint">${esc(s.hint(v))}</div>` : ''}</div>`;
    }).join('') + lotsInfoHTML() + `
      <div class="set"><label>Arenas</label><div class="hint" style="margin:0">Quando o líder começar, cada técnico recebe uma arena histórica por sorteio, com um bônus para o time. Não repete e não dá para trocar: o que cair, caiu.</div></div>
      <div class="set"><label>Orçamento</label><div class="hint" style="margin:0">${S.settings.pool === 'franquia' ? `US$ ${D.FRANCHISE_BUDGET[S.settings.rosterSize]} milhões por técnico (menos dinheiro, porque não há disputa). Cada lenda tem preço fixo pelo overall; MVP custa um pouco mais.` : 'US$ 100 milhões por técnico. Lance mínimo US$ 1M; é preciso guardar US$ 1M para cada vaga ainda aberta.'}</div></div>`;
    const sb = $('#startBtn');
    sb.classList.toggle('hidden', !host);
    sb.disabled = S.managers.length < 2;
    $('#startNote').textContent = host
      ? (S.managers.length < 2 ? 'Precisa de pelo menos 2 técnicos — chame amigos ou adicione bots.' : `${S.managers.length} técnicos prontos · ${S.settings.pool === 'franquia' ? D.lotsFor(S.settings.rosterSize) + ' lendas para cada um' : D.lotsFor(S.managers.length * S.settings.rosterSize) + ' jogadores no leilão'}.`)
      : 'Aguardando o líder começar o leilão…';
  }

  // ---------- PRONTO ----------
  const presentHumans = () => S.managers.filter((m) => !m.isBot && m.connected);
  const amReady = () => (S.ready || []).includes(ME);
  function readyHTML(what) {
    const pres = presentHumans();
    const n = pres.filter((m) => (S.ready || []).includes(m.id)).length;
    return `<div class="ready-box">
      <div class="ready-list">${S.managers.map((m) => {
        const ok = m.isBot || (S.ready || []).includes(m.id) || !m.connected;
        const lbl = m.isBot ? 'bot' : !m.connected ? 'offline' : ok ? 'pronto' : 'aguardando';
        return `<span class="rd ${ok ? 'ok' : ''}">${chip(m.team)} ${esc(m.name)} <i>${ok ? '✓' : '…'} ${lbl}</i></span>`;
      }).join('')}</div>
      <div class="ready-act">${ME && !SPEC ? `<button class="btn ${amReady() ? '' : 'green'} lg" id="readyBtn">${amReady() ? 'Cancelar pronto' : `✓ Pronto${what ? ' ' + what : ''}`}</button>` : ''}
      <span class="muted small">${n}/${pres.length} prontos — começa quando todos os jogadores presentes estiverem prontos</span></div>
    </div>`;
  }
  function bindReady() {
    const b = $('#readyBtn');
    if (b) b.onclick = () => socket.emit('ready', { ready: !amReady() });
  }

  // ---------- ESCOLHA DAS FRANQUIAS (ordem sorteada) ----------
  const FRANCHISE_TOP = (() => {
    const by = {};
    for (const id of D.POOLS.lendas) {
      const p = D.PLAYERS[id];
      const f = D.franchiseOf(p.team);
      const k = D.identity(p);
      (by[f] = by[f] || {});
      if (!by[f][k] || p.ovr > by[f][k].ovr) by[f][k] = p;
    }
    const out = {};
    for (const [f, o] of Object.entries(by)) out[f] = Object.values(o).sort((a, b) => b.ovr - a.ovr);
    return out;
  })();
  let pickT = { wait: 0, ends: 0, total: 30000 };
  function buildTeamPick() {
    $('#screen').innerHTML = `
      <div class="draw-head">
        <h1 class="display">Escolha das franquias</h1>
        <p class="muted">A ordem foi sorteada. Na sua vez, escolha a franquia: você só vai receber as lendas dela no leilão.</p>
      </div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-b"><div id="pickOrder" class="pick-order"></div><div id="pickStatus" class="pick-status"></div></div></div>
      <div class="team-grid pick-grid" id="pickGrid"></div>`;
    $('#pickGrid').onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (!b || b.disabled) return;
      const t = TEAM[b.dataset.pick];
      askConfirm({ title: `${t.city} ${t.name}`, text: 'Escolher esta franquia? Não dá para trocar depois.', ok: 'Escolher' }).then((yes) => {
        if (yes) socket.emit('pickTeam', { team: b.dataset.pick }, (r) => { if (r && r.error) toast(r.error, true); });
      });
    };
  }
  function updateTeamPick() {
    const tp = S.teamPick;
    if (!tp) return;
    pickT = { wait: performance.now() + tp.waitMs, ends: performance.now() + tp.leftMs, total: tp.total };
    const curId = tp.done ? null : tp.order[tp.idx];
    const myTurn = curId === ME;
    $('#pickOrder').innerHTML = tp.order.map((mid, i) => {
      const m = M(mid);
      if (!m) return '';
      const done = i < tp.idx;
      const t = m.team && TEAM[m.team];
      return `<div class="po ${done ? 'done' : ''} ${mid === curId ? 'cur' : ''} ${mid === ME ? 'me' : ''}">
        <span class="po-n display">${i + 1}º</span><span class="po-name">${esc(m.name)}${m.isBot ? ' <span class="tag bot">Bot</span>' : ''}</span>
        ${t ? chip(m.team) + `<span class="small muted">${esc(t.name)}</span>` : mid === curId ? '<span class="small" style="color:var(--gold)">escolhendo…</span>' : '<span class="small muted">aguardando</span>'}
      </div>`;
    }).join('');
    const taken = Object.fromEntries(S.managers.filter((m) => m.team).map((m) => [m.team, m]));
    $('#pickGrid').innerHTML = D.TEAMS.map((t) => {
      const o = taken[t.id];
      const top = (FRANCHISE_TOP[t.id] || []).slice(0, 3);
      return `<button class="team-tile ${o && o.id === ME ? 'mine' : ''}" data-pick="${t.id}" style="--c1:${t.c1};--c2:${t.c2}" ${!myTurn || o ? 'disabled' : ''}>
        <span class="ab">${t.id}</span><span class="tn">${esc(t.city)} ${esc(t.name)}</span>
        <span class="tn" style="color:var(--gold)">${(FRANCHISE_TOP[t.id] || []).length} lendas</span>
        <span class="tops">${top.map((p) => `${esc(shortName(p.name))} <b>${p.ovr}</b>`).join('<br>')}</span>
        ${o ? `<span class="owner">${o.id === ME ? 'Você' : esc(o.name)}</span>` : ''}
      </button>`;
    }).join('');
    $('#pickGrid').classList.toggle('my-turn', myTurn);
    tickPick();
  }
  function tickPick() {
    if (!S || S.phase !== 'teampick' || !S.teamPick) return;
    const tp = S.teamPick;
    const el = $('#pickStatus');
    if (!el) return;
    if (tp.done) { el.innerHTML = '<b>Todos escolheram!</b> Indo para as arenas…'; return; }
    const cur = M(tp.order[tp.idx]);
    const now = performance.now();
    if (now < pickT.wait) { el.innerHTML = `A primeira escolha começa em <b>${Math.ceil((pickT.wait - now) / 1000)}s</b>`; return; }
    const left = Math.max(0, Math.ceil((pickT.ends - now) / 1000));
    el.innerHTML = cur && cur.id === ME
      ? `<b class="my-turn-txt">Sua vez!</b> Clique na franquia que você quer. <span class="muted">${left}s — se o tempo acabar, o jogo escolhe por você.</span>`
      : `Vez de <b>${cur ? esc(cur.name) : '—'}</b> · ${left}s`;
  }

  // ---------- ARENAS (antes do sorteio) ----------
  function buildArenas() {
    const tiers = ['S', 'A', 'B', 'C'];
    $('#screen').innerHTML = `
      <div class="draw-head">
        <h1 class="display">As arenas</h1>
        <p class="muted">Estas são todas as arenas que podem cair para você. Cada uma dá um bônus diferente para o seu time, sem ônus. O sorteio é automático, não repete e não tem troca.</p>
      </div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-b" id="readyArea"></div></div>
      ${tiers.map((t) => `<h3 class="tier-h display">${D.ARENA_TIERS[t]} <span class="muted small">${{ S: 'bônus maiores', A: 'bônus fortes', B: 'bônus médios', C: 'bônus menores' }[t]}</span></h3>
        <div class="arena-grid">${D.ARENAS.filter((a) => a.tier === t).map((a) => arenaCard(a, { compact: true })).join('')}</div>`).join('')}`;
  }
  function updateArenas() {
    $('#readyArea').innerHTML = readyHTML('para o sorteio');
    bindReady();
  }

  // ---------- CARTAS ----------
  let myCardChoice = null;
  function cardHTML(key, opts = {}) {
    const c = D.CARDS[key];
    return `<button class="pcard pc-${key} ${opts.sel ? 'sel' : ''} ${opts.small ? 'small' : ''}" data-card="${key}" ${opts.disabled ? 'disabled' : ''}>
      <span class="pc-icon">${c.icon}</span><span class="pc-name display">${c.label}</span>
      <span class="pc-dur">${Math.round(c.dur / 60)} min de efeito</span>
      ${opts.small ? '' : `<span class="pc-desc">${esc(c.desc)}</span>`}
    </button>`;
  }
  function buildCards() {
    myCardChoice = null; // nova partida: a escolha da partida anterior não vale mais
    $('#screen').innerHTML = `
      <div class="draw-head">
        <h1 class="display">Suas cartas</h1>
        <p class="muted">Quem comprou carta de reforço no leilão aplica agora em um jogador. E todo mundo escolhe uma carta de jogo: em cada jogo você pode ativá-la uma vez, pela Prancheta (se não ativar, ela entra sozinha nos 3 minutos finais do 4º quarto). Nada disso dá para trocar depois.</p>
      </div>
      <section class="panel boost-apply hidden" id="boostPanel" style="margin-bottom:18px"><div class="panel-h"><h3>Sua carta de reforço</h3><span class="muted small">aplique em um jogador do seu elenco · não dá para trocar</span></div><div class="panel-b" id="boostArea"></div></section>
      <h3 class="tier-h display">Carta de jogo <span class="muted small">escolha uma</span></h3>
      <div class="cards-row" id="cardRow">${Object.keys(D.CARDS).map((k) => cardHTML(k)).join('')}</div>
      <div class="panel" style="margin-top:18px"><div class="panel-h"><h3>Quem já escolheu</h3></div><div class="panel-b" id="cardStatus"></div></div>
      <section class="panel ${SPEC ? 'hidden' : ''}" style="margin-top:16px"><div class="panel-h"><h3>Seu elenco</h3></div><div class="panel-b"><div class="roster" id="cardRoster"></div></div></section>`;
    $('#cardRow').onclick = (e) => {
      const b = e.target.closest('[data-card]');
      if (!b || b.disabled || SPEC) return;
      const c = D.CARDS[b.dataset.card];
      const pick = b.dataset.card;
      askConfirm({ title: `Carta ${c.label}`, text: `${c.desc || ''}<br><br>Escolher esta carta? Não dá para trocar depois.`, ok: 'Escolher carta', icon: c.icon }).then((yes) => {
        const m = me();
        if (!yes || !m || m.card) return; // vale o que o servidor diz (não o que sobrou de uma partida anterior)
        myCardChoice = pick;
        socket.emit('card', { card: pick }, (r) => {
          if (r && r.error) { myCardChoice = null; toast(r.error, true); updateCards(); }
        });
        updateCards();
      });
    };
    boostSel = { pid: null, choice: null };
    $('#boostArea').onclick = (e) => {
      const pb = e.target.closest('[data-bpid]');
      if (pb) { boostSel = { pid: pb.dataset.bpid, choice: null }; renderBoostArea(true); return; }
      const cb = e.target.closest('[data-bchoice]');
      if (cb) { boostSel.choice = cb.dataset.bchoice; renderBoostArea(true); return; }
      if (e.target.closest('#boostApply')) {
        const m = me();
        const b = D.BOOSTS[m.boost.type];
        const p = P(boostSel.pid);
        askConfirm({ title: `${b.label} em ${p.name}?`, text: 'A carta vale para o jogo todo (temporada e playoffs) e não dá para trocar depois.', ok: 'Aplicar carta', icon: b.icon }).then((yes) => {
          if (!yes) return;
          socket.emit('applyBoost', { pid: boostSel.pid, choice: boostSel.choice }, (r) => { if (r && r.error) toast(r.error, true); else sfx.mine(); });
        });
      }
    };
  }

  // ---------- carta de reforço: escolher o jogador ----------
  let boostSel = { pid: null, choice: null };
  let boostKey = '';
  function boostPreviewHTML(p, q) {
    const a = D.cardAttrs(p), b = D.cardAttrs(q);
    const cell = (k) => {
      const d = b[k] - a[k];
      return `<div class="bp-a ${d ? 'up' : ''}"><span class="k">${D.CARD_ATTR_LABEL[k]}</span><span class="v">${b[k]}</span>${d ? `<span class="d">+${d}</span>` : ''}</div>`;
    };
    return `<div class="bp">
      <div class="bp-h"><b>${esc(q.name)}</b> <span class="muted">overall</span> <b>${p.ovr}${q.ovr !== p.ovr ? ` → <span style="color:var(--green)">${q.ovr}</span>` : ''}</b>
        · <span class="muted">posições</span> <b>${posStr(p)}${posStr(q) !== posStr(p) ? ` → <span style="color:var(--green)">${posStr(q)}</span>` : ''}</b></div>
      <div class="pmeta traits">${traitsHTML(q, true)}</div>
      <div class="bp-grid">${Object.keys(a).map(cell).join('')}</div>
    </div>`;
  }
  function renderBoostArea(force) {
    const m = me();
    const panel = $('#boostPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !m || !m.boost || SPEC);
    if (!m || !m.boost) return;
    const b = D.BOOSTS[m.boost.type];
    const key = JSON.stringify([m.boost, boostSel, m.roster]);
    if (!force && key === boostKey) return;
    boostKey = key;
    const area = $('#boostArea');
    if (m.boost.pid) {
      const p = P(m.boost.pid);
      area.innerHTML = m.boost.pid === 'nenhum' ? `<div class="empty-note">${b.icon} ${esc(b.label)}: nenhum jogador do seu elenco podia receber esta carta.</div>`
        : `<div class="boost-done">✓ ${b.icon} <b>${esc(b.label)}</b> aplicada em <b>${esc(p.name)}</b>. ${boostBadge(p)}</div>`;
      return;
    }
    const list = m.roster.map((id) => P(id)).sort((x, y) => y.ovr - x.ovr);
    const sel = boostSel.pid && m.roster.includes(boostSel.pid) ? P(boostSel.pid) : null;
    let opts = '', preview = '', can = false;
    if (sel) {
      if (b.choose === 'pos') {
        const ps = D.boostPositions(sel);
        opts = ps.length ? `<div class="bopts"><span class="muted small">Nova posição:</span>${ps.map((x) => `<button class="btn sm ${boostSel.choice === x ? 'primary' : ''}" data-bchoice="${x}">${x} · ${D.POS_LABELS[x]}</button>`).join('')}</div>` : '<div class="muted small">Ele já joga em todas as posições vizinhas.</div>';
      } else if (b.choose === 'trait') {
        const ts = D.boostTraits(sel);
        opts = `<div class="bopts"><span class="muted small">Característica nova:</span>${ts.map((x) => `<button class="btn sm ${boostSel.choice === x ? 'primary' : ''}" data-bchoice="${x}">${D.TRAITS[x].icon} ${D.TRAITS[x].label}</button>`).join('')}</div>`;
      }
      const q = D.applyBoost(sel, m.boost.type, boostSel.choice);
      if (q) { preview = boostPreviewHTML(sel, q); can = true; }
      else if (!b.choose) preview = '<div class="muted small">Essa carta não serve para esse jogador.</div>';
    }
    area.innerHTML = `
      <div class="boost-head"><span class="bh-icon">${b.icon}</span><div><div class="display" style="font-size:24px">${esc(b.label)}</div><div class="muted small">${esc(b.desc)}</div></div></div>
      <div class="bpick">${list.map((p) => `<button class="bpl ${sel && sel.id === p.id ? 'sel' : ''}" data-bpid="${esc(p.id)}"><span class="o">${p.ovr}</span><span class="n">${mainTrait(p)} ${esc(p.name)}<small>${posStr(p)}</small></span></button>`).join('')}</div>
      ${sel ? opts + preview : '<div class="muted small" style="margin-top:8px">Escolha o jogador que vai receber a carta para ver como ele fica.</div>'}
      ${sel ? `<div style="margin-top:12px"><button class="btn green" id="boostApply" ${can ? '' : 'disabled'}>Aplicar ${esc(b.label)} em ${esc(sel.name)}</button></div>` : ''}`;
  }
  function updateCards() {
    const m = me();
    const chosen = m && m.card;
    document.querySelectorAll('#cardRow [data-card]').forEach((b) => {
      b.disabled = !!chosen || SPEC;
      b.classList.toggle('sel', chosen && b.dataset.card === myCardChoice);
    });
    $('#cardStatus').innerHTML = `<div class="ready-list">${S.managers.map((x) => {
      const bOk = !x.boost || !!x.boost.pid;
      const ok = (!!x.card && bOk) || !x.connected;
      const bTxt = x.boost ? ` · ${D.BOOSTS[x.boost.type].icon} ${x.boost.pid ? (x.boost.pid === 'nenhum' ? 'sem uso' : esc(P(x.boost.pid).name)) : 'aplicando…'}` : '';
      return `<span class="rd ${ok ? 'ok' : ''}">${chip(x.team)} ${esc(x.name)} <i>${x.card ? '✓ carta de jogo' : !x.connected ? 'offline' : '… escolhendo'}${bTxt}</i></span>`;
    }).join('')}</div>`;
    renderBoostArea();
    if (m) $('#cardRoster').innerHTML = rosterHTML(m);
  }

  // ---------- SORTEIO DAS ARENAS ----------
  let drawT0 = 0, drawPer = 1300, drawEnds = 0, drawShown = -1;
  function buildDraw() {
    drawShown = -1;
    $('#screen').innerHTML = `
      <div class="draw-head">
        <h1 class="display">Sorteio das arenas</h1>
        <p class="muted">Cada técnico recebe uma arena histórica com um bônus para o time. Sem repetir e sem troca: o que caiu, caiu.</p>
        <div class="draw-status"><span id="drawStatus"></span> <button class="btn sm hidden" id="skipDrawBtn">Revelar tudo</button></div>
      </div>
      <div class="draw-grid" id="drawGrid">${S.managers.map((m, i) => `
        <div class="draw-slot ${m.id === ME ? 'me' : ''}" data-i="${i}">
          <div class="draw-who">${chip(m.team)} <b>${esc(m.name)}</b>${m.id === ME ? ' <span class="tag you">Você</span>' : ''}</div>
          <div class="draw-box"><div class="draw-q">?</div></div>
        </div>`).join('')}</div>`;
    $('#skipDrawBtn').onclick = () => socket.emit('skipDraw');
  }
  function updateDraw() {
    drawT0 = performance.now() - S.draw.elapsed;
    drawPer = S.draw.per;
    drawEnds = performance.now() + S.draw.left;
    $('#skipDrawBtn').classList.toggle('hidden', !isHost());
    drawShown = -1;
    tickDraw();
  }
  function tickDraw() {
    if (!S || S.phase !== 'draw') return;
    const t = performance.now() - drawT0 - 2500;
    const n = Math.min(S.managers.length, Math.max(0, Math.floor(t / drawPer) + 1));
    if (n !== drawShown) {
      document.querySelectorAll('.draw-slot').forEach((el, i) => {
        if (i < n && !el.classList.contains('open')) {
          const m = S.managers[i];
          el.classList.add('open');
          el.querySelector('.draw-box').innerHTML = arenaCard(ARENA(m.arena));
          if (drawShown >= 0) (m.id === ME ? sfx.mine : sfx.bid)();
        }
      });
      drawShown = n;
    }
    const left = Math.max(0, Math.ceil((drawEnds - performance.now()) / 1000));
    const st = $('#drawStatus');
    if (st) st.textContent = n < S.managers.length ? 'Sorteando…' : `O leilão começa em ${left}s`;
  }

  // ---------- LEILÃO ----------
  function buildAuction() {
    $('#screen').innerHTML = `
      <div class="auction">
        <aside class="side">
          <section class="panel"><div class="panel-h"><h3>Técnicos</h3><span class="muted small" id="lotInfo"></span></div><div class="panel-b" id="amgrs" style="display:grid;gap:4px"></div></section>
        </aside>
        <section class="stage">
          <div class="lotbar"><span id="lotCount"></span><div class="lot-progress"><i id="lotProg"></i></div></div>
          <div id="card" class="card"></div>
          <div class="panel bidbox ${SPEC ? 'hidden' : ''}" id="bidbox">
            <div class="fr-box hidden" id="frBox">
              <button class="btn green lg" id="frBuy"></button>
              <button class="btn lg" id="frPass">Passar</button>
            </div>
            <div class="quick" id="quick">
              ${[1, 2, 5, 10].map((inc) => `<button class="btn primary" data-inc="${inc}"><span>+${inc}</span><small></small></button>`).join('')}
            </div>
            <div class="row">
              <input id="customBid" class="field" type="number" min="1" inputmode="numeric" placeholder="Valor" />
              <button class="btn" id="customBtn">Dar lance</button>
              <span class="grow"></span>
              <button class="btn" id="passBtn">Passar</button>
            </div>
            <div class="bidnote" id="bidNote"></div>
            <div class="hostbar hidden" id="hostbar">
              <button class="btn sm" id="pauseBtn">Pausar</button>
              <button class="btn sm" id="skipBtn">Fechar lote agora</button>
              <span class="muted small" style="align-self:center">Controles do líder</span>
            </div>
          </div>
        </section>
        <aside class="side">
          <section class="panel ${SPEC ? 'hidden' : ''}"><div class="panel-h"><h3>Minha arena</h3></div><div class="panel-b" id="myArena"></div></section>
          <section class="panel" id="courtPanel"><div class="panel-h"><h3>Minha quadra</h3><span class="muted small" id="myInfo"></span></div>
            <div class="panel-b"><div id="placeBanner"></div><div id="myCourt"></div><div id="myRoster" class="roster mini-roster"></div></div></section>
          <section class="panel"><div class="panel-h"><h3>Últimos lotes</h3></div><div class="panel-b"><div id="hist" class="hist"></div></div></section>
        </aside>
      </div>`;
    $('#quick').onclick = (e) => {
      const b = e.target.closest('[data-inc]');
      if (!b || b.disabled) return;
      placeBid(Number(b.dataset.amount));
    };
    $('#customBtn').onclick = () => { const v = Number($('#customBid').value); if (v) placeBid(v); };
    $('#customBid').onkeydown = (e) => { if (e.key === 'Enter') $('#customBtn').click(); };
    $('#passBtn').onclick = () => socket.emit('pass');
    $('#frBuy').onclick = () => socket.emit('bid', { amount: 0 }, (r) => { if (r && r.error) toast(r.error, true); });
    $('#frPass').onclick = () => socket.emit('pass', {}, (r) => { if (r && r.error) toast(r.error, true); });
    auctionSel = null;
    $('#myCourt').onclick = (e) => {
      const b = e.target.closest('[data-cslot]');
      const m = me();
      if (!b || !m) return;
      const slot = b.dataset.cslot;
      if (m.pending) { // jogador recém-comprado: escolhe onde ele joga
        socket.emit('place', { slot }, (r) => { if (r && r.error) toast(r.error, true); else sfx.mine(); });
        return;
      }
      // clique num jogador para ver as posições dele; depois clique em outro lugar para trocar
      if (!auctionSel) { if (b.classList.contains('filled')) auctionSel = slot; renderAuctionCourt(true); return; }
      if (auctionSel === slot) { auctionSel = null; renderAuctionCourt(true); return; }
      const from = auctionSel;
      auctionSel = null;
      socket.emit('moveLineup', { from, to: slot }, (r) => { if (r && r.error) toast(r.error, true); });
      renderAuctionCourt(true);
    };
    $('#pauseBtn').onclick = () => socket.emit('pause');
    $('#skipBtn').onclick = () => socket.emit('skipLot');
  }

  function placeBid(amount) {
    socket.emit('bid', { amount }, (r) => {
      if (r && r.error) toast(r.error, true);
      else sfx.bid();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!S || S.phase !== 'auction' || SPEC || (S.settings.pool === 'franquia' && !(S.auction && S.auction.lot && S.auction.lot.kind === 'boost'))) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    const map = { '1': 1, '2': 2, '5': 5, '0': 10 };
    if (map[e.key]) {
      const b = $(`#quick [data-inc="${map[e.key]}"]`);
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (e.key === 'p' || e.key === 'P') { socket.emit('pass'); }
  });

  function handleAuctionFx(prev, st) {
    if (!st.auction || !st.auction.lot) return;
    const L = st.auction.lot;
    lot.endsAt = performance.now() + L.remainingMs;
    lot.dur = Math.max(st.settings.bidTime * 1000, L.remainingMs);
    const pl = prev && prev.auction && prev.auction.lot;
    // fui superado?
    const lotId = (A, x) => (x.kind === 'boost' ? 'c' + A.boostNo : 'j' + A.lotNo);
    if (pl && lotId(prev.auction, pl) === lotId(st.auction, L) && pl.leader === ME && L.leader && L.leader !== ME) sfx.outbid();
    if (L.result) {
      const key = lotId(st.auction, L) + ':' + L.result.type;
      if (key !== lastResultKey) {
        lastResultKey = key;
        if (L.result.type === 'sold') (L.result.mid === ME ? sfx.mine : sfx.sold)();
      }
    }
  }

  // selos de MVP da temporada e MVP das Finais (o atributo principal vai a 100 / 99)
  function seasonTxt(p) { return p.era === 'atual' ? (p.year - 1) + '-' + String(p.year).slice(2) : p.year; }
  function awardBadges(p) {
    const stat = D.MVP_STAT[(p.tags || '')[0]] || 'tudo';
    const out = [];
    if (p.mvp) out.push(`<div class="mvp-badge">🏆 MVP ${seasonTxt(p)} · ${stat} 100</div>`);
    if (p.fmvp) out.push(`<div class="mvp-badge fmvp">🥇 MVP das Finais ${seasonTxt(p)}${p.mvp ? '' : ` · ${stat} 99`}</div>`);
    return out.join(' ');
  }
  function boostBadge(p) {
    if (!p.boost) return '';
    const b = D.BOOSTS[p.boost.type];
    const extra = p.boost.type === 'versatil' ? ` (agora ${posStr(p)})` : p.boost.type === 'dna' && D.TRAITS[p.boost.choice] ? ` (${D.TRAITS[p.boost.choice].label})` : p.boost.type === 'fundamentos' && p.boost.choice ? ` (${p.boost.choice.split(',').map((k) => D.CARD_ATTR_LABEL[k]).join(' e ')})` : '';
    return `<div class="boost-badge">${b.icon} ${esc(b.label)}${esc(extra)}</div>`;
  }
  const attrCell = (label, v, extra = '') => `<div class="attr ${v >= 100 ? 'top100' : v >= 99 ? 'top99' : ''}"><div class="k">${label}</div><div class="v">${v}${extra}</div><div class="bar"><i style="width:${Math.max(4, Math.min(100, (v - 40) / 60 * 100))}%"></i></div></div>`;
  function playerCardHTML(p, L) {
    const a = D.cardAttrs(p);
    const lenda = p.era === 'lenda';
    const attr = (k, label) => attrCell(label, a[k]);
    const leader = L.leader ? M(L.leader) : null;
    let result = '';
    if (L.result) {
      if (L.result.type === 'sold') {
        const w = M(L.result.mid);
        const placing = w.pending === L.pid;
        result = `<div class="result"><div><div class="stamp">VENDIDO!</div><div class="who">${chip(w.team)} ${esc(w.name)} por <span style="color:var(--green)">${money(L.result.price)}</span></div>
          ${placing ? (w.id === ME ? '<div class="placing-note me">Escolha a posição dele na sua quadra →</div>' : `<div class="placing-note">${esc(w.name)} está escolhendo a posição…</div>`) : ''}</div></div>`;
      } else {
        result = `<div class="result"><div><div class="stamp unsold">${L.owner ? 'PASSOU' : 'SEM LANCES'}</div><div class="who muted">${L.owner ? 'Não contratado.' : 'Ninguém quis.'} Quem terminar com vaga aberta recebe os piores jogadores da posição.</div></div></div>`;
      }
    }
    return `
      <svg class="court" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#fff" stroke-width="2"/><circle cx="50" cy="50" r="16" fill="none" stroke="#fff" stroke-width="2"/><path d="M4 50h92" stroke="#fff" stroke-width="2"/></svg>
      <div class="card-top">
        <div class="ovr"><div><div class="v">${p.ovr}</div><div class="l">OVERALL</div></div></div>
        <div style="min-width:0">
          <div class="pmeta">${(p.positions || [p.pos]).map((x) => `<span class="posb">${x}</span>`).join('')}<span class="muted small">${D.POS_LABELS[p.pos] || ''}</span>${lenda ? `<span class="tag lenda">LENDA${p.year ? ' · ' + p.year : ''}</span>` : ''}</div>
          <div class="pname">${esc(p.name)}</div>
          <div class="pmeta traits">${traitsHTML(p, true)}</div>
          ${awardBadges(p)}${boostBadge(p)}
        </div>
        <div class="card-jersey">${jersey(p, 104)}</div>
      </div>
      <div class="attrs">${attr('tres', '3 Pts')}${attr('media', 'Média')}${attr('garrafao', 'Garrafão')}${attr('passe', 'Passe')}${attr('reb', 'Rebote')}${attr('def', 'Defesa')}</div>
      ${L.owner ? `<div class="bidrow">
        <div class="curbid"><div class="k">${L.discount ? 'Preço com desconto' : 'Preço fixo'}</div><div class="v">${money(L.price)}</div>${L.discount ? `<div class="disc">de <s>${money(L.basePrice)}</s> · ${esc(L.discount)}</div>` : ''}</div>
        <div class="leader">${chip(M(L.owner).team, 'lg')}<div><div>Lenda da franquia de ${esc(M(L.owner).name)}${L.owner === ME ? ' <span class="tag you">Você</span>' : ''}</div><div class="muted small">sem disputa: só ele decide</div></div></div>
      </div>` : `<div class="bidrow">
        <div class="curbid"><div class="k">${L.bid ? 'Maior lance' : 'Lance inicial'}</div><div class="v ${L.bid ? '' : 'none'}" id="curBidV">${L.bid ? money(L.bid) : 'US$ 1M'}</div></div>
        <div class="leader">${leader ? `${chip(leader.team, 'lg')}<div><div>${esc(leader.name)}${leader.id === ME ? ' <span class="tag you">Você</span>' : ''}</div><div class="muted small">${L.bids} lance${L.bids > 1 ? 's' : ''}</div></div>` : '<span class="muted">Ninguém deu lance ainda</span>'}</div>
      </div>`}
      <div class="timer" id="timer"><i id="timerBar"></i></div>
      <div class="timer-txt"><span id="timerTxt"></span><span>${S.auction.paused ? '⏸ PAUSADO' : ''}</span></div>
      ${result}`;
  }

  // lote de carta de reforço (leilão antes dos jogadores)
  function boostCardHTML(L) {
    const b = D.BOOSTS[L.boost];
    const leader = L.leader ? M(L.leader) : null;
    let result = '';
    if (L.result) {
      const w = L.result.type === 'sold' ? M(L.result.mid) : null;
      result = w
        ? `<div class="result"><div><div class="stamp">VENDIDA!</div><div class="who">${chip(w.team)} ${esc(w.name)} por <span style="color:var(--green)">${money(L.result.price)}</span></div><div class="placing-note">A carta é aplicada num jogador depois do leilão.</div></div></div>`
        : '<div class="result"><div><div class="stamp unsold">SEM LANCES</div><div class="who muted">Ninguém quis esta carta.</div></div></div>';
    }
    return `
      <div class="boost-lot">
        <div class="bl-icon">${b.icon}</div>
        <div class="bl-body">
          <div class="pmeta"><span class="tag lenda">CARTA DE REFORÇO</span><span class="muted small">uma por técnico · usada em um jogador do seu time</span></div>
          <div class="pname">${esc(b.label)}</div>
          <div class="bl-desc">${esc(b.desc)}</div>
        </div>
      </div>
      <div class="bidrow">
        <div class="curbid"><div class="k">${L.bid ? 'Maior lance' : 'Lance inicial'}</div><div class="v ${L.bid ? '' : 'none'}" id="curBidV">${L.bid ? money(L.bid) : 'US$ 1M'}</div></div>
        <div class="leader">${leader ? `${chip(leader.team, 'lg')}<div><div>${esc(leader.name)}${leader.id === ME ? ' <span class="tag you">Você</span>' : ''}</div><div class="muted small">${L.bids} lance${L.bids > 1 ? 's' : ''}</div></div>` : '<span class="muted">Ninguém deu lance ainda</span>'}</div>
      </div>
      <div class="timer" id="timer"><i id="timerBar"></i></div>
      <div class="timer-txt"><span id="timerTxt"></span><span>${S.auction.paused ? '⏸ PAUSADO' : ''}</span></div>
      ${result}`;
  }

  let lastCardKey = '';
  function updateAuction() {
    const A = S.auction;
    const L = A.lot;
    const m = me();
    const isBoost = !!(L && L.kind === 'boost');
    if (isBoost) {
      $('#lotInfo').textContent = `Carta ${A.boostNo}/${A.boostTotal}`;
      $('#lotCount').innerHTML = `🃏 Leilão de cartas de reforço · carta <b>${A.boostNo}</b> de <b>${A.boostTotal}</b> · depois vêm os ${A.total} jogadores`;
      $('#lotProg').style.width = (A.boostTotal ? (A.boostNo / A.boostTotal) * 100 : 0) + '%';
    } else {
      $('#lotInfo').textContent = `Lote ${A.lotNo}/${A.total}`;
      $('#lotCount').innerHTML = `Jogador <b>${A.lotNo}</b> de <b>${A.total}</b> · ${A.left === 0 ? 'último lote' : `restam ${A.left}`}`;
      $('#lotProg').style.width = (A.total ? (A.lotNo / A.total) * 100 : 0) + '%';
    }
    if (me() && $('#myArena').dataset.a !== me().arena) { $('#myArena').dataset.a = me().arena; $('#myArena').innerHTML = arenaCard(ARENA(me().arena), { compact: true }); }
    // card
    if (L && isBoost) {
      const key = ['boost' + A.boostNo, L.bid, L.leader, !!L.result, A.paused].join('|');
      if (key !== lastCardKey) {
        const bump = lastCardKey.split('|')[0] === 'boost' + A.boostNo && L.bid > 0;
        lastCardKey = key;
        const card = $('#card');
        card.className = 'card boostcard';
        card.innerHTML = boostCardHTML(L);
        if (bump && $('#curBidV')) $('#curBidV').classList.add('bump');
      }
    } else if (L) {
      const p = P(L.pid);
      const key = [L.pid, L.bid, L.leader, !!L.result, A.paused, S.managers.map((x) => x.pending || '').join(',')].join('|');
      if (key !== lastCardKey) {
        const bump = lastCardKey.split('|')[0] === L.pid && L.bid > 0;
        lastCardKey = key;
        const card = $('#card');
        card.className = 'card' + (p.era === 'lenda' ? ' lenda' : '');
        card.innerHTML = playerCardHTML(p, L);
        if (bump && $('#curBidV')) $('#curBidV').classList.add('bump');
      }
    } else {
      $('#card').innerHTML = '<div class="interval-banner"><div class="count">Fechando o leilão…</div></div>';
    }

    // controles de lance
    const fr = S.settings.pool === 'franquia' && !isBoost;
    $('#frBox').classList.toggle('hidden', !fr);
    $('#quick').classList.toggle('hidden', fr);
    $('#bidbox .row').classList.toggle('hidden', fr);
    if (fr && m && L) {
      const slots = S.settings.rosterSize - m.roster.length;
      const maxBid = Math.max(0, m.budget - (slots - 1));
      const mine = L.owner === ME;
      const owner = M(L.owner);
      $('#frBuy').textContent = `Contratar por ${money(L.price)}`;
      $('#frBuy').disabled = !mine || !!L.result || A.paused || slots <= 0 || L.price > maxBid;
      $('#frPass').disabled = !mine || !!L.result || A.paused;
      $('#frBox').classList.toggle('hidden', !mine);
      $('#bidNote').innerHTML = !mine
        ? `Lote da franquia de <b>${owner ? esc(owner.name) : '—'}</b>. Só ele decide: contratar por <b>${money(L.price)}</b> ou passar.`
        : slots <= 0 ? '<b>Elenco completo!</b>'
        : L.price > maxBid ? `<b style="color:var(--red)">Dinheiro insuficiente</b>: seu máximo agora é ${money(maxBid)} (guarde US$ 1M por vaga).`
        : `<b>Sua lenda!</b> ${L.discount ? `Com desconto: ${money(L.price)} (de ${money(L.basePrice)})` : `Preço fixo ${money(L.price)}`} · caixa ${money(m.budget)} · ${slots} vaga${slots > 1 ? 's' : ''}. Se o tempo acabar, você passa.`;
    }
    if (!fr && m && L) {
      const slots = S.settings.rosterSize - m.roster.length;
      // na carta, guarda US$ 1M para cada vaga do elenco que ainda vai montar
      const maxBid = isBoost ? Math.max(0, m.budget - slots) : Math.max(0, m.budget - (slots - 1));
      const amLeader = L.leader === ME;
      const passed = (L.passed || []).includes(ME);
      const done = isBoost ? !!m.boost : slots <= 0;
      const blocked = !!L.result || A.paused || done || amLeader || passed;
      document.querySelectorAll('#quick [data-inc]').forEach((b) => {
        const amt = L.bid + Number(b.dataset.inc);
        b.dataset.amount = amt;
        b.querySelector('small').textContent = money(amt);
        b.disabled = blocked || amt > maxBid;
      });
      $('#customBtn').disabled = blocked;
      $('#customBid').placeholder = `${L.bid + 1} a ${maxBid}`;
      const pb = $('#passBtn');
      pb.disabled = blocked || passed;
      pb.textContent = passed ? 'Você passou' : 'Passar';
      let note;
      if (isBoost && m.boost) note = `<b>Você já tem a sua carta</b> (${D.BOOSTS[m.boost.type].icon} ${esc(D.BOOSTS[m.boost.type].label)}). Só uma por técnico.`;
      else if (isBoost && amLeader) note = '<b style="color:var(--green)">Você está ganhando esta carta.</b>';
      else if (isBoost && passed) note = '<b>Você passou nesta carta.</b>';
      else if (isBoost) note = `Lance máximo na carta: <b>${money(maxBid)}</b> (o dinheiro sai do caixa do leilão de jogadores; guarde US$ 1M por vaga). Só dá para levar uma carta.`;
      else if (slots <= 0) note = '<b>Elenco completo!</b> Agora é só acompanhar.';
      else if (amLeader) note = '<b style="color:var(--green)">Você está ganhando este lote.</b>';
      else if (passed) note = '<b>Você passou neste jogador</b> e não pode mais dar lance nele.';
      else note = `Seu lance máximo: <b>${money(maxBid)}</b> · ${slots} vaga${slots > 1 ? 's' : ''} aberta${slots > 1 ? 's' : ''}. <span class="kbd-hint">Atalhos: <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">5</span> <span class="kbd">0</span> (+10) e <span class="kbd">P</span> para passar.</span>`;
      $('#bidNote').innerHTML = note;
    }
    $('#hostbar').classList.toggle('hidden', !isHost());
    $('#pauseBtn').textContent = A.paused ? 'Retomar' : 'Pausar';

    // técnicos
    $('#amgrs').innerHTML = S.managers.slice().sort((a, b) => b.budget - a.budget).map((x) => {
      const filled = x.roster.length, size = S.settings.rosterSize;
      const lead = L && L.leader === x.id;
      const passed = L && (L.passed || []).includes(x.id);
      return `<div class="mini-mgr ${lead ? 'lead' : ''} ${x.id === ME ? 'me' : ''}">
        ${chip(x.team)}<div class="nm">${esc(x.name)}${x.boost ? ` <span title="${esc(D.BOOSTS[x.boost.type].label)}">${D.BOOSTS[x.boost.type].icon}</span>` : ''}</div><div class="money">${money(x.budget)}</div>
        <div class="sub"><span class="dots">${Array.from({ length: size }, (_, i) => `<i class="${i < filled ? 'f' : ''}"></i>`).join('')}</span>
        ${lead ? '<span style="color:var(--green);font-weight:700">na frente</span>' : passed ? '<span>passou</span>' : ''}
        ${x.isBot ? '<span class="tag bot">Bot</span>' : !x.connected ? '<span class="tag off">Offline</span>' : ''}</div>
        ${x.arena ? `<div class="sub arena-mini" title="${esc(D.arenaText(ARENA(x.arena)))}">🏟️ ${esc(ARENA(x.arena).name)}</div>` : ''}
      </div>`;
    }).join('');

    // meu elenco
    if (m) {
      $('#myInfo').textContent = `${m.roster.length}/${S.settings.rosterSize} · ${money(m.budget)}`;
      renderAuctionCourt();
      $('#myRoster').innerHTML = rosterHTML(m);
    } else {
      $('#myRoster').innerHTML = '<div class="empty-note">Você está assistindo.</div>';
    }

    // histórico
    $('#hist').innerHTML = A.history.length ? A.history.map((h) => {
      if (h.boost) {
        const b = D.BOOSTS[h.boost];
        return h.mid
          ? `<div class="h">${mchip(h.mid)}<span class="n">${b.icon} ${esc(b.label)}</span><span class="p">${money(h.price)}</span></div>`
          : `<div class="h u"><span class="tchip" style="background:#333">—</span><span class="n">${b.icon} ${esc(b.label)}</span><span class="small">sem lance</span></div>`;
      }
      const p = P(h.pid);
      return h.mid
        ? `<div class="h">${mchip(h.mid)}<span class="n">${esc(p.name)} <span class="muted small">${p.ovr}</span></span><span class="p">${money(h.price)}</span></div>`
        : `<div class="h u"><span class="tchip" style="background:#333">—</span><span class="n">${esc(p.name)} <span class="small">${p.ovr}</span></span><span class="small">sem lance</span></div>`;
    }).join('') : '<div class="empty-note">Nenhum lote ainda.</div>';
  }

  // Minha quadra no leilão: posicionar quem comprou, ou clicar num jogador para ver as posições e trocar de lugar
  let auctionSel = null;
  function renderAuctionCourt(force) {
    const m = me();
    if (!m || !$('#myCourt')) return;
    const slots = S.settings.rosterSize - m.roster.length;
    const courtLeft = D.POS_ORDER.filter((k) => !(m.lineup || {})[k]).length;
    if (m.pending || (auctionSel && !slotPid(m.lineup || {}, auctionSel))) auctionSel = null;
    const key = JSON.stringify([m.lineup, m.pending, m.roster.length, auctionSel]);
    if (!force && $('#myCourt').dataset.k === key) return;
    $('#myCourt').dataset.k = key;
    $('#myCourt').innerHTML = m.lineup ? courtHTML(m, { mode: m.pending ? 'place' : 'edit', sel: auctionSel, pending: m.pending, benchCap: S.settings.rosterSize - 5, canBench: slots >= courtLeft }) : '';
    const selP = auctionSel ? P(slotPid(m.lineup, auctionSel)) : null;
    $('#placeBanner').innerHTML = m.pending
      ? `<div class="place-banner">🏀 Onde <b>${esc(P(m.pending).name)}</b> vai jogar? <span>Passe o mouse nas posições para ver se ele perde rendimento. O leilão continua quando você escolher.</span></div>${posInfoHTML(P(m.pending))}`
      : selP ? `${posInfoHTML(selP, auctionSel[0] === 'b' ? 'bench' : auctionSel)}<div class="court-help">Clique no lugar para onde ele vai (troca com quem estiver lá) ou nele de novo para cancelar.</div>`
      : m.roster.length ? '<div class="court-help">Clique num jogador para ver as posições dele e trocar de lugar.</div>' : '';
    $('#courtPanel').classList.toggle('placing', !!m.pending);
    if (m.pending && force !== true && window.innerWidth < 1180) $('#courtPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function rosterHTML(m) {
    return m.roster.map((id) => P(id)).sort((a, b) => b.ovr - a.ovr).map((p) => `
      <div class="rp"><span class="o">${p.ovr}</span><span class="n">${mainTrait(p)} ${esc(p.name)}${p.mvp ? ' 🏆' : ''}${p.fmvp ? ' 🥇' : ''}${p.boost ? ' ' + D.BOOSTS[p.boost.type].icon : ''}<small>${posStr(p)}</small></span><span class="p">${m.prices[p.id] ? money(m.prices[p.id]) : 'grátis'}</span></div>`).join('');
  }

  // animação do cronômetro
  let lastSec = null;
  function frame() {
    if (S && S.phase === 'auction' && S.auction && S.auction.lot) {
      const bar = $('#timerBar'), txt = $('#timerTxt'), tm = $('#timer');
      if (bar) {
        const L = S.auction.lot;
        const left = S.auction.paused ? L.remainingMs : Math.max(0, lot.endsAt - performance.now());
        const pct = L.result ? 0 : Math.min(100, left / lot.dur * 100);
        bar.style.width = pct + '%';
        tm.className = 'timer' + (left < 2500 ? ' crit' : left < 5000 ? ' warn' : '');
        const sec = Math.ceil(left / 1000);
        txt.textContent = L.result ? (L.kind === 'boost' ? 'Próximo lote…' : 'Próximo jogador…') : `${sec}s`;
        if (!L.result && !S.auction.paused && sec <= 3 && sec > 0 && sec !== lastSec) sfx.tick();
        lastSec = sec;
      }
    }
    if (S && S.phase === 'draw') tickDraw();
    if (S && S.phase === 'teampick') tickPick();
    if (S && S.phase === 'season') tickLive();
    if (S && S.phase === 'season' && S.season.status === 'interval' && !S.season.paused) {
      const c = $('#intCount');
      if (c) c.textContent = Math.max(0, Math.ceil((seasonIntervalEnds - performance.now()) / 1000));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- TEMPORADA ----------
  let seasonIntervalEnds = 0;
  const RITMO_OPTS = [['lento', 'Cadenciado'], ['normal', 'Normal'], ['rapido', 'Acelerado']];

  function buildSeason() {
    // nova temporada: esquece escolhas da partida anterior (os ids dos jogos se repetem entre partidas)
    for (const k of Object.keys(clutchPicked)) delete clutchPicked[k];
    courtSel = null;
    $('#screen').innerHTML = `
      <div class="panel stagebar"><h2 id="stLabel"></h2><span id="stInfo" class="muted small"></span><button class="btn sm hidden" id="pauseSeason"></button><button class="btn sm hidden" id="skipRound"></button></div>
      <div class="season ${SPEC ? 'spec' : ''}">
        <aside class="side season-left">
          <section class="panel"><div class="panel-h"><h3 id="tickerTitle">Jogos da rodada</h3></div><div class="panel-b"><div id="ticker" class="ticker"></div></div></section>
          <section class="panel" id="bracketPanel"><div class="panel-h"><h3>Playoffs</h3></div><div class="panel-b"><div id="bracket" class="bracket"></div></div></section>
          <section class="panel" id="tablePanel"><div class="panel-h"><h3>Classificação</h3></div><div class="panel-b scroll" id="table"></div></section>
          <section class="panel"><div class="panel-h"><h3>Cestinhas</h3><span class="muted small">por jogo</span></div><div class="panel-b scroll" id="leaders"></div></section>
        </aside>
        <div class="season-main">
          <section class="panel hidden" id="intervalPanel"></section>
          <section class="panel" id="gamePanel">
            <div class="panel-h"><h3 id="gameTitle">Seu jogo</h3><span class="watching" id="watching"></span></div>
            <div class="panel-b"><div id="scoreboard" class="scoreboard"></div></div>
            <div id="feed" class="feed"></div>
          </section>
          <section class="panel hidden" id="fastPanel"></section>
          <section class="panel ${SPEC ? 'hidden' : ''}" id="strategyPanel">
            <div class="panel-h"><h3>Estratégia</h3><span class="muted small">Mude a qualquer momento — vale na próxima posse</span></div>
            <div class="panel-b strat">
              <div><div class="plan-h"><b>Esquema ofensivo</b></div><div id="schemeBox"></div></div>
              <div><div class="plan-h"><b>Defesa</b></div><div id="defBox"></div></div>
              <div><div class="plan-h"><b>Ritmo</b></div><div id="ritmoBox"></div></div>
              <div><div class="plan-h"><b>Sua arena</b></div><div id="planArena"></div></div>
            </div>
          </section>
        </div>
        <aside class="season-right ${SPEC ? 'hidden' : ''}">
          <section class="panel" id="tacticsPanel">
            <div class="panel-h"><h3>Prancheta</h3><span class="muted small">Vale na próxima posse</span></div>
            <div class="panel-b">
              <div class="plan-h"><b>Escalação</b><button class="btn sm" id="autoLu">Escalação automática</button></div>
              <div id="lineupEd"></div>
              <div id="benchList" class="bench"></div>
              <div class="plan-h" style="margin-top:16px"><b>Sua carta</b></div>
              <div id="cardBox"></div>
              <div id="timeoutWrap"><div class="plan-h" style="margin-top:16px"><b>Pedido de tempo</b></div>
              <div id="timeoutBox"></div></div>
            </div>
          </section>
        </aside>
      </div>
      <div id="clutch" class="clutch-ov hidden"></div>`;
    $('#skipRound').onclick = () => socket.emit('skipRound');
    $('#pauseSeason').onclick = () => socket.emit('pauseSeason');
    $('#ticker').onclick = (e) => {
      const b = e.target.closest('[data-game]');
      if (!b) return;
      selectedGame = b.dataset.game;
      renderGamePanel(true);
      renderTicker();
    };
    $('#strategyPanel').onclick = (e) => {
      const b = e.target.closest('[data-k]');
      const m = me();
      if (!b || !m) return;
      m.tactics[b.dataset.k] = b.dataset.v;
      socket.emit('tactics', { ...m.tactics });
      renderTactics(true);
    };
    $('#autoLu').onclick = () => socket.emit('autoLineup');
    // atalhos 1–5 na bola decisiva
    document.addEventListener('keydown', (e) => {
      const ov = $('#clutch');
      if (!ov || ov.classList.contains('hidden') || !/^[1-5]$/.test(e.key)) return;
      const b = ov.querySelectorAll('[data-cpick]:not([disabled])')[Number(e.key) - 1];
      if (b) { e.preventDefault(); b.click(); }
    });
    $('#clutch').onclick = (e) => {
      const b = e.target.closest('[data-cpick]');
      if (!b) return;
      const mm = myMatch();
      if (!mm || !mm.ch) return;
      clutchPicked[mm.id + ':' + mm.ch.need + ':' + mm.q] = b.dataset.cpick;
      socket.emit('clutchPick', { pid: b.dataset.cpick }, (r) => { if (r && r.error) toast(r.error, true); });
      renderClutch(true);
    };
    $('#lineupEd').onclick = (e) => {
      const b = e.target.closest('[data-cslot]');
      const m = me();
      if (!b || !m || !m.lineup) return;
      const k = b.dataset.cslot;
      if (k === 'bench') return;
      if (!courtSel) { if (b.classList.contains('filled')) courtSel = k; renderTactics(true); return; }
      if (courtSel === k) { courtSel = null; renderTactics(true); return; }
      // troca os dois lugares (quadra ↔ quadra, quadra ↔ banco)
      const lu = m.lineup;
      const get = (x) => (x[0] === 'b' && x !== 'bench' ? (lu.bench || [])[+x.slice(1)] : lu[x]);
      const set = (x, v) => { if (x[0] === 'b' && x !== 'bench') lu.bench[+x.slice(1)] = v; else lu[x] = v; };
      const a = get(courtSel), c = get(k);
      set(courtSel, c); set(k, a);
      lu.bench = (lu.bench || []).filter(Boolean);
      courtSel = null;
      const five = {};
      D.POS_ORDER.forEach((x) => { five[x] = lu[x]; });
      if (D.POS_ORDER.every((x) => five[x])) socket.emit('lineup', five, (r) => { if (r && r.error) toast(r.error, true); });
      renderTactics(true);
    };
  }
  let courtSel = null;

  function myMatch() {
    return S.season && S.season.matches.find((x) => x.teams.includes(ME));
  }
  const clutchPicked = {};

  // ---------- pedido de tempo ----------
  function renderTimeoutBox() {
    const box = $('#timeoutBox');
    if (!box || !S.season) return;
    $('#timeoutWrap').classList.toggle('hidden', !!S.season.fast && !S.season.post); // 82-0: tempo só no play-in e playoffs (ao vivo)
    const mm = myMatch();
    const ti = mm ? mm.teams.indexOf(ME) : -1;
    const live = !!(mm && !mm.done && S.season.status === 'playing');
    const left = live && mm.to ? mm.to[ti] : 1;
    const oppRun = live && mm.run && mm.run.team === 1 - ti ? mm.run.pts : 0;
    const holding = live && mm.hold && mm.hold.kind === 'timeout';
    const state = !live ? 'off' : holding ? 'hold' : left > 0 ? (mm.ch ? 'clutch' : 'ready') : 'used';
    const key = [mm ? mm.id : '', state, oppRun >= 6 ? 'run' + oppRun : ''].join('|');
    if (box.dataset.k === key) return;
    box.dataset.k = key;
    const help = '<div class="small muted" style="margin-top:6px">Para o jogo por alguns segundos e quebra o ritmo do adversário: corta a corrida dele, esfria quem está pegando fogo 🔥 e o time dele erra mais nas próximas posses.</div>';
    let body;
    if (state === 'off') body = '<span class="muted small">1 por jogo, durante o seu jogo.</span>';
    else if (state === 'hold') body = '<b class="card-on">⏸️ Jogo parado — tempo pedido</b>';
    else if (state === 'used') body = '<span class="muted small">Você já pediu tempo neste jogo.</span>';
    else if (state === 'clutch') body = '<span class="muted small">Agora é a bola decisiva.</span>';
    else body = `${oppRun >= 6 ? `<div class="run-alert">📈 O adversário está numa corrida de ${oppRun}-0!</div>` : ''}<button class="btn ${oppRun >= 6 ? 'primary' : ''}" id="timeoutBtn">⏸️ Pedir tempo</button>`;
    box.innerHTML = body + help;
    const b = $('#timeoutBtn');
    if (b) b.onclick = () => {
      b.disabled = true;
      socket.emit('timeout', {}, (r) => { if (r && r.error) { toast(r.error, true); b.disabled = false; } });
    };
  }

  // ---------- bola decisiva ----------
  function pAttrs(pid, slot) {
    const p = P(pid);
    return D.attrs(p, slot ? D.posPenalty(p, slot) : 0);
  }
  function slotOf(mid, pid) {
    const m = M(mid);
    return m && m.lineup ? D.POS_ORDER.find((k) => m.lineup[k] === pid) : null;
  }
  function renderClutch(force) {
    const ov = $('#clutch');
    if (!ov) return;
    const mm = myMatch();
    const ti = mm ? mm.teams.indexOf(ME) : -1;
    let mode = null;
    if (mm && mm.ch && (ti === mm.ch.o || ti === mm.ch.d)) mode = 'pick';
    else if (mm && mm.last && mm.hold && mm.hold.kind === 'clutch') mode = 'reveal';
    if (!mode) { ov.classList.add('hidden'); ov.dataset.k = ''; return; }
    ov.classList.remove('hidden');
    if (mode === 'pick') {
      const c = mm.ch;
      const attack = ti === c.o;
      const pk = clutchPicked[mm.id + ':' + c.need + ':' + mm.q];
      const key = ['pick', mm.id, mm.q, pk || ''].join('|');
      if (!force && ov.dataset.k === key) return;
      ov.dataset.k = key;
      const ids = attack ? c.off : c.def;
      const mid = mm.teams[ti];
      const sit = c.need === 0 ? 'Jogo empatado' : attack ? `Você está ${c.need} ponto${c.need > 1 ? 's' : ''} atrás` : `Você está ${c.need} ponto${c.need > 1 ? 's' : ''} na frente`;
      const goal = attack
        ? (c.need >= 3 ? 'Só a bola de três empata.' : c.need === 2 ? 'Dois pontos empatam (prorrogação), três vencem.' : c.need === 1 ? 'Qualquer cesta vira o jogo.' : 'Qualquer cesta vence o jogo.')
        : 'Escolha quem marca o arremessador deles. Ninguém sabe a escolha do outro.';
      const cards = ids.map((pid, k) => {
        const p = P(pid), a = pAttrs(pid, slotOf(mid, pid));
        const heat = mm.heat && mm.heat[pid];
        const stats = attack
          ? `<span>3PT <b>${a.tres}</b></span><span>MEIA <b>${a.media}</b></span><span>INFIL <b>${a.infil}</b></span><span>COSTAS <b>${a.post}</b></span>`
          : `<span>PERÍMETRO <b>${a.defPer}</b></span><span>GARRAFÃO <b>${a.defAro}</b></span>`;
        const tr = (p.tags || '').split('').filter((t) => (attack ? 'CSMIGX' : 'DB').includes(t)).map((t) => `${D.TRAITS[t].icon} ${D.TRAITS[t].label}`).join(' · ');
        return `<button class="cl-p ${pk === pid ? 'on' : ''}" data-cpick="${pid}" data-k="${k + 1}" ${pk ? 'disabled' : ''}>
          <span class="cjersey">${courtJersey(p)}</span>
          <b>${esc(shortName(p.name))}${heat ? (heat === 'fire' ? ' 🔥' : ' 🧊') : ''}</b>
          <span class="cl-st">${stats}</span>${tr ? `<span class="cl-tr">${tr}</span>` : ''}</button>`;
      }).join('');
      ov.innerHTML = `<div class="cl-box">
        <div class="cl-h">⏱️ BOLA DECISIVA</div>
        <div class="cl-sit">${sit} · <span id="clClock">${esc(mm.t)}</span></div>
        <div class="cl-role ${attack ? 'atk' : 'dfn'}">${attack ? '🏀 Você ataca: escolha quem arremessa' : '🛡️ Você defende: escolha quem marca'}</div>
        <div class="muted small">${goal}</div>
        <div class="cl-list">${cards}</div>
        <div class="cl-foot">${pk ? `<b>Escolha feita.</b> Aguardando o adversário…` : 'Clique no jogador ou aperte <b>1</b> a <b>5</b>. Sem escolha em 10 s, o jogo escolhe o melhor para você.'}</div>
        <div class="cl-timer"><i id="clBar"></i></div>
      </div>`;
      return;
    }
    const L = mm.last;
    const key = ['reveal', mm.id, L.shooter, L.defender, L.made].join('|');
    if (ov.dataset.k === key) return;
    ov.dataset.k = key;
    const s = P(L.shooter), x = P(L.defender);
    const mine = mm.teams[L.o] === ME;
    const good = L.made === mine;
    const how = ['de três', 'de média distância', 'infiltrando', 'de costas'][L.type];
    ov.innerHTML = `<div class="cl-box reveal ${good ? 'good' : 'bad'}">
      <div class="cl-h">⏱️ BOLA DECISIVA</div>
      <div class="cl-vs">
        <div class="cl-side"><span class="cjersey big">${courtJersey(s)}</span><b>${esc(shortName(s.name))}</b><span class="muted small">arremessa ${how}</span></div>
        <div class="cl-x">VS</div>
        <div class="cl-side"><span class="cjersey big">${courtJersey(x)}</span><b>${esc(shortName(x.name))}</b><span class="muted small">marca</span></div>
      </div>
      <div class="cl-stage"><div class="cl-sus">🏀 Arremessou…</div><div class="cl-res ${L.made ? 'made' : 'miss'}">${L.made ? `CAIU! +${L.pts}` : 'ERROU!'}</div></div>
      <div class="muted small cl-ch">Chance do arremesso: ${L.chance}%</div>
    </div>`;
    if (good) setTimeout(() => confetti(60, ['#ffcf40', '#ffffff', '#25d07c']), 850);
  }
  // cronômetros que andam entre um envio e outro do servidor
  function tickLive() {
    if (S.season && S.season.paused) return; // pausado: os cronômetros ficam parados
    const mm = myMatch();
    if (mm && mm.ch && mm.rx != null) {
      const bar = $('#clBar');
      if (bar) bar.style.width = Math.max(0, (mm.ch.ms - (performance.now() - mm.rx)) / 150) + '%';
    }
    if (mm && mm.hold && mm.rx != null && performance.now() - mm.rx > mm.hold.ms) { mm.hold = null; renderClutch(); renderTimeoutBox(); }
  }

  // ---------- 82-0 ----------
  function streakTxt(n) { return !n ? '—' : n > 0 ? `V${n}` : `D${-n}`; }
  function renderFast() {
    const s = S.season;
    const panel = $('#fastPanel');
    const show = s.fast && s.status !== 'prep';
    panel.classList.toggle('hidden', !show);
    if (!s.post) $('#gamePanel').classList.add('hidden');
    if (!show) return;
    const st = s.standings;
    const mine = st.find((r) => r.mid === ME);
    const isRoom = (mid) => S.managers.some((m) => m.id === mid);
    if (s.post) { panel.innerHTML = postHTML(s); return; }
    const pct = s.totalRounds ? Math.round((s.round / s.totalRounds) * 100) : 0;
    const unbeaten = st.filter((r) => r.l === 0 && r.w > 0);
    const res = (r) => {
      const w = r.score[0] > r.score[1] ? 0 : 1;
      const ln = (i) => `<span class="fr-t ${i === w ? 'w' : ''}">${mchip(r.teams[i])} ${mname(r.teams[i])} <b>${r.score[i]}</b></span>`;
      return `<div class="fr ${r.teams.includes(ME) ? 'me' : ''} ${r.round === s.round ? 'new' : ''}"><span class="fr-n">R${r.round}</span>${ln(0)}<span class="muted">×</span>${ln(1)}${r.ot ? '<span class="tag">OT</span>' : ''}${r.clutch ? '<span class="tag">⏱️</span>' : ''}</div>`;
    };
    panel.innerHTML = `<div class="panel-h"><h3>82-0</h3><span class="muted small">${s.paused ? '⏸ Pausado pelo líder' : 'Liga de 30 times · os jogos rolam sozinhos — mexa na prancheta e vale a partir da próxima rodada'}</span></div>
      <div class="panel-b">
        <div class="f82-top">
          ${mine ? `<div class="f82-me"><div class="muted small">SUA CAMPANHA</div><div class="f82-rec ${mine.l === 0 && mine.w ? 'perfect' : ''}">${mine.w}-${mine.l}</div><div class="muted small">sequência ${streakTxt((s.streak || {})[ME])} · ${confSeedTxt(ME)}</div></div>` : ''}
          <div class="f82-prog"><div class="muted small">RODADA ${Math.min(s.round, s.totalRounds)} DE ${s.totalRounds}</div><div class="fit-bar"><i style="width:${pct}%"></i></div>
            <div class="f82-unb">${unbeaten.length ? `🔥 Invicto${unbeaten.length > 1 ? 's' : ''}: ${unbeaten.slice(0, 4).map((r) => `${mchip(r.mid)} ${mname(r.mid)} (${r.w}-0)`).join(' · ')}${unbeaten.length > 4 ? ` e mais ${unbeaten.length - 4}` : ''}` : '💥 Ninguém está mais invicto.'}</div>
          </div>
        </div>
        <div class="conf-grid">${['E', 'W'].map((c) => confTableHTML(c)).join('')}</div>
        <div class="muted small conf-leg"><span class="lg-po">■</span> 1º–6º: playoffs · <span class="lg-pi">■</span> 7º–10º: play-in · times em <b>negrito</b> são da sala</div>
        <div class="muted small" style="font-weight:800;letter-spacing:1px;margin:14px 0 6px">JOGOS DOS TIMES DA SALA</div>
        <div class="f82-feed">${(s.feed || []).map(res).join('') || '<div class="empty-note">Os jogos começam em instantes…</div>'}</div>
      </div>`;
  }
  function confRows(c) {
    return S.season.standings.filter((r) => { const m = M(r.mid); return m && D.confOf(m.team) === c; });
  }
  function confSeedTxt(mid) {
    const m = M(mid);
    if (!m) return '';
    const c = D.confOf(m.team);
    const i = confRows(c).findIndex((r) => r.mid === mid);
    return `${i + 1}º no ${D.CONF_LABEL[c]}`;
  }
  function confTableHTML(c, compact) {
    const s = S.season;
    const rows = confRows(c);
    const isRoom = (mid) => S.managers.some((m) => m.id === mid);
    return `<div class="conf"><div class="conf-h">${D.CONF_LABEL[c].toUpperCase()}</div><table class="tbl conf-t"><thead><tr><th>#</th><th>Time</th><th class="n">V</th><th class="n">D</th>${compact ? '' : '<th class="n">%</th><th class="n">Seq</th>'}</tr></thead><tbody>${rows.map((r, i) => {
      const g = r.w + r.l;
      const sq = (s.streak || {})[r.mid] || 0;
      return `<tr class="${r.mid === ME ? 'me' : ''} ${i < 6 ? 'r-po' : i < 10 ? 'r-pi' : ''} ${isRoom(r.mid) ? 'room' : ''} ${i === 5 || i === 9 ? 'r-cut' : ''}"><td>${i + 1}</td><td><div class="tmc">${mchip(r.mid)}<span class="nm">${mname(r.mid)}</span></div></td><td class="n"><b>${r.w}</b></td><td class="n">${r.l}</td>${compact ? '' : `<td class="n">${g ? (r.w / g).toFixed(3).replace(/^0/, '') : '—'}</td><td class="n" style="color:${sq >= 0 ? 'var(--green)' : 'var(--red)'}">${streakTxt(sq)}</td>`}</tr>`;
    }).join('')}</tbody></table></div>`;
  }
  // chaveamento da NBA (play-in + playoffs)
  function postHTML(s) {
    const P = s.post;
    const isRoom = (mid) => S.managers.some((m) => m.id === mid);
    const team = (mid, extra, cls = '') => mid ? `<div class="bt ${cls} ${isRoom(mid) ? 'room' : ''} ${mid === ME ? 'me' : ''}">${mchip(mid)}<span class="nm">${mname(mid)}</span><span class="sc">${extra == null ? '' : extra}</span></div>` : '<div class="bt"><span class="nm muted">a definir</span></div>';
    const series = (x) => {
      if (!x) return `<div class="bm">${team(null)}${team(null)}</div>`;
      const live = s.status === 'playing' && s.matches.some((m) => m.teams.includes(x.hi) && m.teams.includes(x.lo));
      const cls = (k) => (x.winner ? (x.winner === (k ? x.lo : x.hi) ? 'win' : 'lose') : '');
      return `<div class="bm ${live ? 'live' : ''}">${team(x.hi, x.w[0], cls(0))}${team(x.lo, x.w[1], cls(1))}</div>`;
    };
    const col = (rd, c, n) => {
      const list = P.series.filter((x) => x.round === rd && x.conf === c);
      return `<div class="bcol"><h4>${['1ª rodada', 'Semis', 'Final conf.', 'Finais'][rd]}</h4>${Array.from({ length: n }, (_, i) => series(list[i])).join('')}</div>`;
    };
    const pin = (c) => {
      const pi = P.playin[c];
      const g = (x, lbl) => {
        if (!x) return `<div class="pi-g"><span class="muted small">${lbl}</span><div class="bm">${team(null)}${team(null)}</div></div>`;
        const cls = (mid) => (x.winner ? (x.winner === mid ? 'win' : 'lose') : '');
        return `<div class="pi-g"><span class="muted small">${lbl}</span><div class="bm">${team(x.teams[0], x.score ? x.score[0] : '', cls(x.teams[0]))}${team(x.teams[1], x.score ? x.score[1] : '', cls(x.teams[1]))}</div></div>`;
      };
      return `<div class="pin"><div class="conf-h">PLAY-IN · ${D.CONF_LABEL[c].toUpperCase()}</div>${g(pi.g1, '7º x 8º · quem vence é o 7º')}${g(pi.g2, '9º x 10º · quem perde sai')}${g(pi.g3, 'Vaga do 8º')}</div>`;
    };
    const myIn = [P.seeds.E, P.seeds.W].some((sd) => sd.slice(0, 10).includes(ME));
    const today = (P.today || []).filter((r) => r.teams.some(isRoom));
    const title = P.phase === 'playin' ? 'Play-in' : P.phase === 'done' ? 'Playoffs encerrados' : P.roundNames[P.round];
    return `<div class="panel-h"><h3>${esc(title)}</h3><span class="muted small">${ME && !S.managers.find((m) => m.id === ME).isBot ? (myIn ? 'Seus jogos são ao vivo (com prancheta, tempo e bola decisiva). Os outros são simulados.' : 'Seu time ficou fora. Assista aos jogos da sala ao vivo.') : ''} Séries melhor de 7 · mando 2-2-1-1-1</span></div>
      <div class="panel-b">
        <div class="pi-grid">${pin('W')}${pin('E')}</div>
        <div class="nba-br">
          <div class="br-row"><div class="conf-h">OESTE</div><div class="br-side">${col(0, 'W', 4)}${col(1, 'W', 2)}${col(2, 'W', 1)}</div></div>
          <div class="br-final"><div class="conf-h" style="text-align:center">🏆 FINAIS DA NBA</div>${series(P.series.find((x) => x.round === 3))}</div>
          <div class="br-row"><div class="conf-h">LESTE</div><div class="br-side">${col(0, 'E', 4)}${col(1, 'E', 2)}${col(2, 'E', 1)}</div></div>
        </div>
        ${today.length ? `<div class="muted small" style="font-weight:800;letter-spacing:1px;margin:14px 0 6px">ÚLTIMO DIA · TIMES DA SALA</div><div class="f82-feed">${today.map((r) => {
          const w = r.score[0] > r.score[1] ? 0 : 1;
          const ln = (i) => `<span class="fr-t ${i === w ? 'w' : ''}">${mchip(r.teams[i])} ${mname(r.teams[i])} <b>${r.score[i]}</b></span>`;
          return `<div class="fr ${r.teams.includes(ME) ? 'me' : ''}"><span class="fr-n" style="width:auto">${esc(r.label)}</span>${ln(0)}<span class="muted">×</span>${ln(1)}${r.ot ? '<span class="tag">OT</span>' : ''}</div>`;
        }).join('')}</div>` : ''}
        <details class="conf-final"><summary class="muted small">Classificação final da temporada regular</summary><div class="conf-grid">${['W', 'E'].map((c) => confTableHTML(c, true)).join('')}</div></details>
      </div>`;
  }

  let lastMatchesKey = '';
  function updateSeason() {
    const s = S.season;
    const nowRx = performance.now();
    s.matches.forEach((m) => { m.rx = nowRx; });
    $('.season').classList.toggle('fast', !!s.fast);
    $('#stLabel').textContent = s.label;
    const info = s.stage === 'liga' && s.totalRounds ? `Rodada ${Math.min(s.round + 1, s.totalRounds)}/${s.totalRounds}` : '';
    $('#stInfo').textContent = info;
    seasonIntervalEnds = performance.now() + (s.intervalMs || 0);
    const sk = $('#skipRound');
    sk.classList.toggle('hidden', !isHost() || s.status === 'prep');
    sk.textContent = s.fast && !s.post ? (s.paused ? '▶ Continuar' : '⏸ Pausar') : s.status === 'playing' ? '⏩ Simular rodada até o fim' : '▶ Começar próxima agora';
    // pausa do líder nos jogos ao vivo, nos intervalos, no play-in e nos playoffs (no 82-0 regular o botão acima já pausa)
    const ps = $('#pauseSeason');
    ps.classList.toggle('hidden', !isHost() || s.status === 'prep' || (s.fast && !s.post));
    ps.textContent = s.paused ? '▶ Continuar' : '⏸ Pausar';
    ps.classList.toggle('primary', !!s.paused);
    if (s.paused) $('#stInfo').textContent = '⏸ PAUSADO pelo líder';
    if (s.fast && !s.post) {
      $('#stInfo').textContent = `Rodada ${Math.min(s.round, s.totalRounds)}/${s.totalRounds}`;
      renderFast();
      renderInterval();
      renderTactics();
      renderTable();
      renderBracket();
      renderLeaders();
      return;
    }

    const key = s.matches.map((m) => m.id).join(',');
    if (key !== lastMatchesKey) {
      lastMatchesKey = key;
      const mm = myMatch();
      selectedGame = mm ? mm.id : (s.matches[0] && s.matches[0].id);
      renderGamePanel(true);
    } else {
      renderGamePanel(false);
    }
    renderInterval();
    renderTicker();
    renderTactics();
    renderTable();
    renderBracket();
    renderLeaders();
    renderClutch();
    if (s.post) { renderFast(); $('#stInfo').textContent = s.paused ? '⏸ PAUSADO pelo líder' : s.post.phase === 'playin' ? 'Play-in' : 'Playoffs'; }
  }

  function renderTactics(force) {
    const m = me();
    if (!m) return;
    const seg = (k, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button data-k="${k}" data-v="${v}" class="${cur === v ? 'on o' : ''}">${l}</button>`).join('')}</div>`;
    const lu = m.lineup;
    const starters = lu ? D.POS_ORDER.map((k) => P(lu[k])).filter((p) => p && p.id) : [];

    // escalação na quadra: clique num jogador e depois no lugar para onde ele vai
    if (lu) {
      const mm = myMatch();
      const heat = mm && !mm.done && mm.heat ? mm.heat : {};
      const key = JSON.stringify([lu, courtSel, heat]);
      if (force || $('#lineupEd').dataset.k !== key) {
        $('#lineupEd').dataset.k = key;
        $('#lineupEd').innerHTML = courtHTML(m, { mode: 'edit', sel: courtSel, heat }) +
          (courtSel ? posInfoHTML(P(slotPid(lu, courtSel)), courtSel[0] === 'b' ? 'bench' : courtSel) : '') +
          `<div class="court-help">${courtSel ? 'Agora clique no lugar para onde ele vai (passe o mouse para ver o rendimento).' : 'Clique num jogador para ver as posições dele e depois no lugar para trocar. Fora da posição de origem: −8 numa posição vizinha, −16 a duas, −24 ou mais além disso.'}</div>`;
      }
      $('#benchList').innerHTML = '';
    }

    // esquemas
    const fitBox = (defs, key, cur) => {
      const opts = Object.entries(defs).map(([k, d]) => [k, d.label]);
      const def = defs[cur] || defs[Object.keys(defs)[0]];
      const fr = D.schemeFit(def, starters);
      const has = Object.keys(def.traits).length > 0;
      const who = fr.who.map((id) => esc(shortName(P(id).name))).join(', ');
      const traitNames = Object.keys(def.traits).map((t) => D.TRAITS[t].icon + ' ' + D.TRAITS[t].label).join(', ');
      return seg(key, opts, cur) + `<div class="fit">
        <div class="fit-desc">${esc(def.desc)}</div>
        ${has ? `<div class="fit-bar"><i style="width:${Math.round(fr.fit * 100)}%"></i></div>
        <div class="fit-txt"><b>Encaixe ${Math.round(fr.fit * 100)}%</b> · ${esc(D.schemeBonusText(cur, fr.fit))}</div>
        <div class="fit-who">${who ? 'Encaixam: ' + who : 'Nenhum titular encaixa'} · rende com ${traitNames}</div>` : ''}
      </div>`;
    };
    $('#schemeBox').innerHTML = fitBox(D.SCHEMES, 'esquema', m.tactics.esquema || 'equilibrado');
    $('#defBox').innerHTML = fitBox(D.DEF_SCHEMES, 'defesa', m.tactics.defesa || 'individual');
    $('#ritmoBox').innerHTML = seg('ritmo', RITMO_OPTS, m.tactics.ritmo);
    renderCardBox();
    renderTimeoutBox();
    if ($('#planArena').dataset.a !== m.arena) { $('#planArena').dataset.a = m.arena; $('#planArena').innerHTML = arenaCard(ARENA(m.arena), { compact: true }); }
  }

  // a caixa da carta só é redesenhada quando o estado muda; o cronômetro é atualizado no lugar
  // (redesenhar a cada lance trocava o botão no meio do clique e o clique se perdia)
  function renderCardBox() {
    const m = me();
    const box = $('#cardBox');
    if (!m || !box || !m.card || !D.CARDS[m.card]) return;
    const c = D.CARDS[m.card];
    const mm = myMatch();
    const st = mm && mm.cards ? mm.cards[mm.teams.indexOf(ME)] : null;
    const live = !!(mm && !mm.done && S.season.status === 'playing');
    const state = !live ? 'off' : st ? st.state : 'ready';
    const key = [m.card, mm ? mm.id : '', state].join('|');
    const fmtLeft = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    if (box.dataset.k === key) {
      const t = $('#cardLeft');
      if (t && st) t.textContent = fmtLeft(st.left);
      return;
    }
    box.dataset.k = key;
    let action;
    if (state === 'off') action = S.season.fast && !S.season.post ? '<span class="muted small">No 82-0 a carta ativa sozinha nos 3 minutos finais de cada jogo.</span>' : '<span class="muted small">Você ativa durante o seu jogo (uma vez por jogo).</span>';
    else if (state === 'active') action = `<b class="card-on">ATIVA · <span id="cardLeft">${fmtLeft(st.left)}</span> restantes</b>`;
    else if (state === 'used') action = '<span class="muted small">Já usada neste jogo.</span>';
    else action = `<button class="btn primary" id="useCardBtn">Ativar ${c.label}</button><span class="muted small">Se não usar, ativa sozinha nos 3 min finais.</span>`;
    box.innerHTML = `<div class="card-line pc-${m.card}"><span class="pc-icon">${c.icon}</span><div><b>${c.label}</b> <span class="muted small">· ${Math.round(c.dur / 60)} min de efeito</span><div class="small" style="color:#c4cede">${esc(c.desc)}</div></div></div><div class="card-act">${action}</div>`;
    const b = $('#useCardBtn');
    if (b) b.onclick = () => {
      b.disabled = true;
      socket.emit('useCard', {}, (r) => { if (r && r.error) { toast(r.error, true); b.disabled = false; } });
    };
  }

  function renderGamePanel(full) {
    const s = S.season;
    const g = s.matches.find((x) => x.id === selectedGame);
    const gp = $('#gamePanel');
    if (!g) { gp.classList.add('hidden'); return; }
    gp.classList.remove('hidden');
    const mine = g.teams.includes(ME);
    $('#gameTitle').textContent = mine ? 'Seu jogo' : 'Assistindo';
    $('#watching').textContent = !mine && myMatch() ? 'Clique no seu jogo ao lado para voltar' : (!mine && ME && s.status === 'playing' ? 'Seu time não joga nesta rodada' : '');
    renderScoreboard();
    if (full) {
      const feed = $('#feed');
      feed.innerHTML = '';
      appendPlays(g.plays.slice(-60), g, true);
    }
  }

  function renderScoreboard() {
    const g = S.season.matches.find((x) => x.id === selectedGame);
    if (!g) return;
    const side = (i) => {
      const m = M(g.teams[i]), t = TEAM[m.team];
      const ld = g.lead && g.lead[i];
      return `<div class="sb-team">${chip(m.team, 'lg')}<div class="tn">${esc(t.name)}</div><div class="mn">${esc(m.name)}</div>
        <div class="sb-score">${g.s[i]}</div>
        ${g.cards && g.cards[i] ? `<div class="sb-card ${g.cards[i].state}">${D.CARDS[g.cards[i].type].icon} ${D.CARDS[g.cards[i].type].label}${g.cards[i].state === 'active' ? ' · ATIVA' : g.cards[i].state === 'used' ? ' · usada' : ''}</div>` : ''}
        ${ld ? `<div class="sb-lead">${esc(shortName(P(ld[0]).name))} <b>${ld[1]} pts</b></div>` : ''}
        ${hot(i)}</div>`;
    };
    const hot = (i) => {
      const ids = Object.entries(g.heat || {}).filter(([pid]) => (g.lineups ? g.lineups[i] : []).includes(pid) || (M(g.teams[i]).roster || []).includes(pid));
      return ids.length ? `<div class="sb-heat">${ids.map(([pid, h]) => `<span class="${h}">${h === 'fire' ? '🔥' : '🧊'} ${esc(shortName(P(pid).name))}</span>`).join('')}</div>` : '';
    };
    const toDots = (i) => (g.to ? (g.to[i] > 0 ? '⏸️' : '<span class="muted">—</span>') : '');
    const status = g.done ? 'Final' + (g.q > 4 ? ` (${g.q - 4 > 1 ? g.q - 4 + 'x ' : ''}prorrogação)` : '') : (g.q > 4 ? 'Prorrogação' : 'Ao vivo');
    const banner = g.ch ? '<div class="sb-ban clutch">⏱️ BOLA DECISIVA</div>'
      : g.hold && g.hold.kind === 'timeout' ? `<div class="sb-ban to">⏸️ TEMPO — ${esc(M(g.teams[g.hold.by]).name)}</div>`
      : g.hold && g.hold.kind === 'clutch' && g.last ? `<div class="sb-ban clutch">${g.last.made ? '🎯 CAIU!' : '🛑 ERROU!'}</div>` : '';
    $('#scoreboard').innerHTML = `${side(0)}<div class="sb-mid"><div class="sb-clock">${g.done ? 'FIM' : esc(g.t)}</div><div class="st">${status}</div>${banner}<div class="muted small" style="margin-top:4px">tempos ${toDots(0)} × ${toDots(1)}</div></div>${side(1)}`;
  }

  function appendPlays(plays, g, initial) {
    const feed = $('#feed');
    if (!feed) return;
    const frag = document.createDocumentFragment();
    for (const p of plays) {
      const div = document.createElement('div');
      div.className = 'play ' + (p.kind || '') + (initial ? '' : ' new');
      const team = p.team >= 0 ? M(g.teams[p.team]) : null;
      if (team) div.style.borderLeftColor = TEAM[team.team].c1;
      const t = document.createElement('span'); t.className = 't'; t.textContent = p.t;
      const x = document.createElement('span'); x.textContent = p.txt;
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = p.s ? `${p.s[0]}-${p.s[1]}` : '';
      div.append(t, x, sc);
      frag.prepend(div);
    }
    feed.prepend(frag);
    while (feed.children.length > 80) feed.lastChild.remove();
  }

  function renderTicker() {
    const s = S.season;
    const box = $('#ticker');
    if (!box) return;
    if (!s.matches.length) { box.innerHTML = '<div class="empty-note">Aguardando o início da rodada.</div>'; return; }
    box.innerHTML = s.matches.map((g) => {
      const line = (i) => {
        const m = M(g.teams[i]);
        const win = g.done && g.s[i] > g.s[1 - i];
        return `<div class="tm">${chip(m.team)}<span class="nm">${esc(m.name)}</span></div><div class="s ${win ? 'w' : ''}">${g.s[i]}</div>`;
      };
      return `<button class="tk ${g.id === selectedGame ? 'sel' : ''}" data-game="${g.id}">${line(0)}${line(1)}<div class="clk">${g.done ? 'Final' : esc(g.t)}${g.teams.includes(ME) ? ' · seu jogo' : ''}</div></button>`;
    }).join('');
    // quem folga
    const playing = new Set(s.matches.flatMap((g) => g.teams));
    const resting = s.stage === 'liga' ? S.managers.filter((m) => !playing.has(m.id)) : [];
    if (resting.length) box.insertAdjacentHTML('beforeend', `<div class="empty-note">Folga: ${resting.map((m) => esc(m.name)).join(', ')}</div>`);
  }

  function renderInterval() {
    const s = S.season;
    const panel = $('#intervalPanel');
    if (s.status === 'prep') {
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="panel-h"><h3>Ajuste seu time</h3><span class="muted small">Escalação, esquema, defesa e ritmo ficam na Prancheta abaixo</span></div>
        <div class="panel-b">${readyHTML('para começar os jogos')}</div>
        <div class="panel-b" style="border-top:1px solid var(--line)"><div class="squads">${S.managers.map((m) => squadHTML(m)).join('')}</div></div>`;
      bindReady();
      return;
    }
    if (s.status !== 'interval') { panel.classList.add('hidden'); return; }
    // pós-temporada do 82-0: só os jogos dos times da sala
    const shown = s.post ? s.results.filter((r) => r.teams.some((mid) => S.managers.some((m) => m.id === mid))) : s.results;
    if (s.post && !shown.length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const first = !s.post && !s.matches.length && !s.results.length;
    let body = '';
    if (shown.length) {
      body += `<div class="panel-b"><div class="muted small" style="font-weight:800;letter-spacing:1px;margin-bottom:8px">RESULTADOS</div><div class="results">${shown.map((r) => {
        const w = r.score[0] > r.score[1] ? 0 : 1;
        const ln = (i) => `<div class="ln ${i === w ? 'w' : ''}">${mchip(r.teams[i])}<span class="nm">${mname(r.teams[i])}</span><b>${r.score[i]}</b></div>`;
        const tops = (r.lead || []).filter(Boolean).map((l) => `${esc(shortName(P(l[0]).name))} ${l[1]}`).join(' · ');
        return `<div class="res">${r.label ? `<div class="muted small">${esc(r.label)}</div>` : ''}${ln(0)}${ln(1)}<div class="top">${r.ot ? 'Prorrogação · ' : ''}${tops}</div></div>`;
      }).join('')}</div></div>`;
      // box score do jogo selecionado
      const bx = (s.boxes || []).find((b) => b.id === selectedGame);
      const g = s.matches.find((x) => x.id === selectedGame);
      if (bx && g) {
        const tbl = (ti) => {
          const rows = Object.entries(bx.box).filter(([, v]) => v.tm === ti).sort((a, b) => b[1].pts - a[1].pts);
          return `<table class="tbl box"><thead><tr><th>${mchip(g.teams[ti])} ${mname(g.teams[ti])}</th><th class="n">PTS</th><th class="n">REB</th><th class="n">AST</th></tr></thead><tbody>${rows.map(([pid, v]) => `<tr><td>${esc(P(pid).name)}</td><td class="n"><b>${v.pts}</b></td><td class="n">${v.reb}</td><td class="n">${v.ast}</td></tr>`).join('')}</tbody></table>`;
        };
        body += `<div class="panel-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;border-top:1px solid var(--line)">${tbl(0)}${tbl(1)}</div>`;
      }
    }
    if (first) {
      body += `<div class="panel-b"><div class="squads">${S.managers.map((m) => squadHTML(m)).join('')}</div></div>`;
    }
    const title = s.post ? 'Fim do dia de playoffs' : first ? 'Elencos definidos' : s.playoff && s.stage === 'playoffs' && !s.matches.length ? 'Classificados para os playoffs' : 'Fim da rodada';
    panel.innerHTML = `<div class="panel-h"><h3>${title}</h3><span class="muted small">Próxima rodada em <b id="intCount" style="color:var(--orange2)">${Math.ceil((s.intervalMs || 0) / 1000)}</b>s</span></div>${body}`;
  }

  function squadHTML(m) {
    const spent = (S.budget || 100) - m.budget;
    const avg = m.roster.length ? Math.round(m.roster.map(P).reduce((a, p) => a + p.ovr, 0) / m.roster.length) : 0;
    return `<div class="panel" style="background:rgba(255,255,255,.02)"><div class="panel-h">${chip(m.team)}<div style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.name)}</div><span class="muted small">média ${avg} · gastou ${money(spent)}</span></div><div class="panel-b">${m.arena ? `<div class="squad-arena" title="${esc(D.arenaText(ARENA(m.arena)))}">🏟️ ${esc(ARENA(m.arena).name)} <span class="muted">· ${esc(D.arenaText(ARENA(m.arena)))}</span></div>` : ''}${m.card && D.CARDS[m.card] ? `<div class="squad-arena">${D.CARDS[m.card].icon} Carta: ${D.CARDS[m.card].label}</div>` : ''}<div class="roster">${rosterHTML(m)}</div></div></div>`;
  }

  function renderTable() {
    const s = S.season;
    const played = s.standings.some((r) => r.w + r.l > 0);
    const show = !s.fast && S.settings.format !== 'playoffs' && (s.stage === 'liga' || played);
    $('#tablePanel').classList.toggle('hidden', !show);
    if (!show) return;
    const cut = S.settings.format === 'ambos' ? (S.managers.length <= 3 ? 2 : S.managers.length <= 8 ? 4 : 8) : 0;
    const fast = !!s.fast;
    $('#table').innerHTML = `<table class="tbl"><thead><tr><th>#</th><th>Time</th><th class="n">V</th><th class="n">D</th>${fast ? '<th class="n">%</th><th class="n">Seq</th>' : ''}<th class="n">Saldo</th></tr></thead><tbody>${s.standings.map((r, i) => {
      const sd = r.pf - r.pa;
      const g = r.w + r.l;
      const pc = g ? (r.w / g).toFixed(3).replace(/^0/, '') : '—';
      const sq = (s.streak || {})[r.mid] || 0;
      return `<tr class="${r.mid === ME ? 'me' : ''} ${cut && i === cut - 1 ? 'cut' : ''} ${fast && r.l === 0 && r.w ? 'unbeaten' : ''}"><td>${i + 1}</td><td><div class="tmc">${mchip(r.mid)}<span class="nm">${mname(r.mid)}</span></div></td><td class="n"><b>${r.w}</b></td><td class="n">${r.l}</td>${fast ? `<td class="n">${pc}</td><td class="n" style="color:${sq >= 0 ? 'var(--green)' : 'var(--red)'}">${streakTxt(sq)}</td>` : ''}<td class="n" style="color:${sd >= 0 ? 'var(--green)' : 'var(--red)'}">${sd > 0 ? '+' : ''}${sd}</td></tr>`;
    }).join('')}</tbody></table>${cut ? '<div class="muted small" style="margin-top:6px">Acima da linha: vão aos playoffs.</div>' : ''}`;
  }

  function bracketHTML(po) {
    if (!po) return '';
    const total = po.rounds[0].length * 2;
    const labels = [];
    let n = total;
    const rounds = [];
    for (let i = 0; i < Math.log2(total); i++) { labels.push(n <= 2 ? 'Final' : n <= 4 ? 'Semifinal' : n <= 8 ? 'Quartas' : 'Oitavas'); n /= 2; }
    for (let i = 0; i < labels.length; i++) rounds.push(po.rounds[i] || Array.from({ length: total / Math.pow(2, i + 1) }, () => ({ teams: [null, null] })));
    const liveIds = new Set((S.season && S.season.status === 'playing' && S.season.stage === 'playoffs') ? S.season.matches.flatMap((g) => g.teams) : []);
    return rounds.map((rd, i) => `<div class="bcol"><h4>${labels[i]}</h4>${rd.map((g) => {
      const live = g.teams[0] && liveIds.has(g.teams[0]) && i === po.cur;
      const bt = (k) => {
        const mid = g.teams[k];
        if (!mid) return `<div class="bt"><span class="nm muted">${g.teams[1 - k] && i === 0 ? 'folga' : 'a definir'}</span></div>`;
        const cls = g.winner ? (g.winner === mid ? 'win' : 'lose') : '';
        return `<div class="bt ${cls}">${mchip(mid)}<span class="nm">${mname(mid)}</span><span class="sc">${g.score ? g.score[k] : ''}</span></div>`;
      };
      return `<div class="bm ${live ? 'live' : ''}">${bt(0)}${bt(1)}</div>`;
    }).join('')}</div>`).join('');
  }

  function renderBracket() {
    const po = S.season.playoff;
    $('#bracketPanel').classList.toggle('hidden', !po);
    if (po) $('#bracket').innerHTML = bracketHTML(po);
  }

  function leadersHTML(list) {
    if (!list || !list.length) return '<div class="empty-note">As estatísticas aparecem depois da primeira rodada.</div>';
    return `<table class="tbl"><thead><tr><th>Jogador</th><th class="n">PTS</th><th class="n">REB</th><th class="n">AST</th></tr></thead><tbody>${list.slice(0, 10).map((l) => `<tr class="${l.mid === ME ? 'me' : ''}"><td><div class="tmc">${mchip(l.mid)}<span class="nm">${esc(shortName(P(l.pid).name))}</span></div></td><td class="n"><b>${(l.pts / l.gp).toFixed(1)}</b></td><td class="n">${(l.reb / l.gp).toFixed(1)}</td><td class="n">${(l.ast / l.gp).toFixed(1)}</td></tr>`).join('')}</tbody></table>`;
  }
  function renderLeaders() { $('#leaders').innerHTML = leadersHTML(S.season.leaders); }

  // ---------- FIM ----------
  function buildEnd() {
    const E = S.end;
    const cm = M(E.champion), ct = TEAM[cm.team];
    const award = (k, pid, mid, d) => pid ? `<div class="panel award"><div class="k">${k}</div><div class="v">${esc(P(pid).name)}</div><div class="d">${mchip(mid)} ${mname(mid)} · ${d}</div></div>` : '';
    const s = S.season;
    $('#screen').innerHTML = `
      <div class="end">
        ${TROPHY}
        ${E.perfect ? '<div class="perfect-ban">82-0 · TEMPORADA PERFEITA</div>' : ''}
        <div class="muted" style="font-weight:800;letter-spacing:2px">CAMPEÃO${E.record ? ` · ${E.record.w}-${E.record.l} na temporada${E.full ? ` · ${E.full.w - E.record.w}-${E.full.l - E.record.l} nos playoffs` : ''}` : ''}</div>
        ${E.unbeaten && E.unbeaten.length && !E.perfect ? `<div class="muted">82-0 na temporada regular: ${E.unbeaten.map((mid) => mname(mid)).join(', ')}</div>` : ''}
        <div class="champ-name" style="color:${ct.c2 === '#ffffff' || ct.c2 === '#1a1a1a' ? 'var(--gold)' : ct.c2}">${esc(ct.city)} ${esc(ct.name)}</div>
        <div style="display:flex;gap:10px;align-items:center;justify-content:center;font-size:18px;font-weight:700">${chip(cm.team, 'lg')} ${esc(cm.name)}${cm.id === ME ? ' <span class="tag you">Você!</span>' : ''}</div>
        <div class="awards">
          ${E.mvp ? award('MVP da temporada', E.mvp.pid, E.mvp.mid, `${E.mvp.ppg.toFixed(1)} pts · ${E.mvp.rpg.toFixed(1)} reb · ${E.mvp.apg.toFixed(1)} ast`) : ''}
          ${E.bargain ? award('Pechincha do leilão', E.bargain.pid, E.bargain.mid, `custou ${money(E.bargain.price)} · ${E.bargain.ppg.toFixed(1)} pts por jogo`) : ''}
          ${E.priciest ? award('Contratação mais cara', E.priciest.pid, E.priciest.mid, `${money(E.priciest.price)} · ${E.priciest.ppg.toFixed(1)} pts por jogo`) : ''}
        </div>
        <div id="endActions" style="margin-bottom:24px"></div>
        <div class="end-grid">
          ${s.playoff ? `<section class="panel"><div class="panel-h"><h3>Playoffs</h3></div><div class="panel-b"><div class="bracket">${bracketHTML(s.playoff)}</div></div></section>` : ''}
          ${s.post ? `<section class="panel end-post">${postHTML(s)}</section>` : ''}
          ${S.settings.format !== 'playoffs' && !s.post ? `<section class="panel"><div class="panel-h"><h3>Classificação final</h3></div><div class="panel-b" id="endTable"></div></section>` : ''}
          <section class="panel"><div class="panel-h"><h3>Cestinhas</h3></div><div class="panel-b">${leadersHTML(s.leaders)}</div></section>
        </div>
        <div class="spacer"></div>
        <section class="panel" style="text-align:left"><div class="panel-h"><h3>Ranking da galera</h3><span class="muted small">atualizado com esta partida · salvo no computador do servidor</span></div><div class="panel-b" id="endRank"><div class="empty-note">Carregando…</div></div></section>
        <div class="spacer"></div>
        <section class="panel" style="text-align:left"><div class="panel-h"><h3>Os elencos</h3></div><div class="panel-b"><div class="squads">${S.managers.map(squadHTML).join('')}</div></div></section>
      </div>`;
    if ($('#endTable')) {
      $('#endTable').innerHTML = `<table class="tbl"><thead><tr><th>#</th><th>Time</th><th class="n">V</th><th class="n">D</th><th class="n">Saldo</th></tr></thead><tbody>${s.standings.map((r, i) => `<tr class="${r.mid === ME ? 'me' : ''}"><td>${i + 1}</td><td><div class="tmc">${mchip(r.mid)}<span class="nm">${mname(r.mid)}</span></div></td><td class="n"><b>${r.w}</b></td><td class="n">${r.l}</td><td class="n">${r.pf - r.pa > 0 ? '+' : ''}${r.pf - r.pa}</td></tr>`).join('')}</tbody></table>`;
    }
    confetti(cm.id === ME ? 160 : 70, [ct.c1, ct.c2, '#ffcf40', '#ffffff']);
    setTimeout(() => loadRanking((d) => { if ($('#endRank')) mountRankBox($('#endRank'), d, { games: 5 }); }), 600);
  }

  function updateEnd() {
    $('#endActions').innerHTML = isHost()
      ? '<button class="btn primary lg" id="againBtn">Jogar de novo com a mesma sala</button>'
      : '<span class="muted">O líder pode começar uma nova partida com a mesma sala.</span>';
    const b = $('#againBtn');
    if (b) b.onclick = () => socket.emit('restart');
  }

  function confetti(n, colors) {
    const box = document.createElement('div');
    box.className = 'confetti';
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
      c.style.animationDelay = Math.random() * 1.5 + 's';
      box.appendChild(c);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 7000);
  }

  // ---------- chat ----------
  function addChat(msg) {
    const log = $('#chatLog');
    const d = document.createElement('div');
    d.className = 'm' + (msg.sys ? ' sys' : '');
    if (msg.sys) d.textContent = msg.text;
    else {
      const b = document.createElement('b');
      const t = TEAM[msg.team];
      b.textContent = msg.from + ':';
      if (t) b.style.color = t.c2 === '#ffffff' || t.c2 === '#1a1a1a' ? '#ffb020' : t.c2;
      d.append(b, document.createTextNode(msg.text));
    }
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function updateBadge() {
    const b = $('#chatBadge');
    b.textContent = unread;
    b.classList.toggle('hidden', !unread);
  }
  $('#chatToggle').onclick = () => {
    chatOpen = !chatOpen;
    $('#chat').classList.toggle('open', chatOpen);
    if (chatOpen) { unread = 0; updateBadge(); $('#chatInput').focus(); $('#chatLog').scrollTop = 1e9; }
  };
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#chatInput').value.trim();
    if (v) socket.emit('chat', { text: v });
    $('#chatInput').value = '';
  };

  // ---------- início ----------
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get('sala') || '').toUpperCase();
  const savedRoom = localStorage.getItem('d100_room');
  const savedName = localStorage.getItem('d100_name');
  if (urlCode && savedName && (savedRoom === urlCode || params.get('auto') === '1')) {
    // volta automaticamente para a sala (ex.: atualizou a página)
    roomCode = urlCode;
    autoJoin = true; // o evento 'connect' faz a entrada
  }
  render();
  // gancho para testes automatizados
  window.__d100 = { emit: (...a) => socket.emit(...a), state: () => S, me: () => ME };
})();
