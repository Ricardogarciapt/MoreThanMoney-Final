// Camada visual da app Missão: cartões com luz e inclinação 3D, folha holográfica nos cartões de jogo,
// aro dourado animado nos cartões principais, entradas em cascata, folhas (modais) com mola e gesto
// para fechar, poeira dourada ao fundo e brasas no palco dos bosses.
// Só transform, opacity e filter. Com «reduzir movimento» fica tudo parado.
(function () {
  'use strict';
  var reduz = false; try { reduz = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  var toque = matchMedia('(hover: none)').matches;
  var MOLA = 'cubic-bezier(.2,.8,.2,1)';

  // ── Estilos ─────────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '@property --fx-a{syntax:"<angle>";inherits:false;initial-value:0deg}',
    'body>.cx{position:relative;z-index:1}#fxPo{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.9}',
    // cartões vivos
    '.fx-c{transform-style:preserve-3d;will-change:auto;transition:transform .55s ' + MOLA + ',box-shadow .4s ' + MOLA + ',border-color .3s}',
    '.fx-c.fx-on{transition:transform .08s linear,box-shadow .2s;box-shadow:0 18px 40px -22px rgba(210,166,60,.55),0 2px 0 rgba(255,255,255,.03) inset}',
    '.conf-card,.cls,.missao,.tile,.kpi{position:relative;overflow:hidden}',
    '.fx-luz{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;opacity:0;transition:opacity .45s ' + MOLA + ';',
    '  background:radial-gradient(420px circle at var(--mx,50%) var(--my,0%),rgba(255,236,190,.16),transparent 42%);mix-blend-mode:screen}',
    '.fx-on>.fx-luz{opacity:1}',
    '.fx-holo>.fx-luz::after{content:"";position:absolute;inset:0;border-radius:inherit;opacity:calc(var(--fx-f,0) * .55);mix-blend-mode:color-dodge;',
    '  background:linear-gradient(calc(110deg + var(--fx-g,0deg)),transparent 20%,rgba(255,80,120,.35) 32%,rgba(255,220,90,.4) 40%,rgba(80,255,180,.35) 48%,rgba(60,170,255,.4) 56%,rgba(190,90,255,.3) 64%,transparent 76%);background-size:220% 220%;background-position:var(--mx,50%) var(--my,50%)}',
    // aro dourado a rodar (só nos cartões principais)
    '.fx-aro{position:absolute;inset:0;border-radius:inherit;padding:1.5px;pointer-events:none;z-index:3;',
    '  background:conic-gradient(from var(--fx-a),transparent 0 62%,rgba(233,196,106,.0) 66%,#E9C46A 78%,#fff3c8 81%,#D2A63C 84%,transparent 90%);',
    '  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);animation:fxAro 6s linear infinite}',
    '@keyframes fxAro{to{--fx-a:360deg}}',
    // brilho que passa ao abrir um cartão principal
    '.fx-varre{position:absolute;inset:0;pointer-events:none;z-index:2;border-radius:inherit;overflow:hidden}.fx-varre::before{content:"";position:absolute;top:-20%;bottom:-20%;width:40%;left:-60%;transform:skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,240,200,.22),transparent);animation:fxVarre 1.1s .25s ' + MOLA + ' forwards}',
    '@keyframes fxVarre{to{left:130%}}',
    // folha (modal)
    '.folha{transition:background-color .3s,backdrop-filter .3s;-webkit-backdrop-filter:blur(10px) saturate(1.2);backdrop-filter:blur(10px) saturate(1.2);background:rgba(3,4,8,.62)}',
    '.folha .caixa{animation:none!important;position:relative;background:radial-gradient(120% 60% at 50% -10%,rgba(210,166,60,.14),transparent 55%),linear-gradient(180deg,#121722,var(--placa) 40%);',
    '  border-color:rgba(233,196,106,.22);box-shadow:0 -30px 80px -30px rgba(210,166,60,.35),0 -1px 0 rgba(255,236,190,.25) inset;touch-action:pan-y}',
    '.folha .caixa::before{content:"";position:sticky;display:block;top:-12px;margin:-8px auto 10px;width:42px;height:5px;border-radius:9px;background:rgba(255,255,255,.22)}',
    '.folha .caixa::after{content:"";position:absolute;left:12%;right:12%;top:0;height:1px;background:linear-gradient(90deg,transparent,#E9C46A,transparent);opacity:.8}',
    // brasas no palco dos bosses e onda de impacto
    '.fx-brasas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}.conf-palco>*:not(.fx-brasas){position:relative;z-index:1}',
    '.fx-onda{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2px solid var(--fx-oc,#E9C46A);pointer-events:none;z-index:4;animation:fxOnda .6s ' + MOLA + ' forwards}',
    '@keyframes fxOnda{from{transform:scale(.4);opacity:.9}to{transform:scale(5);opacity:0;border-width:1px}}',
    '@media (prefers-reduced-motion:reduce){.fx-aro{animation:none}.fx-varre{display:none}#fxPo,.fx-brasas{display:none}}'
  ].join('\n');
  document.head.appendChild(css);

  // ── Cartões: luz que segue o dedo, inclinação 3D e folha holográfica ──────
  var SEL_C = '.placa:not(.vazio), .conf-card, .cls, .missao, .tile, .conf-acc button, .kpi, .contacto';
  var SEL_HOLO = '.conf-card, .cls, .tile, .hud, .insignia';
  var activo = null;
  function preparar(el) {
    if (el.__fx) return; el.__fx = 1;
    el.classList.add('fx-c');
    if (el.matches(SEL_HOLO)) el.classList.add('fx-holo');
    var l = document.createElement('span'); l.className = 'fx-luz'; l.setAttribute('aria-hidden', 'true'); el.appendChild(l);
  }
  function mexer(el, x, y) {
    var r = el.getBoundingClientRect(); if (!r.width) return;
    var px = Math.min(1, Math.max(0, (x - r.left) / r.width)), py = Math.min(1, Math.max(0, (y - r.top) / r.height));
    el.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    el.style.setProperty('--fx-f', Math.min(1, Math.hypot(px - .5, py - .5) * 2).toFixed(2));
    el.style.setProperty('--fx-g', ((px - .5) * 60).toFixed(1) + 'deg');
    if (reduz) return;
    var forca = r.width > 300 ? 4 : 9; // cartões largos inclinam menos
    el.style.transform = 'perspective(900px) rotateX(' + ((.5 - py) * forca).toFixed(2) + 'deg) rotateY(' + ((px - .5) * forca).toFixed(2) + 'deg) scale(' + (toque ? .985 : 1.01) + ')';
  }
  function largar() { if (!activo) return; activo.classList.remove('fx-on'); activo.style.transform = ''; activo = null; }
  function apanhar(ev) {
    var el = ev.target.closest && ev.target.closest(SEL_C); if (!el || el.disabled) return;
    if (activo && activo !== el) largar();
    preparar(el); activo = el; el.classList.add('fx-on'); mexer(el, ev.clientX, ev.clientY);
  }
  document.addEventListener('pointerdown', apanhar, { passive: true });
  document.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'mouse') { var el = ev.target.closest && ev.target.closest(SEL_C); if (el !== activo) { largar(); if (el && !el.disabled) apanhar(ev); } }
    if (activo) mexer(activo, ev.clientX, ev.clientY);
  }, { passive: true });
  ['pointerup', 'pointercancel', 'scroll'].forEach(function (t) { document.addEventListener(t, function (ev) { if (ev.type === 'scroll' || ev.pointerType !== 'mouse') largar(); }, { passive: true, capture: t === 'scroll' }); });
  document.addEventListener('mouseleave', largar);

  // ── Cartões principais: aro dourado e brilho de entrada ───────────────────
  var SEL_HEROI = '.conf-card.grande, .cls.on, .fx-heroi';
  function herois(raiz) {
    (raiz.querySelectorAll ? raiz.querySelectorAll(SEL_HEROI) : []).forEach(function (el) {
      if (el.querySelector(':scope > .fx-aro')) return;
      preparar(el);
      var a = document.createElement('span'); a.className = 'fx-aro'; a.setAttribute('aria-hidden', 'true'); el.appendChild(a);
      if (!reduz) { var v = document.createElement('span'); v.className = 'fx-varre'; v.setAttribute('aria-hidden', 'true'); el.appendChild(v); setTimeout(function () { v.remove(); }, 1600); }
    });
  }

  // ── Entradas em cascata (só quando muda o ecrã, nunca a cada clique) ──────
  var SEL_ENTRA = '.placa, .tile, .conf-card, .missao, .cls, .conf-palco, .conf-acc, .sec-tit, .sub-tit, .kpi';
  function cascata(raiz) {
    if (reduz || !raiz || !raiz.querySelectorAll) return;
    var alto = innerHeight * 1.1, n = 0;
    raiz.querySelectorAll(SEL_ENTRA).forEach(function (el) {
      if (n >= 12 || el.closest('.folha')) return;
      var r = el.getBoundingClientRect(); if (!r.height || r.top > alto) return;
      el.animate([{ opacity: 0, transform: 'translateY(16px) scale(.985)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 520, delay: n++ * 45, easing: MOLA, fill: 'backwards' });
    });
  }
  document.querySelectorAll('.vista').forEach(function (v) {
    new MutationObserver(function () { if (v.classList.contains('on') && !v.__fxOn) { v.__fxOn = 1; requestAnimationFrame(function () { cascata(v); herois(v); }); } else if (!v.classList.contains('on')) v.__fxOn = 0; })
      .observe(v, { attributes: true, attributeFilter: ['class'] });
  });
  // O RPG volta a desenhar o ecrã inteiro a cada acção: só há cascata quando muda de separador ou de ecrã.
  var rpg = document.getElementById('rpgRaiz'), chaveRpg = '';
  if (rpg) new MutationObserver(function () {
    var t = rpg.querySelector('.rpg-topo small'), a = rpg.querySelector('.rpg-abas .on');
    var k = (t ? t.textContent : '') + '|' + (a ? a.textContent : '') + '|' + (rpg.querySelector('.conf-acc') ? 'luta' : '');
    herois(rpg); brasas(rpg);
    if (k !== chaveRpg) { chaveRpg = k; cascata(rpg); }
  }).observe(rpg, { childList: true });

  // ── Folha (modal): entrada com mola, conteúdo em cascata, puxar para fechar ─
  var folha = document.getElementById('folha'), caixa = document.getElementById('folhaC'), aSair = null;
  function entraFolha() {
    if (reduz || !caixa) return;
    caixa.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(-1.6%)', offset: .62 }, { transform: 'translateY(.5%)', offset: .82 }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.25,.9,.3,1)' });
    folha.animate([{ backgroundColor: 'rgba(3,4,8,0)' }, { backgroundColor: 'rgba(3,4,8,.62)' }], { duration: 300, easing: 'ease-out' });
    Array.prototype.slice.call(caixa.children, 0, 10).forEach(function (el, i) {
      if (el.classList.contains('fechar')) return;
      el.animate([{ opacity: 0, transform: 'translateY(12px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 420, delay: 120 + i * 35, easing: MOLA, fill: 'backwards' });
    });
    herois(caixa);
  }
  function sairFolha(fim) {
    if (reduz || !folha || !folha.classList.contains('on')) { fim(); return; }
    if (aSair) return;
    var a1 = caixa.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(40%)', opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    var a2 = folha.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    aSair = { a: [a1, a2], t: setTimeout(function () { var s = aSair; aSair = null; fim(); s.a.forEach(function (x) { x.cancel(); }); }, 210) };
  }
  if (folha && caixa) {
    new MutationObserver(function () { if (folha.classList.contains('on') && !folha.__fxOn) { folha.__fxOn = 1; entraFolha(); } else if (!folha.classList.contains('on')) folha.__fxOn = 0; })
      .observe(folha, { attributes: true, attributeFilter: ['class'] });
    // Se outra folha abre enquanto esta sai (fechar e abrir logo a seguir), a saída é cancelada.
    new MutationObserver(function () { if (aSair) { clearTimeout(aSair.t); aSair.a.forEach(function (x) { x.cancel(); }); aSair = null; entraFolha(); } })
      .observe(caixa, { childList: true });
    // Puxar para baixo a partir do topo fecha a folha.
    var y0 = null, dy = 0;
    caixa.addEventListener('touchstart', function (ev) { if (caixa.scrollTop > 0 || ev.target.closest('input,textarea,select,canvas,video')) { y0 = null; return; } y0 = ev.touches[0].clientY; dy = 0; }, { passive: true });
    caixa.addEventListener('touchmove', function (ev) {
      if (y0 == null) return; dy = ev.touches[0].clientY - y0;
      if (dy > 0 && caixa.scrollTop <= 0) { caixa.style.transition = 'none'; caixa.style.transform = 'translateY(' + (dy < 160 ? dy : 160 + (dy - 160) * .35) + 'px)'; } else { dy = 0; caixa.style.transform = ''; }
    }, { passive: true });
    caixa.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null;
      caixa.style.transition = 'transform .35s ' + MOLA;
      if (dy > 120) { var x = caixa.querySelector('.fechar'); caixa.style.transform = ''; caixa.style.transition = ''; if (x) x.click(); else folha.classList.remove('on'); }
      else { caixa.style.transform = ''; setTimeout(function () { caixa.style.transition = ''; }, 360); }
    }, { passive: true });
  }

  // ── Poeira dourada ao fundo (canvas leve, 30 fps, pára quando a app sai do ecrã) ─
  function poeira() {
    if (reduz) return;
    var c = document.createElement('canvas'); c.id = 'fxPo'; c.setAttribute('aria-hidden', 'true'); document.body.insertBefore(c, document.body.firstChild);
    var x = c.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1), W, H, P = [], ult = 0;
    function medir() { W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr; }
    medir(); addEventListener('resize', medir);
    for (var i = 0; i < 34; i++) P.push({ x: Math.random(), y: Math.random(), r: .6 + Math.random() * 1.8, v: .00004 + Math.random() * .00012, d: Math.random() * 6.28, a: .15 + Math.random() * .45, c: Math.random() < .78 ? '233,196,106' : '30,170,230' });
    function q(t) {
      requestAnimationFrame(q);
      if (document.hidden || t - ult < 33) return; var dt = Math.min(66, t - ult); ult = t;
      x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      P.forEach(function (p) {
        p.y -= p.v * dt; p.d += .0006 * dt; p.x += Math.sin(p.d) * .00005 * dt;
        if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
        var px = p.x * W, py = p.y * H, rr = p.r * dpr, al = p.a * (.6 + .4 * Math.sin(p.d * 3));
        var g = x.createRadialGradient(px, py, 0, px, py, rr * 5); g.addColorStop(0, 'rgba(' + p.c + ',' + al + ')'); g.addColorStop(1, 'rgba(' + p.c + ',0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, rr * 5, 0, 6.283); x.fill();
      });
    }
    requestAnimationFrame(q);
  }

  // ── Brasas no palco do boss (vermelhas na fase 2) ─────────────────────────
  function brasas(raiz) {
    if (reduz) return;
    var palco = raiz.querySelector('.conf-palco'); if (!palco || palco.querySelector('.fx-brasas')) return;
    var c = document.createElement('canvas'); c.className = 'fx-brasas'; c.setAttribute('aria-hidden', 'true'); palco.insertBefore(c, palco.firstChild);
    var x = c.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1), P = [], ult = 0;
    var W = c.width = palco.clientWidth * dpr, H = c.height = palco.clientHeight * dpr;
    function nova(y) { return { x: Math.random() * W, y: y == null ? H + Math.random() * 20 : y, v: (.02 + Math.random() * .05) * dpr, r: (.8 + Math.random() * 2) * dpr, w: Math.random() * 6.28, vida: 1 }; }
    for (var i = 0; i < 26; i++) P.push(nova(Math.random() * H));
    (function q(t) {
      if (!c.isConnected) return; requestAnimationFrame(q);
      if (document.hidden || t - ult < 33) return; var dt = Math.min(66, t - ult); ult = t;
      var f2 = palco.classList.contains('f2'), cor = f2 ? '255,90,60' : getComputedStyle(palco).getPropertyValue('--fx-rgb') || '233,196,106';
      x.clearRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      P.forEach(function (p, k) {
        p.y -= p.v * dt * (f2 ? 1.8 : 1); p.w += .004 * dt; p.x += Math.sin(p.w) * .25 * dpr;
        var al = Math.max(0, Math.min(1, p.y / H)) * .8;
        if (p.y < 0) { P[k] = nova(); return; }
        var g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4); g.addColorStop(0, 'rgba(' + cor + ',' + al + ')'); g.addColorStop(1, 'rgba(' + cor + ',0)');
        x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r * 4, 0, 6.283); x.fill();
      });
    })(0);
  }

  function onda(el, cor) {
    if (reduz || !el) return;
    var o = document.createElement('span'); o.className = 'fx-onda'; if (cor) o.style.setProperty('--fx-oc', cor);
    el.appendChild(o); setTimeout(function () { o.remove(); }, 650);
  }

  if (document.getElementById('app')) poeira();
  window.MissaoFX = { sairFolha: sairFolha, cascata: cascata, herois: herois, onda: onda };
})();
