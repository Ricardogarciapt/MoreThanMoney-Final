// RPG «Operação Liberdade» da app Missão: personagem, kits, campanha com dados, escape rooms
// rotativos com uma fechadura em realidade aumentada, e mesas de jogo entre membros.
// Usa as peças da app (window.MISSAO). Os dados lançam-se no servidor.
(function () {
  'use strict';
  var API = '/api/ricardogarcia/app/rpg';
  var M = window.MISSAO, raiz = document.getElementById('rpgRaiz');
  if (!M || !raiz) return;
  var esc = M.esc, toast = M.toast, modal = M.modal, fechar = M.fechar;
  var R = null, aba = 'ficha', salaAberta = null, mesaAberta = null, poll = null, ultimoLog = 0, relogio = null;
  var NOMES = { dis: 'Disciplina', foc: 'Foco', ene: 'Energia', con: 'Conhecimento', cor: 'Coragem', red: 'Rede' };
  var CURTO = { dis: 'DIS', foc: 'FOC', ene: 'ENE', con: 'CON', cor: 'COR', red: 'RED' };

  function pedir(body, qs) {
    return fetch(API + (qs || ''), { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, erro: 'Sem ligação. Tenta outra vez.' }; }); });
  }
  function accao(body, ok) {
    return pedir(body).then(function (r) {
      if (!r.ok) { toast(esc(r.erro || 'Não deu. Tenta outra vez.')); return r; }
      if (r.ficha !== undefined || r.salas) { R = Object.assign(R || {}, r); }
      if (ok) ok(r);
      if (r.ganho && r.ganho.xp) M.recarregar();
      return r;
    });
  }
  var sinal = function (n) { return n >= 0 ? '+' + n : '' + n; };
  var classeDe = function (id) { return ((R && R.meta.classes) || []).filter(function (c) { return c.id === id; })[0] || { emoji: '🎲', nome: '', cor: '#E9C46A', talentos: [] }; };
  var mmss = function (s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };

  // ── Estilos do jogo (mesma paleta da app) ───────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    '.rpg-topo{display:flex;align-items:center;gap:10px;margin:2px 0 12px}.rpg-topo button.voltar{background:var(--placa2);border:1px solid var(--linha);color:var(--texto);border-radius:12px;width:42px;height:42px;font-size:22px}',
    '.rpg-topo h3{margin:0;font-family:Anton;letter-spacing:.5px;font-size:24px;line-height:1}.rpg-topo small{display:block;color:var(--cinza);font-size:12px;letter-spacing:1.5px;text-transform:uppercase}',
    '.rpg-abas{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:14px}.rpg-abas button{min-height:44px;border-radius:12px;border:1px solid var(--linha);background:var(--placa2);color:var(--cinza);font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:4px}',
    '.rpg-abas button span{display:block;font-size:18px;margin-bottom:2px}.rpg-abas button.on{color:#111;background:linear-gradient(135deg,var(--ouro2),var(--ouro));border-color:transparent}',
    '.heroi{display:grid;grid-template-columns:84px 1fr;gap:14px;align-items:center}.heroi .em{width:84px;height:84px;border-radius:22px;display:grid;place-items:center;font-size:44px;background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.12),transparent 60%),#0a0d13;border:2px solid var(--c,#E9C46A);box-shadow:0 0 30px -8px var(--c,#E9C46A)}',
    '.heroi h4{margin:0 0 2px;font-family:Anton;font-size:26px;letter-spacing:.3px}.heroi .sub{color:var(--cinza);font-size:13px}.heroi .nv{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:999px;background:rgba(210,166,60,.15);color:var(--ouro2);font-size:12px;letter-spacing:1px;text-transform:uppercase}',
    '.atrs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.atr{background:#0a0d13;border:1px solid var(--linha);border-radius:14px;padding:10px 8px;text-align:center;cursor:pointer}.atr b{display:block;font-family:Anton;font-size:30px;line-height:1;color:var(--ouro2)}',
    '.atr small{display:block;font-size:11px;letter-spacing:1.5px;color:var(--cinza);margin-top:4px}.atr i{font-style:normal;font-size:12px;color:var(--ciano)}.atr .barra{height:4px;border-radius:4px;background:var(--linha);margin-top:6px;overflow:hidden}.atr .barra s{display:block;height:100%;background:linear-gradient(90deg,var(--ciano),var(--ouro2))}',
    '.kits{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.kit{background:#0a0d13;border:1px solid var(--linha);border-radius:14px;padding:10px;text-align:left;color:var(--texto);font:inherit;position:relative}.kit .e{font-size:26px}.kit b{display:block;font-size:14px;margin:4px 0 2px}.kit small{color:var(--cinza);font-size:12px;display:block}',
    '.kit.on{border-color:var(--ouro2);background:linear-gradient(135deg,rgba(210,166,60,.16),#0a0d13)}.kit.on:after{content:"EQUIPADO";position:absolute;top:8px;right:8px;font-size:9px;letter-spacing:1px;color:var(--ouro2)}.kit.lock{opacity:.45}.kit .bn{color:var(--ciano);font-size:12px}',
    '.tal{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--linha);font-size:14px}.tal .n{flex:0 0 52px;font-size:11px;letter-spacing:1px;color:var(--cinza);text-transform:uppercase;padding-top:2px}.tal.off{opacity:.45}',
    '.classes{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.cls{background:#0a0d13;border:1px solid var(--linha);border-radius:14px;padding:12px;text-align:left;color:var(--texto);font:inherit}.cls .e{font-size:30px}.cls b{display:block;margin:4px 0 2px}.cls small{display:block;color:var(--cinza);font-size:12px;line-height:1.35}.cls.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c) inset}',
    '.cap{display:flex;gap:12px;align-items:center}.cap .num{flex:0 0 46px;height:46px;border-radius:12px;display:grid;place-items:center;font-family:Anton;font-size:22px;background:#0a0d13;border:1px solid var(--linha)}.cap.feito .num{border-color:var(--ouro2);color:var(--ouro2)}.cap.lock{opacity:.45}.cap b{display:block}.cap small{color:var(--cinza);font-size:13px}',
    '.cena h4{font-family:Anton;font-size:26px;margin:4px 0 8px;letter-spacing:.3px}.cena p.txt{font-size:16px;line-height:1.55;margin:0 0 12px}.licao{border-left:3px solid var(--ouro2);padding:8px 12px;background:rgba(210,166,60,.08);border-radius:0 10px 10px 0;font-size:14px;margin:0 0 12px}',
    '.opc{display:block;width:100%;text-align:left;margin-bottom:8px;padding:12px 14px;border-radius:14px;border:1px solid var(--linha);background:#0a0d13;color:var(--texto);font:inherit;font-size:15px}.opc:active{transform:scale(.99)}.opc .tt{display:block;margin-top:6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--ciano)}',
    '.talsw{display:flex;gap:10px;align-items:center;font-size:14px;margin:4px 0 12px;color:var(--cinza)}.talsw input{width:auto}',
    '.dado{width:120px;height:120px;margin:10px auto;display:grid;place-items:center;font-family:Anton;font-size:56px;color:#111;background:linear-gradient(135deg,var(--ouro2),var(--ouro));clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}.dado.rola{animation:rpgrola .55s linear infinite}@keyframes rpgrola{to{transform:rotate(360deg)}}',
    '.res{text-align:center}.res .conta{font-size:15px;color:var(--cinza);margin:4px 0}.res .ok{color:var(--verde);font-family:Anton;font-size:28px}.res .ko{color:var(--verm);font-family:Anton;font-size:28px}',
    '.sala{position:relative}.sala .em{font-size:34px}.sala h4{margin:4px 0 2px;font-size:19px}.sala .tag2{position:absolute;top:12px;right:12px;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:rgba(30,170,230,.15);color:var(--ciano)}.sala .tag2.sai{background:rgba(255,122,107,.15);color:var(--verm)}',
    '.enig{margin-bottom:10px}.enig.feito{border-color:rgba(60,207,142,.5)}.enig .p{font-size:15px;line-height:1.45;margin:6px 0 10px}.enig .linha{display:flex;gap:8px}.enig .linha input{flex:1}.enig .linha .btn{width:auto;min-height:46px}.cadeados{display:flex;justify-content:center;gap:8px;font-size:22px;margin:4px 0 10px}.cadeados span{filter:grayscale(1) brightness(.7);transition:filter .3s}.cadeados span.ab{filter:none}.cadeados span.agora{animation:rpgAbre .7s cubic-bezier(.2,1.6,.4,1)}.enig.abriu{animation:rpgBrilho 1.2s ease-out}@keyframes rpgAbre{0%{transform:scale(.4) rotate(-20deg)}60%{transform:scale(1.35) rotate(8deg)}100%{transform:none}}@keyframes rpgBrilho{0%{box-shadow:0 0 0 0 rgba(233,196,106,.8)}100%{box-shadow:0 0 0 18px rgba(233,196,106,0)}}@media (prefers-reduced-motion:reduce){.cadeados span.agora,.enig.abriu{animation:none}}.enig-img{margin:0 0 10px}.enig-img img{display:block;width:100%;border-radius:12px;border:1px solid var(--linha);background:#0a0d13;cursor:zoom-in}.enig-img figcaption{font-size:11px;color:var(--texto-m);margin-top:4px;letter-spacing:.04em}.foto-btn{display:flex;align-items:center;justify-content:center;cursor:pointer}.enig .op{display:block;width:100%;text-align:left;margin-bottom:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--linha);background:#0a0d13;color:var(--texto);font:inherit;font-size:14px}',
    '.relogio{font-family:Anton;font-size:30px;color:var(--ouro2);text-align:center;margin:4px 0 10px}.relogio.fim{color:var(--verm)}',
    '.rank{list-style:none;padding:0;margin:8px 0 0}.rank li{display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid var(--linha);font-size:14px}',
    '.mesa-log{max-height:46vh;overflow:auto;padding:4px 2px;margin:8px 0;display:flex;flex-direction:column;gap:6px}.lg{font-size:14px;line-height:1.4;padding:8px 10px;border-radius:12px;background:#0a0d13;border:1px solid var(--linha)}.lg b{color:var(--ouro2);font-weight:600}.lg.eu{border-color:rgba(30,170,230,.4)}',
    '.lg.dado{border-color:rgba(210,166,60,.5);background:rgba(210,166,60,.07)}.lg.dado.crit{box-shadow:0 0 0 1px var(--verde) inset}.lg.dado.falh{box-shadow:0 0 0 1px var(--verm) inset}.lg.cena{font-family:Kalam;font-size:17px;border-color:rgba(201,167,255,.5);background:rgba(201,167,255,.07)}.lg.sistema,.lg.xp{background:none;border:0;color:var(--cinza);font-size:12px;text-align:center;padding:2px}',
    '.jogs{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}.jog{flex:0 0 auto;background:#0a0d13;border:1px solid var(--linha);border-radius:12px;padding:6px 10px;font-size:13px;color:var(--texto);font:inherit}.jog .e{margin-right:4px}.jog small{color:var(--cinza)}',
    '.dados{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.dados button{border:1px solid var(--linha);background:var(--placa2);color:var(--texto);border-radius:10px;padding:8px 12px;font-weight:700}.dados select{width:auto;padding:8px;font-size:14px!important;border-radius:10px;background:#0a0d13;color:var(--texto);border:1px solid var(--linha)}',
    '.compor-m{display:flex;gap:8px}.compor-m textarea{min-height:44px;max-height:120px;resize:none;padding:10px 12px}.compor-m .btn{width:auto}',
    '.conf-intro{margin-bottom:12px}.conf-grelha{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.conf-grelha .conf-card{flex-direction:column;text-align:center;align-items:center}.conf-grelha .conf-info{align-items:center}.conf-grelha .conf-ret{width:84px;height:84px;border-radius:50%}.conf-grelha .conf-tag{align-self:center}',
    '.conf-card{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:10px;border-radius:16px;border:1px solid var(--linha);background:radial-gradient(120% 140% at 0 0,color-mix(in srgb,var(--c) 18%,transparent),var(--placa2) 60%);color:inherit;transition:transform .2s,border-color .2s}.conf-card:active{transform:scale(.98)}',
    '.conf-card.grande{padding:14px;margin-bottom:6px;border-color:color-mix(in srgb,var(--c) 55%,transparent);box-shadow:0 10px 40px -18px var(--c)}.conf-card.grande .conf-ret{width:96px;height:96px}.conf-card.grande b{font-family:Anton;font-size:24px;letter-spacing:.5px}',
    '.conf-ret{flex:none;width:56px;height:56px;border-radius:14px;overflow:hidden;background:#0b0b0d}.conf-ret img{width:100%;height:100%;object-fit:cover;display:block}.conf-info{display:flex;flex-direction:column;gap:2px;min-width:0}.conf-info b{font-size:15px}.conf-info small{font-size:12px;color:var(--cinza)}',
    '.conf-card.fechado{opacity:.55}.conf-card.fechado img{filter:grayscale(1) brightness(.5)}.conf-lock{color:var(--cinza)}',
    '.conf-tag{display:inline-block;align-self:flex-start;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.08);color:var(--texto);margin-top:3px;vertical-align:middle}.conf-tag.ok{background:rgba(60,207,142,.18);color:var(--verde)}.conf-tag.sem{background:linear-gradient(135deg,var(--ouro2),var(--ouro));color:#111}.conf-tag.fin{background:rgba(232,72,72,.2);color:#ff8a8a}',
    '.conf-palco{position:relative;text-align:center;padding:14px 12px 12px;margin-bottom:10px;border-radius:20px;border:1px solid color-mix(in srgb,var(--c) 40%,transparent);background:radial-gradient(90% 70% at 50% 30%,color-mix(in srgb,var(--c) 26%,transparent),#08080a 75%);overflow:hidden}',
    '.conf-palco.f2{border-color:#e84848;background:radial-gradient(90% 70% at 50% 30%,rgba(232,72,72,.32),#0a0606 75%)}.conf-palco.flash::after{content:"";position:absolute;inset:0;background:#fff;animation:cFlash .7s ease-out forwards;pointer-events:none}',
    '.conf-boss{position:relative;width:min(40vw,160px);aspect-ratio:1;margin:0 auto;animation:cFlut 3.2s ease-in-out infinite}.conf-boss img{width:100%;height:100%;object-fit:cover;border-radius:50%;-webkit-mask-image:radial-gradient(circle,#000 58%,transparent 71%);mask-image:radial-gradient(circle,#000 58%,transparent 71%)}.conf-boss::before{content:"";position:absolute;inset:8%;border-radius:50%;box-shadow:0 0 60px 6px var(--c);opacity:.55}.conf-palco.f2 .conf-boss img{filter:saturate(1.4) hue-rotate(-12deg)}.conf-palco.f2 .conf-boss::before{box-shadow:0 0 70px 10px #e84848}',
    '.conf-nome{font-family:Anton;font-size:24px;letter-spacing:.5px;margin:2px 0 6px}.conf-ult{min-height:40px;margin-top:8px;font-size:13px;text-align:left}.conf-ult p{margin:0 0 3px;animation:cEntra .35s ease-out}.conf-ult p.ele{color:#ff9d9d}.conf-ult p.sistema{color:var(--ouro2);font-weight:700}.conf-ult em{display:none}',
    '.conf-barra{position:relative;height:26px;border-radius:9px;background:rgba(255,255,255,.07);overflow:hidden;margin:6px 0}.conf-barra i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#b8322f,#e84848);transition:width .45s cubic-bezier(.2,.8,.2,1)}.conf-barra.eu i{background:linear-gradient(90deg,var(--ouro),var(--ouro2))}',
    '.conf-barra span{position:relative;display:block;line-height:26px;font-size:13px;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000}.conf-barra.eu span{color:#111;text-shadow:none;font-weight:600}',
    '.conf-int{display:flex;gap:10px;align-items:center;text-align:left;margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(0,0,0,.45);border:1px dashed rgba(255,255,255,.18);font-size:14px;animation:cPulsa 1.6s ease-in-out infinite}.conf-int span{font-size:24px}.conf-int small{display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--cinza)}.conf-int.forte{border-color:#e84848}.conf-int.forte small{color:#ff8a8a}',
    '.conf-eu{margin-bottom:10px}.conf-foco{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.conf-foco small{font-size:12px;color:var(--cinza)}.conf-foco i{width:14px;height:14px;transform:rotate(45deg);border-radius:3px;background:rgba(255,255,255,.1);transition:background .3s}.conf-foco i.on{background:var(--ciano);box-shadow:0 0 10px var(--ciano)}.conf-turno{margin-left:auto;font-size:12px;color:var(--cinza);font-variant-numeric:tabular-nums}',
    '.conf-acc{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}.conf-acc button{min-height:74px;padding:8px 4px;border-radius:14px;border:1px solid var(--linha);background:var(--placa2);color:inherit;display:flex;flex-direction:column;align-items:center;gap:2px;transition:transform .15s,background .2s}.conf-acc button:active{transform:scale(.96)}',
    '.conf-acc button .e{font-size:22px}.conf-acc button b{font-size:13px}.conf-acc button small{font-size:11px;color:var(--ciano)}.conf-acc button.fraco{border-color:var(--ouro);box-shadow:inset 0 0 0 1px var(--ouro)}.conf-acc button.tec{grid-column:span 3;flex-direction:row;justify-content:center;gap:8px;min-height:52px;background:linear-gradient(135deg,rgba(210,166,60,.22),rgba(30,170,230,.14))}.conf-acc button:disabled{opacity:.35}',
    '.conf-log{max-height:220px;overflow:auto;padding:10px 12px;border-radius:14px;background:rgba(0,0,0,.35);font-size:13px}.conf-log p{margin:0 0 6px;animation:cEntra .35s ease-out}.conf-log p.ele{color:#ff9d9d}.conf-log p.sistema{color:var(--ouro2);font-weight:700}.conf-log p.crit{font-weight:700}.conf-log em{display:block;font-style:normal;font-size:11px;color:var(--cinza)}',
    '.conf-fala{font-family:Kalam,cursive;font-size:19px;line-height:1.35;margin:0;color:var(--texto)}',
    '.conf-num{position:absolute;top:30%;font-family:Anton;font-size:34px;color:#fff;text-shadow:0 2px 0 #b8322f,0 0 18px #e84848;pointer-events:none;animation:cNum 1.1s ease-out forwards}.conf-num.crit{font-size:52px;color:var(--ouro2)}.conf-num.fraco{color:var(--ouro2)}.conf-num.cura{color:#7dffb8;text-shadow:0 0 14px #1d8a55}.conf-num.falha{font-size:22px;color:var(--cinza);text-shadow:none}',
    '.treme{animation:cTreme .35s}.treme2{animation:cTreme2 .5s}',
    '@keyframes cFlut{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes cNum{0%{transform:translateY(0) scale(.6);opacity:0}15%{transform:translateY(-6px) scale(1.15);opacity:1}100%{transform:translateY(-70px) scale(1);opacity:0}}',
    '@keyframes cTreme{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}@keyframes cTreme2{0%,100%{transform:translate(0)}15%{transform:translate(-12px,4px) rotate(-1.5deg)}30%{transform:translate(10px,-5px) rotate(1deg)}50%{transform:translate(-8px,3px)}70%{transform:translate(6px,-2px)}85%{transform:translate(-3px,1px)}}',
    '@keyframes cFlash{0%{opacity:.45}100%{opacity:0}}@keyframes cPulsa{0%,100%{box-shadow:0 0 0 0 rgba(232,72,72,0)}50%{box-shadow:0 0 0 4px rgba(232,72,72,.12)}}@keyframes cEntra{from{opacity:0;transform:translateY(-4px)}}',
    '@media (prefers-reduced-motion:reduce){.conf-boss,.conf-int{animation:none}.treme,.treme2{animation:none}.conf-num{animation-duration:.6s}}',
    '#ra{position:fixed;inset:0;z-index:300;background:#000;display:none}#ra.on{display:block}#ra video,#ra canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#ra .hud{position:absolute;left:0;right:0;bottom:0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.85));color:#fff;text-align:center}',
    '#ra .x{position:absolute;top:calc(12px + env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:24px;z-index:2}#ra .cod{font-family:Anton;font-size:44px;color:var(--ouro2);letter-spacing:4px}'
  ].join('\n');
  document.head.appendChild(css);

  // ── Abrir e desenhar ────────────────────────────────────────────────────
  function abrir() {
    raiz.innerHTML = '<div class="placa vazio">A carregar o jogo…</div>';
    pedir().then(function (r) { if (!r.ok) { raiz.innerHTML = '<div class="placa vazio">' + esc(r.erro || 'Não consegui abrir o jogo.') + '</div>'; return; } R = r; desenhar(); });
  }
  function topo(sub) {
    return '<div class="rpg-topo"><button class="voltar" type="button" data-r="voltar" aria-label="Voltar">‹</button><div><small>' + esc(sub || 'RPG da app Missão') + '</small><h3>' + esc(R.meta.nome) + '</h3></div></div>';
  }
  function desenhar() {
    pararMesa(); clearInterval(relogio);
    if (!R.ficha) return criar();
    if (salaAberta) return desenharSala();
    if (mesaAberta) return desenharMesa();
    if (confAberto) return desenharConfronto();
    var A = [['ficha', '🛡️', 'Personagem'], ['campanha', '📜', 'Campanha'], ['escape', '🗝️', 'Escape'], ['confronto', '⚔️', 'Bosses'], ['mesas', '🎲', 'Mesas']];
    var h = topo('Nível ' + R.nivel + ' · ' + classeDe(R.ficha.classe).nome) + '<div class="rpg-abas">' + A.map(function (a) { return '<button type="button" data-aba="' + a[0] + '" class="' + (aba === a[0] ? 'on' : '') + '"><span>' + a[1] + '</span>' + a[2] + '</button>'; }).join('') + '</div>';
    h += { ficha: vFicha, campanha: vCampanha, escape: vEscape, confronto: vConfronto, mesas: vMesas }[aba]();
    raiz.innerHTML = h + '<p class="texto-m" style="font-size:12px;color:var(--cinza);text-align:center;margin-top:14px">Ficção educativa. Nada aqui é aconselhamento financeiro nem promessa de resultados.</p>';
  }

  // ── Criar personagem ────────────────────────────────────────────────────
  var novo = { nome: '', classe: null, origem: null };
  function criar(editar) {
    if (editar && R.ficha) novo = { nome: R.ficha.nome, classe: R.ficha.classe, origem: R.ficha.origem };
    var h = topo(editar ? 'Editar personagem' : 'Cria a tua personagem');
    h += '<div class="placa" style="margin-bottom:12px"><p class="texto-m" style="margin-top:0;font-size:15px">Uma história sobre sair da rotina e construir a tua liberdade. Os teus atributos crescem com as missões que fazes na app, e o teu nível é a tua patente.</p>' +
      '<label for="rNome">Nome da personagem</label><input id="rNome" maxlength="30" value="' + esc(novo.nome) + '" placeholder="Ex.: Ana «Foco» Silva"></div>';
    h += '<div class="sub-tit">Classe</div><div class="classes">' + R.meta.classes.map(function (c) {
      return '<button type="button" class="cls' + (novo.classe === c.id ? ' on' : '') + '" style="--c:' + c.cor + '" data-cls="' + c.id + '"><span class="e">' + c.emoji + '</span><b>' + esc(c.nome) + '</b><small>' + esc(c.lema) + '</small><small style="color:var(--ciano);margin-top:4px">' + c.principal.map(function (a) { return NOMES[a]; }).join(' · ') + '</small></button>';
    }).join('') + '</div>';
    h += '<div class="sub-tit">Origem</div><div class="chips">' + R.meta.origens.map(function (o) { return '<button type="button" data-org="' + o.id + '"' + (novo.origem === o.id ? ' class="on"' : '') + ' title="' + esc(o.texto) + '">' + esc(o.nome) + ' · +1 ' + CURTO[o.bonus] + '</button>'; }).join('') + '</div>';
    var o = R.meta.origens.filter(function (x) { return x.id === novo.origem; })[0];
    h += '<p class="texto-m" style="font-size:14px;color:var(--cinza);min-height:20px">' + (o ? esc(o.texto) : '') + '</p>';
    h += '<button class="btn" type="button" data-r="criar">' + (editar ? 'Guardar' : 'Começar a aventura') + '</button>' + (editar ? '<div style="height:8px"></div><button class="btn sec" type="button" data-aba="ficha">Cancelar</button><p class="texto-m" style="font-size:12px;color:var(--cinza)">Mudar de classe troca os kits iniciais.</p>' : '');
    raiz.innerHTML = h; raiz.__editar = !!editar;
  }

  // ── Personagem ──────────────────────────────────────────────────────────
  function vFicha() {
    var f = R.ficha, c = classeDe(f.classe), org = R.meta.origens.filter(function (o) { return o.id === f.origem; })[0] || {};
    var eq = f.kits.filter(function (k) { return k.equipado; }).length;
    var h = '<div class="placa"><div class="heroi" style="--c:' + c.cor + '"><div class="em">' + c.emoji + '</div><div><h4>' + esc(f.nome) + '</h4><div class="sub">' + esc(c.nome) + ' · ' + esc(org.nome || '') + '</div><span class="nv">Nível ' + f.nivel + '</span></div></div>' +
      '<div class="atrs">' + f.atributos.map(function (a) {
        var extra = a.kit + a.talento;
        return '<div class="atr" data-atr="' + a.id + '"><b>' + a.v + '</b><i>' + sinal(a.mod) + (extra ? ' · +' + extra : '') + '</i><small>' + CURTO[a.id] + '</small><div class="barra"><s style="width:' + Math.round(a.v / 20 * 100) + '%"></s></div></div>';
      }).join('') + '</div><p class="texto-m" style="font-size:13px;color:var(--cinza);margin:0">Toca num atributo para veres como cresce. Nos testes lanças um d20 e somas o modificador, os kits e os talentos.</p></div>';
    h += '<div class="sub-tit">Talentos</div><div class="placa">' + f.talentos.map(function (t) { return '<div class="tal' + (t.activo ? '' : ' off') + '"><span class="n">Nív. ' + t.nivel + '</span><div><b>' + esc(t.nome) + '</b><br><span style="color:var(--cinza)">' + esc(t.texto) + '</span></div></div>'; }).join('') + '</div>';
    h += '<div class="sub-tit">Kits · ' + eq + ' de 3 equipados</div><div class="kits">' + f.kits.map(function (k) {
      var bn = Object.keys(k.bonus).map(function (a) { return '+' + k.bonus[a] + ' ' + CURTO[a]; }).join(' ');
      return '<button type="button" class="kit' + (k.equipado ? ' on' : '') + (k.disponivel ? '' : ' lock') + '" data-kit="' + k.id + '"><span class="e">' + k.emoji + '</span><b>' + esc(k.nome) + '</b><span class="bn">' + bn + '</span><small>' + (k.disponivel ? esc(k.texto) : '🔒 ' + esc(k.requisito)) + '</small></button>';
    }).join('') + '</div>';
    h += '<div style="height:12px"></div><div class="dacoes"><button class="btn sec" type="button" data-r="editar">Editar</button><button class="btn sec" type="button" data-r="imprimir">🖨️ Imprimir ficha</button></div>';
    return h;
  }

  // ── Campanha ────────────────────────────────────────────────────────────
  function vCampanha() {
    var f = R.ficha, h = '';
    if (f.cena) {
      var cap = R.meta.capitulos.filter(function (c) { return c.n === f.capitulo; })[0] || {};
      h += '<div class="placa cena"><div class="mono">Capítulo ' + f.capitulo + ' · ' + esc(cap.titulo || '') + '</div><h4>' + esc(f.cena.titulo) + '</h4><p class="txt">' + esc(f.cena.texto) + '</p>' + (f.cena.licao ? '<div class="licao">💡 ' + esc(f.cena.licao) + '</div>' : '');
      if (f.cena.fim) {
        var prox = R.meta.capitulos.filter(function (c) { return c.n === f.capitulo + 1; })[0];
        h += '<div class="mono" style="color:var(--ouro2);margin-bottom:10px">🎖️ Capítulo concluído</div>' + (prox ? '<button class="btn" type="button" data-cap="' + prox.n + '">Capítulo ' + prox.n + ': ' + esc(prox.titulo) + '</button>' : '<p class="texto-m" style="font-size:14px">Chegaste ao fim da campanha. Novos capítulos entram com as próximas missões. Entretanto, junta-te a uma mesa ou tenta os escape rooms.</p>');
      } else {
        var tal = f.talentos.filter(function (t) { return t.nivel === 1; })[0];
        if (f.talento_disponivel && tal) h += '<label class="talsw"><input type="checkbox" id="rTal"> Usar talento «' + esc(tal.nome) + '» (' + (f.talento_tipo === 'repetir' ? 'repete se falhares' : '+4 no teste') + ', 1× por capítulo)</label>';
        h += f.cena.opcoes.map(function (o, i) {
          var tt = '';
          if (o.teste) { var a = f.atributos.filter(function (x) { return x.id === o.teste.atr; })[0]; var b = a.mod + a.kit + a.talento; tt = '<span class="tt">🎲 ' + NOMES[o.teste.atr] + ' · CD ' + o.teste.cd + ' · o teu bónus ' + sinal(b) + '</span>'; }
          return '<button type="button" class="opc" data-rop="' + i + '">' + esc(o.t) + tt + '</button>';
        }).join('');
      }
      h += '</div>';
    }
    h += '<div class="sub-tit">Capítulos</div>' + R.meta.capitulos.map(function (c) {
      var feito = f.capitulos_feitos.indexOf(c.n) >= 0, livre = c.n === 1 || f.capitulos_feitos.indexOf(c.n - 1) >= 0, agora = f.capitulo === c.n && f.cena && !f.cena.fim;
      return '<div class="placa cap' + (feito ? ' feito' : '') + (livre ? '' : ' lock') + '" style="margin-bottom:8px"><div class="num">' + (feito ? '✓' : c.n) + '</div><div style="flex:1"><b>' + esc(c.titulo) + '</b><small>' + esc(c.resumo) + '</small></div>' +
        (livre && !agora ? '<button class="btn sec" style="width:auto;min-height:38px;padding:0 12px;font-size:12px" type="button" data-cap="' + c.n + '">' + (feito ? 'Rejogar' : 'Jogar') + '</button>' : agora ? '<span class="mono" style="color:var(--ciano)">A jogar</span>' : '🔒') + '</div>';
    }).join('');
    if (f.diario.length) h += '<div class="sub-tit">Diário da campanha</div><div class="placa">' + f.diario.map(function (d) {
      return '<div class="tal"><span class="n">Cap. ' + d.cap + '</span><div><b>' + esc(d.cena) + '</b> · ' + esc(d.escolha) + (d.teste ? ' <span style="color:' + (d.teste.ok ? 'var(--verde)' : 'var(--verm)') + '">(' + CURTO[d.teste.atr] + ' ' + d.teste.total + '/' + d.teste.cd + ')</span>' : '') + (d.nota ? '<br><span style="color:var(--cinza)">' + esc(d.nota) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
    return h;
  }
  function escolher(i) {
    var o = R.ficha.cena.opcoes[i], tal = document.getElementById('rTal'), usar = !!(tal && tal.checked);
    if (o.teste) modal('<div class="mono" style="text-align:center">Teste de ' + NOMES[o.teste.atr] + ' · CD ' + o.teste.cd + '</div><div class="dado rola" id="rDado">20</div>');
    var gira = o.teste ? setInterval(function () { var d = document.getElementById('rDado'); if (d) d.textContent = 1 + Math.floor(Math.random() * 20); }, 70) : null;
    var t0 = Date.now();
    accao({ accao: 'escolher', opcao: i, talento: usar }).then(function (r) {
      setTimeout(function () {
        clearInterval(gira);
        if (!r.ok) { fechar(); return; }
        var x = r.resultado, t = x.teste;
        var html = t ? '<div class="res"><div class="mono">Teste de ' + NOMES[t.atr] + '</div><div class="dado">' + t.d20 + '</div>' +
          (t.repetiu ? '<div class="conta">Talento: repetiste o ' + t.repetiu + '</div>' : '') +
          '<div class="conta">' + t.d20 + ' ' + sinal(t.mod) + (t.kit ? ' + ' + t.kit + ' kits' : '') + (t.talento ? ' + ' + t.talento + ' talento' : '') + ' = <b>' + t.total + '</b> contra CD ' + t.cd + '</div>' +
          '<div class="' + (t.ok ? 'ok' : 'ko') + '">' + (t.critico ? '20 natural!' : t.falhanco ? 'Falhanço crítico' : t.ok ? 'Sucesso' : 'Falhou') + '</div></div>' : '<div class="mono">A tua escolha</div>';
        html += x.nota ? '<p class="texto-m" style="font-size:16px;text-align:center">' + esc(x.nota) + '</p>' : '';
        if (x.fim) html += '<div class="licao" style="text-align:center">🎖️ Capítulo concluído: ' + esc(x.fim) + '</div>';
        html += (r.ganho && r.ganho.xp ? '<p class="mono" style="text-align:center;color:var(--ouro2)">+' + r.ganho.xp + ' XP</p>' : '') + '<button class="btn" type="button" data-seguir="1">Continuar</button>';
        modal(html, function (b) { if (b.getAttribute('data-seguir')) { fechar(); desenhar(); window.scrollTo(0, 0); } });
        if (t && t.critico || x.fim) M.confete(140);
        M.som(t && !t.ok ? 'plim' : 'militar');
      }, o.teste ? Math.max(0, 900 - (Date.now() - t0)) : 0);
    });
  }

  // ── Escape rooms ────────────────────────────────────────────────────────
  function vEscape() {
    var h = '<p class="texto-m" style="margin-top:0;font-size:14px;color:var(--cinza)">Quatro salas em rotação: todos os meses entra uma nova e sai a mais antiga. Em cada sala lês gráficos, plantas e anúncios, cumpres uma missão de foto no mundo real e abres a última fechadura em realidade aumentada. Quanto menos pistas, mais XP.</p>';
    h += R.salas.map(function (s) {
      var m = s.meu, est = m && m.fim ? '🎖️ Saíste em ' + mmss(m.segundos) + (m.xp ? ' · +' + m.xp + ' XP' : '') : m ? 'Em curso · ' + s.enigmas.filter(function (e) { return e.resolvido; }).length + ' de ' + s.enigmas.length : s.minutos + ' minutos · ' + s.enigmas.length + ' fechaduras';
      return '<div class="placa sala" style="margin-bottom:10px">' + (s.nova ? '<span class="tag2">Nova este mês</span>' : s.sai ? '<span class="tag2 sai">Sai no fim do mês</span>' : '') + '<div class="em">' + s.emoji + '</div><h4>' + esc(s.titulo) + '</h4><div class="mono">' + esc(s.area) + '</div><p class="texto-m" style="font-size:14px">' + esc(s.historia) + '</p><div class="mono" style="margin-bottom:10px;color:var(--ciano)">' + est + '</div>' +
        '<button class="btn' + (m && m.fim ? ' sec' : '') + '" type="button" data-sala="' + s.id + '">' + (m && m.fim ? 'Ver a sala' : m ? 'Continuar' : 'Entrar na sala') + '</button>' +
        (s.ranking.length ? '<div class="sub-tit">Mais rápidos este mês</div><ul class="rank">' + s.ranking.slice(0, 5).map(function (x, i) { return '<li><span>' + (i + 1) + '. ' + esc(x.nome) + (x.classe ? ' ' + classeDe(x.classe).emoji : '') + '</span><span class="mono">' + mmss(x.segundos) + (x.pistas ? ' · ' + x.pistas + ' pistas' : '') + '</span></li>'; }).join('') + '</ul>' : '') + '</div>';
    }).join('');
    h += '<button class="btn sec" type="button" data-r="kitprint">🖨️ Imprimir kit de escape para jogar em grupo</button>';
    return h;
  }
  function entrarSala(id) {
    pedir({ accao: 'escape_entrar', sala: id }).then(function (r) { if (!r.ok) { toast(esc(r.erro)); return; } salaAberta = r.sala; desenhar(); window.scrollTo(0, 0); });
  }
  function desenharSala() {
    var s = salaAberta, m = s.meu || {};
    var h = topo(s.area) + '<div class="placa" style="margin-bottom:10px"><div style="font-size:34px">' + s.emoji + '</div><h4 style="margin:4px 0;font-size:20px">' + esc(s.titulo) + '</h4><p class="texto-m" style="font-size:14px;margin:0">' + esc(s.historia) + '</p></div>';
    var abertas = s.enigmas.filter(function (e) { return e.resolvido; }).length;
    h += '<div class="cadeados" aria-label="' + abertas + ' de ' + s.enigmas.length + ' fechaduras abertas">' + s.enigmas.map(function (e, i) { return '<span class="' + (e.resolvido ? 'ab' : '') + (i === acabouAbrir ? ' agora' : '') + '">' + (e.resolvido ? '🔓' : '🔒') + '</span>'; }).join('') + '</div>';
    h += '<div class="relogio" id="rRel"></div>';
    h += s.enigmas.map(function (e, i) {
      var corpo;
      if (e.resolvido) corpo = '<div class="mono" style="color:var(--verde)">✓ Fechadura aberta</div>';
      else if (m.fim) corpo = '';
      else if (e.tipo === 'foto') corpo = '<label class="btn foto-btn">📸 Tirar ou escolher foto<input type="file" accept="image/*" data-foto="' + i + '" hidden></label><div class="mono" id="rFoto' + i + '" style="margin-top:6px;color:var(--texto-m)"></div>';
      else if (e.tipo === 'escolha' || (e.tipo === 'imagem' && e.opcoes)) corpo = e.opcoes.map(function (o, k) { return '<button type="button" class="op" data-resp="' + i + '" data-v="' + k + '">' + esc(o) + '</button>'; }).join('');
      else if (e.tipo === 'ra') corpo = '<button class="btn" type="button" data-ra="' + i + '">📷 Abrir a câmara (realidade aumentada)</button><div class="linha" style="margin-top:8px"><input id="rIn' + i + '" placeholder="Código" autocomplete="off" autocapitalize="characters"><button class="btn" type="button" data-envia="' + i + '">Abrir</button></div>';
      else corpo = '<div class="linha"><input id="rIn' + i + '" ' + (e.tipo === 'numero' ? 'inputmode="numeric"' : '') + ' placeholder="A tua resposta" autocomplete="off"><button class="btn" type="button" data-envia="' + i + '">Abrir</button></div>';
      var etq = { ra: ' · RA', foto: ' · Foto', imagem: ' · Lê a imagem' }[e.tipo] || '';
      var img = e.imagem ? '<figure class="enig-img"><img src="' + esc(e.imagem) + '" alt="' + esc(e.legenda || 'Imagem do enigma') + '" loading="lazy" data-zoom="' + esc(e.imagem) + '"><figcaption>' + esc(e.legenda || 'Imagem ilustrativa') + ' · toca para ampliar</figcaption></figure>' : '';
      return '<div class="placa enig' + (e.resolvido ? ' feito' : '') + (i === acabouAbrir ? ' abriu' : '') + '" id="rEnig' + i + '"><div class="mono">Fechadura ' + (i + 1) + etq + '</div><div class="p">' + esc(e.pergunta) + '</div>' + img + corpo +
        (e.pista ? '<div class="licao" style="margin:8px 0 0">💡 ' + esc(e.pista) + '</div>' : (!e.resolvido && !m.fim ? '<button type="button" class="btn sec" style="margin-top:8px;min-height:38px;font-size:12px" data-pista="' + i + '">Pedir pista (−10 XP)</button>' : '')) + '</div>';
    }).join('');
    if (m.fim) h += '<div class="placa" style="text-align:center"><div style="font-size:40px">🎖️</div><b>Saíste da sala em ' + mmss(m.segundos) + '</b><p class="texto-m" style="font-size:14px">' + (m.xp ? '+' + m.xp + ' XP. ' : '') + 'Volta no próximo mês: entra uma sala nova.</p></div>';
    raiz.innerHTML = h;
    if (acabouAbrir != null) { var ab = document.getElementById('rEnig' + acabouAbrir); acabouAbrir = null; if (ab && ab.scrollIntoView) ab.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    var rel = document.getElementById('rRel');
    function tic() {
      if (!rel) return;
      if (m.fim) { rel.textContent = mmss(m.segundos); return; }
      var falta = s.minutos * 60 - (Date.now() - Date.parse(m.inicio)) / 1000;
      rel.textContent = falta > 0 ? mmss(falta) : 'Tempo esgotado · ainda podes sair';
      rel.classList.toggle('fim', falta <= 60);
    }
    tic(); relogio = setInterval(tic, 1000);
  }
  var acabouAbrir = null;
  function responder(i, v) {
    pedir({ accao: 'escape_responder', sala: salaAberta.id, i: i, resposta: v }).then(function (r) {
      if (!r.ok) { toast(esc(r.erro)); return; }
      tratarResposta(r);
    });
  }
  function tratarResposta(r) {
    {
      var antes = (salaAberta && salaAberta.enigmas || []).map(function (e) { return e.resolvido; });
      salaAberta = r.sala;
      if (!r.certo) { toast(r.motivo ? esc(r.motivo) : 'Não é isso. Tenta outra vez.'); try { navigator.vibrate && navigator.vibrate([40, 40, 40]); } catch (_) {} return; }
      M.som('plim');
      for (var k = 0; k < r.sala.enigmas.length; k++) if (r.sala.enigmas[k].resolvido && !(antes[k])) acabouAbrir = k;
      try { navigator.vibrate && navigator.vibrate([20, 30, 60]); } catch (_) {}
      if (r.fim) {
        M.confete(220); M.som('militar'); M.recarregar();
        modal('<div style="text-align:center"><div style="font-size:54px">🗝️</div><h2>Saíste!</h2><p class="texto-m" style="font-size:16px">' + mmss(r.tempo.seg) + (r.tempo.noTempo ? ' · dentro do tempo' : ' · fora do tempo') + (r.ganho.xp ? '<br><b style="color:var(--ouro2)">+' + r.ganho.xp + ' XP</b>' : '') + '</p>' +
          (r.ranking && r.ranking.length ? '<ul class="rank">' + r.ranking.slice(0, 5).map(function (x, k) { return '<li><span>' + (k + 1) + '. ' + esc(x.nome) + '</span><span class="mono">' + mmss(x.segundos) + '</span></li>'; }).join('') + '</ul>' : '') + '</div>');
        pedir().then(function (x) { if (x.ok) R = x; });
      } else toast('<b>Fechadura aberta.</b>');
      desenharSala();
    }
  }

  // ── Fechadura de foto: reduz no telemóvel (máx. 1024 px, JPEG) e o guardião (IA) confirma ──
  function reduzirFoto(file) {
    return new Promise(function (ok, ko) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.8));
      };
      im.onerror = function () { URL.revokeObjectURL(url); ko(new Error('foto')); };
      im.src = url;
    });
  }
  function enviarFoto(i, file) {
    var st = document.getElementById('rFoto' + i);
    if (!file) return;
    if (st) st.textContent = 'A preparar a foto…';
    reduzirFoto(file).then(function (dataUrl) {
      if (st) st.innerHTML = '<img src="' + dataUrl + '" alt="" style="max-height:90px;border-radius:8px;vertical-align:middle;margin-right:8px">O guardião está a ver a foto…';
      return pedir({ accao: 'escape_responder', sala: salaAberta.id, i: i, foto: dataUrl });
    }).then(function (r) {
      if (!r) return;
      if (!r.ok) { if (st) st.textContent = ''; toast(esc(r.erro)); return; }
      if (!r.certo && st) st.textContent = '✗ ' + (r.motivo || 'Esta foto não serve. Tenta outra.');
      tratarResposta(r);
    }).catch(function () { if (st) st.textContent = ''; toast('Não consegui ler essa foto. Tenta outra.'); });
  }
  function zoomImagem(src) { modal('<img src="' + esc(src) + '" alt="" style="width:100%;border-radius:12px;background:#0a0d13">'); }

  // ── Realidade aumentada: encontra o objeto dourado à tua volta ─────────
  var RA = null;
  function abrirRA(i) {
    var e = salaAberta.enigmas[i];
    var el = document.getElementById('ra');
    if (!el) { el = document.createElement('div'); el.id = 'ra'; document.body.appendChild(el); }
    el.innerHTML = '<video playsinline muted autoplay></video><canvas></canvas><button class="x" type="button" aria-label="Fechar">×</button><div class="hud"><div id="raMsg">Roda devagar à tua volta com o telemóvel na vertical.</div></div>';
    el.classList.add('on');
    var video = el.querySelector('video'), cv = el.querySelector('canvas'), ctx = cv.getContext('2d');
    RA = { alvo: e.alvo, rumo: null, arrasto: null, achado: false, perto: 0, stream: null, loop: 0, i: i, codigo: e.codigo, virtual: 0 };
    function fecharRA() { cancelAnimationFrame(RA.loop); window.removeEventListener('deviceorientation', ori, true); window.removeEventListener('deviceorientationabsolute', ori, true); if (RA.stream) RA.stream.getTracks().forEach(function (t) { t.stop(); }); el.classList.remove('on'); el.innerHTML = ''; }
    el.querySelector('.x').onclick = fecharRA;
    function ori(ev) { var h = ev.webkitCompassHeading != null ? ev.webkitCompassHeading : (ev.alpha != null ? 360 - ev.alpha : null); if (h != null) RA.rumo = h; }
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') window.addEventListener('deviceorientation', ori, true); }).catch(function () {});
      else { window.addEventListener('deviceorientationabsolute', ori, true); window.addEventListener('deviceorientation', ori, true); }
    } catch (_) {}
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) { RA.stream = s; video.srcObject = s; }).catch(function () { el.style.background = 'radial-gradient(circle at 50% 40%,#1a2233,#05070b)'; });
    // Sem bússola (computador ou permissão recusada): arrasta o dedo para rodar a vista.
    cv.addEventListener('pointerdown', function (ev) { RA.arrasto = ev.clientX; });
    cv.addEventListener('pointermove', function (ev) { if (RA.arrasto == null) return; RA.virtual = (RA.virtual - (ev.clientX - RA.arrasto) * 0.25 + 360) % 360; RA.arrasto = ev.clientX; });
    window.addEventListener('pointerup', function () { if (RA) RA.arrasto = null; });
    var t0 = performance.now();
    function frame(t) {
      var w = cv.width = cv.clientWidth * devicePixelRatio, hgt = cv.height = cv.clientHeight * devicePixelRatio;
      ctx.clearRect(0, 0, w, hgt);
      var rumo = RA.rumo != null && RA.arrasto == null && t - t0 > 300 ? RA.rumo : RA.virtual;
      if (RA.rumo == null) RA.rumoTxt = 'arrasta para rodar';
      var delta = ((RA.alvo - rumo + 540) % 360) - 180, fov = 60;
      var x = w / 2 + (delta / (fov / 2)) * (w / 2), y = hgt * 0.42 + Math.sin(t / 500) * 10 * devicePixelRatio, r = Math.min(w, hgt) * 0.09;
      // seta-guia
      ctx.fillStyle = 'rgba(233,196,106,.9)'; ctx.font = (18 * devicePixelRatio) + 'px Oswald'; ctx.textAlign = 'center';
      if (Math.abs(delta) > fov / 2) { var dir = delta > 0 ? 1 : -1; ctx.beginPath(); var ax = dir > 0 ? w - 30 * devicePixelRatio : 30 * devicePixelRatio, ay = hgt / 2; ctx.moveTo(ax, ay); ctx.lineTo(ax - dir * 22 * devicePixelRatio, ay - 16 * devicePixelRatio); ctx.lineTo(ax - dir * 22 * devicePixelRatio, ay + 16 * devicePixelRatio); ctx.fill(); }
      else {
        var g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r);
        g.addColorStop(0, '#fff3c4'); g.addColorStop(.5, '#E9C46A'); g.addColorStop(1, '#8a6418');
        ctx.shadowColor = '#E9C46A'; ctx.shadowBlur = 30 * devicePixelRatio; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#3a2a06'; ctx.font = 'bold ' + Math.round(r * .8) + 'px Anton'; ctx.fillText('M', x, y + r * .28);
      }
      // mira
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2 * devicePixelRatio; ctx.beginPath(); ctx.arc(w / 2, hgt * 0.42, r * 1.3, 0, Math.PI * 2); ctx.stroke();
      if (!RA.achado) {
        if (Math.abs(delta) < 9) RA.perto += 16; else RA.perto = Math.max(0, RA.perto - 32);
        var msg = document.getElementById('raMsg');
        if (msg) msg.textContent = Math.abs(delta) < 9 ? 'Segura… ' + Math.min(100, Math.round(RA.perto / 12)) + '%' : Math.abs(delta) < fov / 2 ? 'Está aí! Centra-o na mira.' : (RA.rumo == null ? 'Arrasta o dedo para rodar a vista. ' : 'Roda devagar à tua volta. ') + 'Segue a seta.';
        if (RA.perto >= 1200) {
          RA.achado = true; M.som('plim'); try { navigator.vibrate && navigator.vibrate(80); } catch (_) {}
          var hud = el.querySelector('.hud');
          hud.innerHTML = '<div class="mono" style="color:#fff">Encontraste-o. O código é</div><div class="cod">' + esc(RA.codigo) + '</div><button class="btn" type="button" id="raUsar">Usar o código</button>';
          hud.querySelector('#raUsar').onclick = function () { var c = RA.codigo, k = RA.i; fecharRA(); responder(k, c); };
        }
      }
      RA.loop = requestAnimationFrame(frame);
    }
    RA.loop = requestAnimationFrame(frame);
  }

  // ── Confrontos: combate por turnos contra os inimigos interiores ─────────
  // O inimigo mostra o que vai fazer a seguir; tu escolhes a resposta. Os dados lançam-se no servidor
  // e o ecrã só encena as linhas que voltam, por ordem (números a flutuar, tremor, mudança de fase).
  var confAberto = null, confOcupado = false;
  var INT = { ataque: ['⚔️', 'Vai atacar'], forte: ['💥', 'Golpe forte'], escudo: ['🛡️', 'Vai defender-se'], cura: ['💚', 'Vai recuperar'] };
  function vConfronto() {
    var C = R.confrontos || { lista: [] };
    var sem = C.lista.filter(function (b) { return b.da_semana; })[0];
    var h = '<div class="placa conf-intro"><div class="mono">Confrontos · semana ' + esc((C.semana || '').split('-W')[1] || '') + '</div><p class="texto-m" style="font-size:15px;margin:6px 0 0">Os inimigos não estão lá fora: são o adiamento, o medo, a pressa. Cada semana aparece um. Ele mostra-te sempre o próximo golpe; tu escolhes a resposta com os atributos da tua ficha.</p></div>';
    if (sem) h += cartaoBoss(sem, true);
    h += '<div class="sub-tit">Galeria</div><div class="conf-grelha">' + C.lista.filter(function (b) { return !b.da_semana; }).map(function (b) { return cartaoBoss(b, false); }).join('') + '</div>';
    h += '<p class="texto-m" style="font-size:12px;color:var(--cinza)">A primeira vitória contra o inimigo da semana dá 60 XP. A Rotina dá 120 e só aparece depois do capítulo 6. Os já vencidos podem ser repetidos sem XP.</p>';
    return h;
  }
  function cartaoBoss(b, grande) {
    var estado = b.vencido ? '<span class="conf-tag ok">Vencido</span>' : b.da_semana ? '<span class="conf-tag sem">Da semana</span>' : b.final ? '<span class="conf-tag fin">Final</span>' : '';
    return '<button type="button" class="conf-card' + (grande ? ' grande' : '') + (b.aberto ? '' : ' fechado') + '" style="--c:' + esc(b.cor) + '" data-boss="' + esc(b.id) + '">' +
      '<span class="conf-ret"><img src="' + esc(b.retrato) + '" alt="" loading="lazy"></span><span class="conf-info"><b>' + esc(b.nome) + '</b><small>' + esc(b.titulo) + '</small>' + estado +
      (b.aberto ? '' : '<small class="conf-lock">🔒 ' + (b.final ? 'Depois do capítulo 6' : 'Ainda por aparecer') + '</small>') + '</span></button>';
  }
  function abrirConfronto(id) {
    var b = (R.confrontos.lista || []).filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    if (!b.aberto) { toast('🔒 ' + (b.final ? 'A Rotina só aparece depois do capítulo 6.' : 'Este inimigo ainda não apareceu. Vence o da semana.')); return; }
    pedir({ accao: 'confronto_abrir', boss: id }).then(function (r) { if (!r.ok) { toast(esc(r.erro)); return; } confAberto = r.confronto; desenhar(); window.scrollTo(0, 0); });
  }
  function barra(cls, v, max, rot) {
    return '<div class="conf-barra ' + cls + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)) + '%"></i><span>' + rot + ' <b>' + v + '</b>/' + max + '</span></div>';
  }
  function desenharConfronto() {
    var c = confAberto, b = c.inimigo, e = c.estado;
    var h = topo(b.titulo);
    h += '<div class="conf-palco' + (e && e.fase === 2 ? ' f2' : '') + '" id="cPalco" style="--c:' + esc(b.cor) + '">';
    h += '<div class="conf-boss" id="cBoss"><img src="' + esc(b.retrato) + '" alt="' + esc(b.nome) + '"></div><div class="conf-nome">' + esc(b.nome) + (e && e.fase === 2 ? ' <span class="conf-tag fin">Fase 2</span>' : '') + '</div>';
    if (e) h += barra('boss', e.bossVida, e.bossMax, b.emoji);
    if (c.intencao) { var it = INT[c.intencao.tipo] || ['❔', '']; h += '<div class="conf-int ' + c.intencao.tipo + '"><span>' + it[0] + '</span><div><small>Próximo golpe · ' + it[1] + (c.intencao.tipo === 'ataque' || c.intencao.tipo === 'forte' ? ' ' + (c.intencao.valor + (e.fase === 2 ? 1 : 0)) : '') + '</small>' + esc(c.intencao.texto) + '</div></div>'; }
    if (e && !e.fim) h += '<div class="conf-ult" id="cUlt">' + e.log.slice(-2).map(linhaLog).join('') + '</div>';
    h += '</div>';
    if (!e || e.fim) {
      h += '<div class="placa"><p class="conf-fala">«' + esc(b.entrada) + '»</p>';
      if (e && e.fim) h += '<p class="texto-m" style="font-size:14px;margin:8px 0 0;color:' + (e.fim === 'vitoria' ? 'var(--verde)' : 'var(--cinza)') + '">' + (e.fim === 'vitoria' ? 'Venceste este confronto.' : 'Perdeste este confronto. Recupera e volta com outro plano.') + '</p>';
      h += '<p class="texto-m" style="font-size:13px;color:var(--cinza);margin:10px 0 12px">Ponto fraco: ' + (b.fraqueza ? '<b style="color:var(--ouro2)">' + NOMES[b.fraqueza] + '</b> (acções desse atributo tiram +3)' : 'nenhum. Precisas de tudo o que aprendeste.') + ' · Vitórias: ' + c.vitorias + ' · Tentativas esta semana: ' + c.tentativas + '/15</p>';
      h += '<button class="btn" type="button" data-r="conf-comecar">' + (e ? 'Novo confronto' : 'Enfrentar') + '</button></div>';
      raiz.innerHTML = h; return;
    }
    h += '<div class="conf-eu">' + barra('eu', e.vida, e.vidaMax, '💛 ' + esc(R.ficha.nome || 'Tu')) +
      '<div class="conf-foco" aria-label="Foco ' + e.foco + ' de 5"><small>Foco</small>' + [0, 1, 2, 3, 4].map(function (i) { return '<i class="' + (i < e.foco ? 'on' : '') + '"></i>'; }).join('') +
      (e.guarda ? '<span class="conf-tag">🛡️ Guarda ' + e.guarda + '</span>' : '') + '<span class="conf-turno">Turno ' + (e.turno + 1) + '/20</span></div></div>';
    h += '<div class="conf-acc">' + c.accoes.map(function (a) {
      var fraco = b.fraqueza && a.atr === b.fraqueza;
      return '<button type="button" class="' + (a.id === 'tecnica' ? 'tec ' : '') + (fraco ? 'fraco' : '') + '" data-cacc="' + esc(a.id) + '"' + (a.pode && !confOcupado ? '' : ' disabled') + ' title="' + esc(a.texto) + '">' +
        '<span class="e">' + a.emoji + '</span><b>' + esc(a.nome) + '</b><small>' + CURTO[a.atr] + (a.custo ? ' · ' + new Array(a.custo + 1).join('◆') : ' · grátis') + (fraco ? ' · fraco!' : '') + '</small></button>';
    }).join('') + '</div>';
    h += '<div class="conf-log" id="cLog">' + e.log.slice().reverse().map(linhaLog).join('') + '</div>';
    raiz.innerHTML = h;
  }
  function linhaLog(l) {
    var dado = l.d20 != null ? '<em>🎲 ' + l.d20 + (l.total !== l.d20 ? ' → ' + l.total : '') + ' vs ' + l.cd + '</em>' : '';
    return '<p class="' + l.quem + (l.critico ? ' crit' : '') + '">' + esc(l.texto) + dado + '</p>';
  }
  function flutua(alvo, txt, cls) {
    var el = document.getElementById(alvo); if (!el) return;
    var n = document.createElement('span'); n.className = 'conf-num ' + (cls || ''); n.textContent = txt;
    n.style.left = (35 + Math.random() * 30) + '%';
    el.appendChild(n); setTimeout(function () { n.remove(); }, 1200);
  }
  function treme(id, forte) {
    var el = document.getElementById(id); if (!el) return;
    el.classList.remove('treme', 'treme2'); void el.offsetWidth; el.classList.add(forte ? 'treme2' : 'treme');
  }
  function acertaBarra(sel, v, max) {
    var b = raiz.querySelector('.conf-barra.' + sel); if (!b) return;
    b.querySelector('i').style.width = Math.max(0, Math.min(100, v / max * 100)) + '%'; b.querySelector('b').textContent = v;
  }
  function jogar(id) {
    if (confOcupado || !confAberto) return;
    confOcupado = true; raiz.querySelectorAll('[data-cacc]').forEach(function (x) { x.disabled = true; });
    var b0 = confAberto.estado.bossVida, v0 = confAberto.estado.vida, bm = confAberto.estado.bossMax, vm = confAberto.estado.vidaMax;
    pedir({ accao: 'confronto_turno', boss: confAberto.inimigo.id, accao_id: id }).then(function (r) {
      if (!r.ok) { confOcupado = false; toast(esc(r.erro || 'Não deu.')); desenharConfronto(); return; }
      var log = document.getElementById('cLog'), i = 0;
      (function passo() {
        if (i >= r.linhas.length) {
          setTimeout(function () {
            confOcupado = false; confAberto = r.confronto; if (r.confrontos) R.confrontos = r.confrontos;
            desenharConfronto();
            if (r.confronto.estado.fim) fimConfronto(r);
          }, 380);
          return;
        }
        var l = r.linhas[i++];
        if (log) log.insertAdjacentHTML('afterbegin', linhaLog(l));
        var ult = document.getElementById('cUlt'); if (ult) { ult.insertAdjacentHTML('beforeend', linhaLog(l)); while (ult.children.length > 2) ult.removeChild(ult.firstChild); }
        if (l.quem === 'eu' && l.dano) { b0 = Math.max(0, b0 - l.dano); acertaBarra('boss', b0, bm); flutua('cBoss', '−' + l.dano, (l.critico ? 'crit' : '') + (l.fraco ? ' fraco' : '')); treme('cBoss', l.critico); M.som('plim'); if (window.MissaoFX) MissaoFX.onda(document.getElementById('cBoss'), l.critico ? '#fff3c8' : (l.fraco ? '#E9C46A' : '#ff7a59')); }
        else if (l.quem === 'eu' && l.dano === 0) flutua('cBoss', 'falhou', 'falha');
        if (l.quem === 'eu' && l.cura) { v0 = Math.min(vm, v0 + l.cura); acertaBarra('eu', v0, vm); }
        if (l.quem === 'ele' && l.dano) { v0 = Math.max(0, v0 - l.dano); acertaBarra('eu', v0, vm); treme('cPalco', l.critico); try { navigator.vibrate && navigator.vibrate(l.critico ? [60, 40, 90] : 50); } catch (_) {} }
        if (l.quem === 'ele' && l.cura) { b0 = Math.min(bm, b0 + l.cura); acertaBarra('boss', b0, bm); flutua('cBoss', '+' + l.cura, 'cura'); }
        if (l.quem === 'sistema' && l.texto === 'Fase 2') { var p = document.getElementById('cPalco'); if (p) { p.classList.add('f2', 'flash'); setTimeout(function () { p.classList.remove('flash'); }, 700); } }
        setTimeout(passo, reduz ? 200 : 620);
      })();
    });
  }
  var reduz = false; try { reduz = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  function fimConfronto(r) {
    var b = r.confronto.inimigo, v = r.confronto.estado.fim === 'vitoria', xp = r.ganho && r.ganho.xp;
    if (v) { M.confete(xp ? 240 : 140); M.som('militar'); }
    modal('<div class="mono">' + (v ? 'Vitória' : 'Ainda não') + '</div><h2>' + (v ? esc(b.nome) + ' caiu' : esc(b.nome) + ' ganhou esta') + '</h2>' +
      '<p class="conf-fala" style="margin:8px 0 12px">«' + esc(v ? r.linhas.filter(function (l) { return l.quem === 'ele'; }).slice(-1).map(function (l) { return l.texto; })[0] || '' : r.linhas.slice(-1)[0].texto) + '»</p>' +
      '<div class="placa" style="margin-bottom:12px"><div class="mono">A lição</div><p class="texto-m" style="font-size:15px;margin:6px 0 0">' + esc(b.licao) + '</p>' + (b.nota ? '<p class="texto-m" style="font-size:12px;color:var(--cinza);margin:8px 0 0">' + esc(b.nota) + '</p>' : '') + '</div>' +
      (xp ? '<p class="texto-m" style="font-size:16px;color:var(--ouro2);margin:0 0 12px"><b>+' + xp + ' XP</b></p>' : '') +
      '<button class="btn" type="button" data-x="ok">' + (v ? 'Continuar' : 'Recuar e preparar') + '</button>', function (bb) { if (bb.getAttribute('data-x') === 'ok') fechar(); });
  }

  // ── Mesas de jogo ───────────────────────────────────────────────────────
  function vMesas() {
    var L = R.mesas || [], minhas = L.filter(function (m) { return m.dentro; }), outras = L.filter(function (m) { return !m.dentro; });
    var h = '<p class="texto-m" style="margin-top:0;font-size:14px;color:var(--cinza)">Joga com outras pessoas: um mestre conta a história, os jogadores decidem e lançam os dados. Os dados são lançados no servidor, à vista de todos.</p>';
    h += '<div class="dacoes"><button class="btn" type="button" data-r="mesa-nova">🎲 Criar mesa</button></div>';
    h += '<div class="placa" style="margin-bottom:12px"><label for="rCod" style="margin-top:0">Tens um código?</label><div class="linha" style="display:flex;gap:8px"><input id="rCod" maxlength="8" placeholder="Ex.: K7Q2MX" autocapitalize="characters" style="text-transform:uppercase"><button class="btn" style="width:auto" type="button" data-r="mesa-codigo">Entrar</button></div></div>';
    function cartao(m) {
      return '<div class="placa" style="margin-bottom:8px"><div class="mono">' + (m.publica ? 'Pública' : 'Privada') + ' · mestre ' + esc(m.mestre) + (m.sou_mestre ? ' (tu)' : '') + '</div><h4 style="margin:4px 0;font-size:18px">' + esc(m.nome) + '</h4>' + (m.descricao ? '<p class="texto-m" style="font-size:14px;margin:0 0 6px">' + esc(m.descricao) + '</p>' : '') +
        '<div class="mono" style="margin-bottom:8px">' + m.jogadores + ' de ' + m.maximo + ' lugares' + (m.codigo ? ' · código ' + esc(m.codigo) : '') + '</div><button class="btn' + (m.dentro ? '' : ' sec') + '" type="button" data-mesa="' + m.id + '" data-dentro="' + (m.dentro ? 1 : 0) + '">' + (m.dentro ? 'Abrir a mesa' : m.jogadores >= m.maximo ? 'Cheia' : 'Sentar-me') + '</button></div>';
    }
    h += (minhas.length ? '<div class="sub-tit">As tuas mesas</div>' + minhas.map(cartao).join('') : '') + (outras.length ? '<div class="sub-tit">Mesas abertas</div>' + outras.map(cartao).join('') : '') +
      (L.length ? '' : '<div class="placa vazio">Ainda não há mesas abertas. Cria a primeira e convida quem quiseres com o código.</div>');
    return h;
  }
  function abrirMesa(id) { mesaAberta = { id: id, dados: null, log: [] }; ultimoLog = 0; desenhar(); window.scrollTo(0, 0); puxarMesa(true); }
  function pararMesa() { clearInterval(poll); poll = null; }
  function puxarMesa(completo) {
    if (!mesaAberta) return;
    var id = mesaAberta.id;
    pedir(null, '?mesa=' + encodeURIComponent(id) + '&desde=' + (completo ? 0 : ultimoLog) + (completo ? '' : (Date.now() - (mesaAberta.jogT || 0) > 30000 ? '&jog=1' : ''))).then(function (r) {
      if (!mesaAberta || mesaAberta.id !== id) return;
      if (!r.ok) { toast(esc(r.erro)); mesaAberta = null; pedir().then(function (x) { if (x.ok) { R = x; desenhar(); } }); return; }
      if (completo) mesaAberta.log = [];
      if (r.jogadores) { mesaAberta.jogadores = r.jogadores; mesaAberta.jogT = Date.now(); }
      mesaAberta.dados = r.mesa;
      var novos = r.log.filter(function (l) { return l.id > ultimoLog; });
      if (novos.length) { mesaAberta.log = mesaAberta.log.concat(novos).slice(-150); ultimoLog = novos[novos.length - 1].id; if (!completo && novos.some(function (l) { return !l.eu && l.tipo !== 'sistema'; })) M.som('plim'); }
      if (completo || novos.length || r.jogadores) pintarMesa(completo);
      if (!poll) poll = setInterval(function () { puxarMesa(false); }, 4000);
    });
  }
  function desenharMesa() {
    raiz.innerHTML = topo('Mesa de jogo') + '<div id="rMesa"><div class="placa vazio">A abrir a mesa…</div></div>';
    if (mesaAberta.dados) pintarMesa(true);
    if (!poll && mesaAberta.dados) poll = setInterval(function () { puxarMesa(false); }, 4000);
  }
  function linhaLog(l) {
    var c = 'lg ' + l.tipo + (l.eu ? ' eu' : '') + (l.dados && l.dados.critico ? ' crit' : '') + (l.dados && l.dados.falhanco ? ' falh' : '');
    if (l.tipo === 'sistema' || l.tipo === 'xp') return '<div class="' + c + '">' + esc(l.texto) + '</div>';
    if (l.tipo === 'dado') return '<div class="' + c + '">🎲 <b>' + esc(l.quem) + '</b> · ' + esc(l.texto) + (l.dados && l.dados.critico ? ' · 20 natural!' : l.dados && l.dados.falhanco ? ' · falhanço crítico' : '') + '</div>';
    if (l.tipo === 'cena') return '<div class="' + c + '">📜 ' + esc(l.texto) + '</div>';
    return '<div class="' + c + '"><b>' + esc(l.quem) + '</b> ' + esc(l.texto) + '</div>';
  }
  function pintarMesa(tudo) {
    var box = document.getElementById('rMesa'); if (!box || !mesaAberta || !mesaAberta.dados) return;
    var m = mesaAberta.dados, J = mesaAberta.jogadores || [];
    var logEl = document.getElementById('rLog');
    if (!tudo && logEl) {
      var perto = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 80;
      logEl.innerHTML = mesaAberta.log.map(linhaLog).join('');
      if (perto) logEl.scrollTop = logEl.scrollHeight;
      var jb = document.getElementById('rJogs'); if (jb) jb.innerHTML = jogadoresHtml(J, m);
      var cn = document.getElementById('rCena'); if (cn) cn.innerHTML = cenaHtml(m);
      return;
    }
    var h = '<div class="placa" style="margin-bottom:10px"><div class="mono">' + (m.publica ? 'Mesa pública' : 'Mesa privada') + ' · código <b style="color:var(--ouro2)">' + esc(m.codigo) + '</b></div><h4 style="margin:4px 0;font-size:20px">' + esc(m.nome) + '</h4>' + (m.descricao ? '<p class="texto-m" style="font-size:14px;margin:0 0 6px">' + esc(m.descricao) + '</p>' : '') +
      '<div class="jogs" id="rJogs">' + jogadoresHtml(J, m) + '</div></div>';
    h += '<div id="rCena">' + cenaHtml(m) + '</div>';
    h += '<div class="mesa-log" id="rLog">' + mesaAberta.log.map(linhaLog).join('') + '</div>';
    h += '<div class="dados"><button type="button" data-dado="d20">d20</button><button type="button" data-dado="3d6">3d6</button><button type="button" data-dado="d6">d6</button><select id="rAtr" aria-label="Atributo"><option value="">Sem atributo</option>' + Object.keys(NOMES).map(function (a) { return '<option value="' + a + '">+ ' + NOMES[a] + '</option>'; }).join('') + '</select></div>';
    h += (m.sou_mestre ? '<label class="talsw"><input type="checkbox" id="rNarrar"> Narrar como mestre (aparece como cena)</label>' : '') + '<div class="compor-m"><textarea id="rMsg" rows="1" maxlength="600" placeholder="' + (m.sou_mestre ? 'Conta o que acontece…' : 'O que a tua personagem faz?') + '"></textarea><button class="btn" type="button" data-r="mesa-msg" aria-label="Enviar">➤</button></div>';
    h += '<div style="height:10px"></div><div class="dacoes">' + (m.sou_mestre ? '<button class="btn sec" type="button" data-r="mesa-cena">📜 Cena da campanha</button><button class="btn sec" type="button" data-r="mesa-fechar">Fechar mesa</button>' : '<button class="btn sec" type="button" data-r="mesa-sair">Sair da mesa</button>') + '</div>';
    box.innerHTML = h;
    logEl = document.getElementById('rLog'); if (logEl) logEl.scrollTop = logEl.scrollHeight;
  }
  function jogadoresHtml(J, m) {
    return J.map(function (j) { var c = classeDe(j.classe); return '<button type="button" class="jog" data-jog="' + esc(j.id) + '"><span class="e">' + (j.mestre ? '👑' : c.emoji) + '</span>' + esc(j.nome) + ' <small>nív. ' + j.nivel + '</small></button>'; }).join('');
  }
  function cenaHtml(m) {
    if (!m.cena) return '';
    return '<div class="placa cena" style="margin-bottom:6px"><div class="mono">Cena actual</div><h4 style="font-size:20px">' + esc(m.cena.titulo) + '</h4><p class="txt" style="font-size:15px;margin:0">' + esc(m.cena.texto) + '</p>' +
      (m.cena.opcoes && m.cena.opcoes.length ? '<div style="margin-top:8px">' + m.cena.opcoes.map(function (o) { return '<div class="mono" style="margin:4px 0">› ' + esc(o.t) + (o.teste ? ' · ' + NOMES[o.teste.atr] + ' CD ' + o.teste.cd : '') + '</div>'; }).join('') + '</div>' : '') + '</div>';
  }
  function verJogador(id) {
    var j = (mesaAberta.jogadores || []).filter(function (x) { return x.id === id; })[0]; if (!j) return;
    var c = classeDe(j.classe), m = mesaAberta.dados;
    modal('<div class="heroi" style="--c:' + c.cor + '"><div class="em">' + c.emoji + '</div><div><h4>' + esc(j.nome) + '</h4><div class="sub">' + esc(c.nome || 'Sem personagem') + ' · ' + esc(j.pessoa) + '</div><span class="nv">Nível ' + j.nivel + (j.mestre ? ' · Mestre' : '') + '</span></div></div>' +
      (j.atributos.length ? '<div class="atrs">' + j.atributos.map(function (a) { return '<div class="atr" style="cursor:default"><b>' + a.v + '</b><i>' + sinal(a.mod) + '</i><small>' + CURTO[a.id] + '</small></div>'; }).join('') + '</div>' : '') +
      (m.sou_mestre && !j.eu ? '<button class="btn" type="button" data-x="xp">Dar XP de mesa (+10)</button><div style="height:8px"></div><button class="btn sec" type="button" data-x="exp">Tirar da mesa</button>' : ''),
      function (b) {
        var x = b.getAttribute('data-x'); if (!x) return;
        if (x === 'exp' && !b.getAttribute('data-c')) { b.setAttribute('data-c', '1'); b.textContent = 'Toca outra vez para confirmar'; return; }
        accao({ accao: x === 'xp' ? 'mesa_xp' : 'mesa_expulsar', id: m.id, alvo: j.id }, function () { fechar(); puxarMesa(false); });
      });
  }
  function escolherCena() {
    var caps = R.meta.capitulos;
    modal('<div class="mono">Mestre</div><h2>Cena para a mesa</h2><p class="texto-m" style="font-size:14px">Carrega uma cena da campanha (com testes) ou escreve a tua.</p>' +
      '<label for="rCap">Capítulo</label><select id="rCap" style="width:100%;padding:12px;border-radius:12px;background:#0a0d13;color:var(--texto);border:1px solid var(--linha)">' + caps.map(function (c) { return '<option value="' + c.n + '">' + c.n + '. ' + esc(c.titulo) + '</option>'; }).join('') + '</select>' +
      '<label for="rCn">Cena (código, ex.: c1-2)</label><input id="rCn" placeholder="c1-1">' +
      '<div style="height:10px"></div><button class="btn" type="button" data-x="camp">Carregar da campanha</button>' +
      '<label for="rCt">Ou escreve a tua cena</label><input id="rCt" maxlength="80" placeholder="Título"><div style="height:6px"></div><textarea id="rCx" rows="4" maxlength="1200" placeholder="O que os jogadores vêem e ouvem…"></textarea><div style="height:10px"></div><button class="btn sec" type="button" data-x="livre">Publicar cena</button>',
      function (b) {
        var x = b.getAttribute('data-x'); if (!x) return;
        var body = x === 'camp' ? { accao: 'mesa_cena', id: mesaAberta.id, capitulo: +document.getElementById('rCap').value, cena: (document.getElementById('rCn').value || 'c' + document.getElementById('rCap').value + '-1').trim().toLowerCase() }
          : { accao: 'mesa_cena', id: mesaAberta.id, titulo: document.getElementById('rCt').value, texto: document.getElementById('rCx').value };
        accao(body, function () { fechar(); puxarMesa(false); });
      });
  }

  // ── Imprimir (ficha e kit de escape) por iframe, para funcionar na app instalada ──
  function imprimir(html) {
    var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
    var d = f.contentWindow.document;
    d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"><title>Operação Liberdade</title><style>body{font-family:Georgia,serif;color:#111;margin:24px}h1{font-family:Impact,sans-serif;letter-spacing:1px;margin:0}h2{font-family:Impact,sans-serif;font-weight:normal;margin:18px 0 6px;border-bottom:2px solid #D2A63C}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.c{border:1.5px solid #111;border-radius:10px;padding:8px;text-align:center}.c b{display:block;font-size:26px}.k{border:1px dashed #555;border-radius:10px;padding:10px;margin:8px 0;page-break-inside:avoid}small{color:#555}.carta{border:2px solid #D2A63C;border-radius:14px;padding:14px;margin:10px 0;page-break-inside:avoid}</style></head><body>' + html + '<p><small>MoreThanMoney · app Missão. Ficção educativa, sem aconselhamento financeiro.</small></p></body></html>');
    d.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (_) { toast('Não consegui abrir a impressão neste aparelho.'); } setTimeout(function () { f.remove(); }, 60000); }, 300);
  }
  function imprimirFicha() {
    var f = R.ficha, c = classeDe(f.classe), org = R.meta.origens.filter(function (o) { return o.id === f.origem; })[0] || {};
    imprimir('<h1>' + esc(f.nome) + '</h1><div>' + esc(c.nome) + ' · ' + esc(org.nome || '') + ' · Nível ' + f.nivel + '</div><h2>Atributos</h2><div class="g">' + f.atributos.map(function (a) { return '<div class="c"><b>' + a.v + '</b>' + NOMES[a.id] + ' (' + sinal(a.mod) + ')</div>'; }).join('') + '</div>' +
      '<h2>Talentos</h2>' + f.talentos.map(function (t) { return '<p><b>' + esc(t.nome) + '</b> (nível ' + t.nivel + '): ' + esc(t.texto) + '</p>'; }).join('') +
      '<h2>Kits equipados</h2>' + f.kits.filter(function (k) { return k.equipado; }).map(function (k) { return '<p>' + k.emoji + ' <b>' + esc(k.nome) + '</b>: ' + esc(k.texto) + '</p>'; }).join('') +
      '<h2>Regras rápidas</h2><p>Teste: lança 1d20 + modificador do atributo + kits. Igual ou acima da CD é sucesso. 20 natural é sempre sucesso; 1 natural falha sempre. CD 10 fácil, 12 normal, 15 difícil.</p><p>Notas:</p><div style="height:180px;border:1px solid #999;border-radius:10px"></div>');
  }
  function imprimirKit() {
    imprimir('<h1>Kit de escape · Operação Liberdade</h1><p>Para jogar em grupo, à mesa. Um de vocês é o guardião: tem a app aberta e confirma as respostas. Cortem as cartas e escondam-nas pela sala. Cada carta abre uma fechadura.</p>' +
      R.salas.map(function (s) { return '<h2>' + esc(s.titulo) + ' · ' + esc(s.area) + '</h2><p><i>' + esc(s.historia) + '</i></p>' + s.enigmas.filter(function (e) { return e.tipo !== 'ra'; }).map(function (e, i) { return '<div class="carta"><small>Fechadura ' + (i + 1) + (e.tipo === 'foto' ? ' · missão de foto (o guardião valida na app)' : '') + '</small><p style="font-size:18px">' + esc(e.pergunta) + '</p>' + (e.imagem ? '<img src="' + location.origin + esc(e.imagem) + '" style="width:100%;max-height:260px;object-fit:contain">' : '') + (e.opcoes ? '<ol type="A">' + e.opcoes.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol>' : '') + '<p>Resposta: ____________</p></div>'; }).join('') + '<div class="carta"><small>Fechadura final</small><p>Abram a app no telemóvel e encontrem o objeto dourado com a câmara.</p></div>'; }).join(''));
  }

  // ── Toques ──────────────────────────────────────────────────────────────
  raiz.addEventListener('change', function (ev) {
    var a = ev.target.getAttribute && ev.target.getAttribute('data-foto');
    if (a != null && ev.target.files && ev.target.files[0]) { enviarFoto(+a, ev.target.files[0]); ev.target.value = ''; }
  });
  raiz.addEventListener('click', function (ev) {
    var z = ev.target.closest('[data-zoom]'); if (z && raiz.contains(z)) { zoomImagem(z.getAttribute('data-zoom')); return; }
    var b = ev.target.closest('button, .atr'); if (!b || !raiz.contains(b)) return;
    var a;
    if ((a = b.getAttribute('data-aba'))) { aba = a; desenhar(); return; }
    if ((a = b.getAttribute('data-r'))) {
      if (a === 'voltar') { if (confAberto && !confOcupado) { confAberto = null; desenhar(); } else if (salaAberta) { salaAberta = null; clearInterval(relogio); pedir().then(function (x) { if (x.ok) R = x; desenhar(); }); } else if (mesaAberta) { mesaAberta = null; pararMesa(); pedir().then(function (x) { if (x.ok) R = x; desenhar(); }); } else if (raiz.__editar) { raiz.__editar = false; desenhar(); } else { pararMesa(); M.voltar(); } return; }
      if (a === 'criar') {
        novo.nome = document.getElementById('rNome').value;
        if (!novo.classe || !novo.origem) { toast('Escolhe a classe e a origem.'); return; }
        b.disabled = true; var ed = raiz.__editar;
        accao({ accao: R.ficha ? 'ficha_editar' : 'ficha_criar', nome: novo.nome, classe: novo.classe, origem: novo.origem }, function () { raiz.__editar = false; aba = ed ? 'ficha' : 'campanha'; desenhar(); if (!ed) { toast('<b>Personagem criada.</b><br>Começa o capítulo 1.'); M.som('militar'); } }).then(function () { b.disabled = false; });
        return;
      }
      if (a === 'conf-comecar') { b.disabled = true; M.som('intro'); pedir({ accao: 'confronto_comecar', boss: confAberto.inimigo.id }).then(function (r) { if (!r.ok) { toast(esc(r.erro)); b.disabled = false; return; } confAberto = r.confronto; desenharConfronto(); }); return; }
      if (a === 'editar') { criar(true); return; }
      if (a === 'imprimir') { imprimirFicha(); return; }
      if (a === 'kitprint') { imprimirKit(); return; }
      if (a === 'mesa-nova') {
        var pub = true;
        modal('<div class="mono">Mesa de jogo</div><h2>Abre uma mesa</h2><label for="rMn">Nome</label><input id="rMn" maxlength="60" placeholder="Ex.: Quinta à noite · capítulo 1"><label for="rMd">Descrição (opcional)</label><textarea id="rMd" rows="2" maxlength="300" placeholder="Ritmo, horário, o que vão jogar"></textarea>' +
          '<label>Quem pode entrar</label><div class="chips"><button type="button" data-p="1" class="on">Qualquer pessoa</button><button type="button" data-p="0">Só com código</button></div><label for="rMx">Lugares</label><input id="rMx" type="number" min="2" max="8" value="5"><div style="height:14px"></div><button class="btn" type="button" data-x="ok">Abrir mesa · és o mestre</button>',
          function (bb) {
            if (bb.getAttribute('data-p')) { pub = bb.getAttribute('data-p') === '1'; document.querySelectorAll('#folhaC [data-p]').forEach(function (x) { x.classList.toggle('on', x === bb); }); return; }
            if (bb.getAttribute('data-x') === 'ok') { bb.disabled = true; accao({ accao: 'mesa_criar', nome: document.getElementById('rMn').value, descricao: document.getElementById('rMd').value, publica: pub, maximo: +document.getElementById('rMx').value }, function (r) { fechar(); abrirMesa(r.mesa); }).then(function () { bb.disabled = false; }); }
          });
        return;
      }
      if (a === 'mesa-codigo') { var cod = (document.getElementById('rCod').value || '').trim(); if (!cod) return; accao({ accao: 'mesa_entrar', codigo: cod }, function (r) { abrirMesa(r.mesa); }); return; }
      if (a === 'mesa-msg') { var t = document.getElementById('rMsg'), n = document.getElementById('rNarrar'); if (!t.value.trim()) return; var txt = t.value; t.value = ''; accao({ accao: 'mesa_msg', id: mesaAberta.id, texto: txt, narrar: !!(n && n.checked) }, function () { puxarMesa(false); }); return; }
      if (a === 'mesa-cena') { escolherCena(); return; }
      if (a === 'mesa-sair' || a === 'mesa-fechar') {
        if (!b.getAttribute('data-c')) { b.setAttribute('data-c', '1'); b.textContent = 'Toca outra vez para confirmar'; return; }
        accao({ accao: a === 'mesa-sair' ? 'mesa_sair' : 'mesa_fechar', id: mesaAberta.id }, function () { mesaAberta = null; pararMesa(); desenhar(); });
        return;
      }
    }
    if ((a = b.getAttribute('data-cls'))) { novo.nome = document.getElementById('rNome').value; novo.classe = a; criar(raiz.__editar); return; }
    if ((a = b.getAttribute('data-org'))) { novo.nome = document.getElementById('rNome').value; novo.origem = a; criar(raiz.__editar); return; }
    if ((a = b.getAttribute('data-atr'))) {
      var at = R.ficha.atributos.filter(function (x) { return x.id === a; })[0], meta = R.meta.atributos.filter(function (x) { return x.id === a; })[0];
      modal('<div class="mono">Atributo</div><h2>' + NOMES[a] + ' · ' + at.v + '</h2><p class="texto-m" style="font-size:15px">' + esc(meta.texto) + '</p><ul class="det-lista"><li><span>Base (classe e origem)</span><span>' + (at.v - at.cresceu) + '</span></li><li class="on"><span>Cresceu com a app</span><span>+' + at.cresceu + ' (máx. +8)</span></li><li><span>Modificador nos testes</span><span>' + sinal(at.mod) + '</span></li><li><span>Kits equipados</span><span>+' + at.kit + '</span></li>' + (at.talento ? '<li><span>Talento</span><span>+' + at.talento + '</span></li>' : '') + '</ul><p class="texto-m" style="font-size:13px;color:var(--cinza)">Sobe 1 ponto a cada 5 missões do tipo certo.</p>');
      return;
    }
    if ((a = b.getAttribute('data-kit'))) {
      var k = R.ficha.kits.filter(function (x) { return x.id === a; })[0]; if (!k) return;
      if (!k.disponivel) { toast('🔒 ' + esc(k.requisito)); return; }
      var eq = R.ficha.kits.filter(function (x) { return x.equipado; }).map(function (x) { return x.id; });
      if (k.equipado) eq = eq.filter(function (x) { return x !== a; }); else { if (eq.length >= 3) { toast('Só podes levar 3 kits. Tira um primeiro.'); return; } eq.push(a); }
      accao({ accao: 'equipar', kits: eq }, function () { desenhar(); });
      return;
    }
    if ((a = b.getAttribute('data-cap'))) { accao({ accao: 'capitulo', n: +a }, function () { aba = 'campanha'; desenhar(); window.scrollTo(0, 0); }); return; }
    if ((a = b.getAttribute('data-rop')) != null) { escolher(+a); return; }
    if ((a = b.getAttribute('data-sala'))) { entrarSala(a); return; }
    if ((a = b.getAttribute('data-envia')) != null) { var inp = document.getElementById('rIn' + a); if (inp && inp.value.trim()) responder(+a, inp.value); return; }
    if ((a = b.getAttribute('data-resp')) != null) { responder(+a, b.getAttribute('data-v')); return; }
    if ((a = b.getAttribute('data-pista')) != null) { pedir({ accao: 'escape_pista', sala: salaAberta.id, i: +a }).then(function (r) { if (r.ok) { salaAberta = r.sala; desenharSala(); } else toast(esc(r.erro)); }); return; }
    if ((a = b.getAttribute('data-ra')) != null) { abrirRA(+a); return; }
    if ((a = b.getAttribute('data-mesa'))) { if (b.getAttribute('data-dentro') === '1') abrirMesa(a); else accao({ accao: 'mesa_entrar', id: a }, function (r) { abrirMesa(r.mesa); }); return; }
    if ((a = b.getAttribute('data-dado'))) { var s = document.getElementById('rAtr'); accao({ accao: 'mesa_dado', id: mesaAberta.id, dado: a, atr: s ? s.value : '' }, function () { puxarMesa(false); }); return; }
    if ((a = b.getAttribute('data-jog'))) { verJogador(a); return; }
    if ((a = b.getAttribute('data-boss'))) { abrirConfronto(a); return; }
    if ((a = b.getAttribute('data-cacc'))) { jogar(a); return; }
  });
  raiz.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || ev.shiftKey) return;
    var t = ev.target;
    if (t.id === 'rMsg') { ev.preventDefault(); var b = raiz.querySelector('[data-r="mesa-msg"]'); if (b) b.click(); }
    else if (/^rIn\d+$/.test(t.id)) { ev.preventDefault(); var e = raiz.querySelector('[data-envia="' + t.id.slice(3) + '"]'); if (e) e.click(); }
    else if (t.id === 'rCod') { ev.preventDefault(); var c = raiz.querySelector('[data-r="mesa-codigo"]'); if (c) c.click(); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pararMesa(); else if (mesaAberta && document.getElementById('vRpg').classList.contains('on')) puxarMesa(false); });

  window.MissaoRPG = { abrir: function () { salaAberta = null; mesaAberta = null; abrir(); }, parar: function () { pararMesa(); clearInterval(relogio); } };
  if (document.getElementById('vRpg').classList.contains('on')) abrir();
})();
