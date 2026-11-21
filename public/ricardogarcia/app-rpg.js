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
    '.rpg-abas{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px}.rpg-abas button{min-height:44px;border-radius:12px;border:1px solid var(--linha);background:var(--placa2);color:var(--cinza);font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:4px}',
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
    '.enig{margin-bottom:10px}.enig.feito{border-color:rgba(60,207,142,.5)}.enig .p{font-size:15px;line-height:1.45;margin:6px 0 10px}.enig .linha{display:flex;gap:8px}.enig .linha input{flex:1}.enig .linha .btn{width:auto;min-height:46px}.enig .op{display:block;width:100%;text-align:left;margin-bottom:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--linha);background:#0a0d13;color:var(--texto);font:inherit;font-size:14px}',
    '.relogio{font-family:Anton;font-size:30px;color:var(--ouro2);text-align:center;margin:4px 0 10px}.relogio.fim{color:var(--verm)}',
    '.rank{list-style:none;padding:0;margin:8px 0 0}.rank li{display:flex;justify-content:space-between;padding:7px 0;border-top:1px solid var(--linha);font-size:14px}',
    '.mesa-log{max-height:46vh;overflow:auto;padding:4px 2px;margin:8px 0;display:flex;flex-direction:column;gap:6px}.lg{font-size:14px;line-height:1.4;padding:8px 10px;border-radius:12px;background:#0a0d13;border:1px solid var(--linha)}.lg b{color:var(--ouro2);font-weight:600}.lg.eu{border-color:rgba(30,170,230,.4)}',
    '.lg.dado{border-color:rgba(210,166,60,.5);background:rgba(210,166,60,.07)}.lg.dado.crit{box-shadow:0 0 0 1px var(--verde) inset}.lg.dado.falh{box-shadow:0 0 0 1px var(--verm) inset}.lg.cena{font-family:Kalam;font-size:17px;border-color:rgba(201,167,255,.5);background:rgba(201,167,255,.07)}.lg.sistema,.lg.xp{background:none;border:0;color:var(--cinza);font-size:12px;text-align:center;padding:2px}',
    '.jogs{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}.jog{flex:0 0 auto;background:#0a0d13;border:1px solid var(--linha);border-radius:12px;padding:6px 10px;font-size:13px;color:var(--texto);font:inherit}.jog .e{margin-right:4px}.jog small{color:var(--cinza)}',
    '.dados{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.dados button{border:1px solid var(--linha);background:var(--placa2);color:var(--texto);border-radius:10px;padding:8px 12px;font-weight:700}.dados select{width:auto;padding:8px;font-size:14px!important;border-radius:10px;background:#0a0d13;color:var(--texto);border:1px solid var(--linha)}',
    '.compor-m{display:flex;gap:8px}.compor-m textarea{min-height:44px;max-height:120px;resize:none;padding:10px 12px}.compor-m .btn{width:auto}',
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
    var A = [['ficha', '🛡️', 'Personagem'], ['campanha', '📜', 'Campanha'], ['escape', '🗝️', 'Escape'], ['mesas', '🎲', 'Mesas']];
    var h = topo('Nível ' + R.nivel + ' · ' + classeDe(R.ficha.classe).nome) + '<div class="rpg-abas">' + A.map(function (a) { return '<button type="button" data-aba="' + a[0] + '" class="' + (aba === a[0] ? 'on' : '') + '"><span>' + a[1] + '</span>' + a[2] + '</button>'; }).join('') + '</div>';
    h += { ficha: vFicha, campanha: vCampanha, escape: vEscape, mesas: vMesas }[aba]();
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
    var h = '<p class="texto-m" style="margin-top:0;font-size:14px;color:var(--cinza)">Três salas em rotação: todos os meses entra uma nova e sai a mais antiga. Quatro fechaduras por sala, a última em realidade aumentada. Quanto menos pistas, mais XP.</p>';
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
    h += '<div class="relogio" id="rRel"></div>';
    h += s.enigmas.map(function (e, i) {
      var corpo;
      if (e.resolvido) corpo = '<div class="mono" style="color:var(--verde)">✓ Fechadura aberta</div>';
      else if (m.fim) corpo = '';
      else if (e.tipo === 'escolha') corpo = e.opcoes.map(function (o, k) { return '<button type="button" class="op" data-resp="' + i + '" data-v="' + k + '">' + esc(o) + '</button>'; }).join('');
      else if (e.tipo === 'ra') corpo = '<button class="btn" type="button" data-ra="' + i + '">📷 Abrir a câmara (realidade aumentada)</button><div class="linha" style="margin-top:8px"><input id="rIn' + i + '" placeholder="Código" autocomplete="off" autocapitalize="characters"><button class="btn" type="button" data-envia="' + i + '">Abrir</button></div>';
      else corpo = '<div class="linha"><input id="rIn' + i + '" ' + (e.tipo === 'numero' ? 'inputmode="numeric"' : '') + ' placeholder="A tua resposta" autocomplete="off"><button class="btn" type="button" data-envia="' + i + '">Abrir</button></div>';
      return '<div class="placa enig' + (e.resolvido ? ' feito' : '') + '"><div class="mono">Fechadura ' + (i + 1) + (e.tipo === 'ra' ? ' · RA' : '') + '</div><div class="p">' + esc(e.pergunta) + '</div>' + corpo +
        (e.pista ? '<div class="licao" style="margin:8px 0 0">💡 ' + esc(e.pista) + '</div>' : (!e.resolvido && !m.fim ? '<button type="button" class="btn sec" style="margin-top:8px;min-height:38px;font-size:12px" data-pista="' + i + '">Pedir pista (−10 XP)</button>' : '')) + '</div>';
    }).join('');
    if (m.fim) h += '<div class="placa" style="text-align:center"><div style="font-size:40px">🎖️</div><b>Saíste da sala em ' + mmss(m.segundos) + '</b><p class="texto-m" style="font-size:14px">' + (m.xp ? '+' + m.xp + ' XP. ' : '') + 'Volta no próximo mês: entra uma sala nova.</p></div>';
    raiz.innerHTML = h;
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
  function responder(i, v) {
    pedir({ accao: 'escape_responder', sala: salaAberta.id, i: i, resposta: v }).then(function (r) {
      if (!r.ok) { toast(esc(r.erro)); return; }
      salaAberta = r.sala;
      if (!r.certo) { toast('Não é isso. Tenta outra vez.'); try { navigator.vibrate && navigator.vibrate([40, 40, 40]); } catch (_) {} return; }
      M.som('plim');
      if (r.fim) {
        M.confete(220); M.som('militar'); M.recarregar();
        modal('<div style="text-align:center"><div style="font-size:54px">🗝️</div><h2>Saíste!</h2><p class="texto-m" style="font-size:16px">' + mmss(r.tempo.seg) + (r.tempo.noTempo ? ' · dentro do tempo' : ' · fora do tempo') + (r.ganho.xp ? '<br><b style="color:var(--ouro2)">+' + r.ganho.xp + ' XP</b>' : '') + '</p>' +
          (r.ranking && r.ranking.length ? '<ul class="rank">' + r.ranking.slice(0, 5).map(function (x, k) { return '<li><span>' + (k + 1) + '. ' + esc(x.nome) + '</span><span class="mono">' + mmss(x.segundos) + '</span></li>'; }).join('') + '</ul>' : '') + '</div>');
        pedir().then(function (x) { if (x.ok) R = x; });
      } else toast('<b>Fechadura aberta.</b>');
      desenharSala();
    });
  }

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
      R.salas.map(function (s) { return '<h2>' + esc(s.titulo) + ' · ' + esc(s.area) + '</h2><p><i>' + esc(s.historia) + '</i></p>' + s.enigmas.filter(function (e) { return e.tipo !== 'ra'; }).map(function (e, i) { return '<div class="carta"><small>Fechadura ' + (i + 1) + '</small><p style="font-size:18px">' + esc(e.pergunta) + '</p>' + (e.opcoes ? '<ol type="A">' + e.opcoes.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol>' : '') + '<p>Resposta: ____________</p></div>'; }).join('') + '<div class="carta"><small>Fechadura final</small><p>Abram a app no telemóvel e encontrem o objeto dourado com a câmara.</p></div>'; }).join(''));
  }

  // ── Toques ──────────────────────────────────────────────────────────────
  raiz.addEventListener('click', function (ev) {
    var b = ev.target.closest('button, .atr'); if (!b || !raiz.contains(b)) return;
    var a;
    if ((a = b.getAttribute('data-aba'))) { aba = a; desenhar(); return; }
    if ((a = b.getAttribute('data-r'))) {
      if (a === 'voltar') { if (salaAberta) { salaAberta = null; clearInterval(relogio); pedir().then(function (x) { if (x.ok) R = x; desenhar(); }); } else if (mesaAberta) { mesaAberta = null; pararMesa(); pedir().then(function (x) { if (x.ok) R = x; desenhar(); }); } else if (raiz.__editar) { raiz.__editar = false; desenhar(); } else { pararMesa(); M.voltar(); } return; }
      if (a === 'criar') {
        novo.nome = document.getElementById('rNome').value;
        if (!novo.classe || !novo.origem) { toast('Escolhe a classe e a origem.'); return; }
        b.disabled = true; var ed = raiz.__editar;
        accao({ accao: R.ficha ? 'ficha_editar' : 'ficha_criar', nome: novo.nome, classe: novo.classe, origem: novo.origem }, function () { raiz.__editar = false; aba = ed ? 'ficha' : 'campanha'; desenhar(); if (!ed) { toast('<b>Personagem criada.</b><br>Começa o capítulo 1.'); M.som('militar'); } }).then(function () { b.disabled = false; });
        return;
      }
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
