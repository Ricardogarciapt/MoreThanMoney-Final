// Emblema 3D da patente, desenhado em tempo real (Three.js): escudo em ouro polido com bisel,
// esmalte escuro com verniz, filete na cor da patente e galões (ou estrelas) em relevo.
// Luz de estúdio gerada no próprio telemóvel (sem ficheiros), segue o dedo/inclinação e pára fora do ecrã.
// Sem WebGL, com «reduzir movimento» ou com os gráficos 3D desligados nas Definições, fica o SVG de sempre.
(function () {
  'use strict';
  var SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var reduz = false; try { reduz = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  var promessa = null, vivos = [];

  function ligado() { try { return localStorage.getItem('missao3d') !== '0'; } catch (_) { return true; } }
  function webgl() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (_) { return false; } }
  function three() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (promessa) return promessa;
    promessa = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = SRC; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { if (window.THREE) ok(window.THREE); else ko(new Error('sem THREE')); };
      s.onerror = function () { promessa = null; ko(new Error('falhou')); };
      document.head.appendChild(s);
    });
    return promessa;
  }

  var css = document.createElement('style');
  css.textContent = '.e3d{position:relative}.e3d>canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;opacity:0;transition:opacity .6s ease}' +
    '.e3d.e3d-on>canvas{opacity:1}.e3d.e3d-on>svg{opacity:0;transition:opacity .4s}';
  document.head.appendChild(css);

  // Coordenadas do escudo do SVG (84×84) para o mundo 3D.
  function P(x, y, k) { return [(x - 42) / 38 * k, (42 - y) / 38 * k]; }
  function escudo(T, k) {
    var s = new T.Shape(), a = function (x, y) { return P(x, y, k); }, p;
    p = a(42, 4); s.moveTo(p[0], p[1]);
    p = a(76, 18); s.lineTo(p[0], p[1]);
    p = a(76, 44); s.lineTo(p[0], p[1]);
    var b1 = a(76, 62), b2 = a(60, 74), b3 = a(42, 80); s.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], b3[0], b3[1]);
    b1 = a(24, 74); b2 = a(8, 62); b3 = a(8, 44); s.bezierCurveTo(b1[0], b1[1], b2[0], b2[1], b3[0], b3[1]);
    p = a(8, 18); s.lineTo(p[0], p[1]); s.closePath();
    return s;
  }
  function poligono(T, pts, k) { var s = new T.Shape(); pts.forEach(function (q, i) { var p = P(q[0], q[1], k); if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); }); s.closePath(); return s; }
  function galoes(p) { return { n: Math.min(4, (p % 4) + 1), oficial: p >= 6, estrelas: p >= 9 ? p - 8 : 0 }; }

  function criar(T, el, patente) {
    var w = el.clientWidth || 84, h = el.clientHeight || 84, lado = Math.round(Math.max(w, h) * 1.35);
    var r = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setSize(lado, lado);
    r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    var cena = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 0, 6.2);

    // Estúdio para os reflexos, pintado num canvas: céu quente, chão escuro, caixas de luz e um recorte ciano.
    var ec = document.createElement('canvas'); ec.width = 1024; ec.height = 512; var x = ec.getContext('2d');
    var gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#5a4220'); gr.addColorStop(.35, '#1c1610'); gr.addColorStop(.5, '#0b0b0d'); gr.addColorStop(1, '#020203'); x.fillStyle = gr; x.fillRect(0, 0, 1024, 512);
    function caixa(cx, cy, w, h, c0, c1) { var g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) / 1.4); g.addColorStop(0, c0); g.addColorStop(.55, c1); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - w, cy - h, w * 2, h * 2); }
    caixa(512, 150, 210, 90, '#fff6dc', 'rgba(255,205,110,.55)'); caixa(170, 120, 120, 70, '#ffe2a0', 'rgba(210,150,50,.45)'); caixa(840, 200, 90, 120, '#ffffff', 'rgba(240,220,180,.35)');
    caixa(690, 330, 70, 60, '#8fe3ff', 'rgba(30,170,230,.45)'); caixa(300, 360, 160, 40, '#d2a63c', 'rgba(140,90,20,.3)');
    x.fillStyle = 'rgba(255,240,210,.9)'; x.fillRect(0, 238, 1024, 6);
    caixa(768, 236, 150, 70, '#ffe9b8', 'rgba(230,170,70,.5)'); // de frente para o emblema (+z)
    var et = new T.CanvasTexture(ec); et.mapping = T.EquirectangularReflectionMapping; et.encoding = T.sRGBEncoding;
    var pm = new T.PMREMGenerator(r); cena.environment = pm.fromEquirectangular(et).texture; et.dispose(); pm.dispose();
    var dl = new T.DirectionalLight(0xffe7b8, .9); dl.position.set(-2, 3, 4); cena.add(dl);
    var pl = new T.PointLight(0x1eaae6, .6, 12); pl.position.set(3, -1, 3); cena.add(pl);

    var ouro = new T.MeshStandardMaterial({ color: 0xe0ab3c, metalness: 1, roughness: .2 });
    var ouroVivo = new T.MeshStandardMaterial({ color: 0xf5c450, metalness: 1, roughness: .24 });
    var esmalte = new T.MeshStandardMaterial({ color: 0x0a0d14, metalness: .6, roughness: .3, envMapIntensity: .28 });
    var grupo = new T.Group(); cena.add(grupo);
    var bis = function (d, t, s) { return { depth: d, bevelEnabled: true, bevelThickness: t, bevelSize: s, bevelSegments: 5, curveSegments: 32 }; };
    var base = new T.Mesh(new T.ExtrudeGeometry(escudo(T, 1), bis(.16, .06, .05)), ouro); base.position.z = -.22; grupo.add(base);
    var esm = new T.Mesh(new T.ExtrudeGeometry(escudo(T, .84), { depth: .02, bevelEnabled: false, curveSegments: 32 }), esmalte); esm.position.z = 0; grupo.add(esm);
    var fil = escudo(T, .8); fil.holes.push(new T.Path(escudo(T, .765).getPoints(64).reverse()));
    var filMat = new T.MeshStandardMaterial({ color: 0x1eaae6, emissive: 0x0a5f86, emissiveIntensity: .8, metalness: .6, roughness: .3 });
    var filete = new T.Mesh(new T.ExtrudeGeometry(fil, { depth: .015, bevelEnabled: false, curveSegments: 32 }), filMat); filete.position.z = .02; grupo.add(filete);
    var relevo = new T.Group(); relevo.position.z = .02; grupo.add(relevo);

    function insignia(p) {
      while (relevo.children.length) { var c = relevo.children.pop(); c.geometry.dispose(); }
      var g = galoes(p);
      filMat.color.set(g.oficial ? 0xe9c46a : 0x1eaae6); filMat.emissive.set(g.oficial ? 0x7a5812 : 0x0a5f86);
      var k = .64, dy = 0;
      if (g.estrelas) {
        for (var e = 0; e < g.estrelas; e++) {
          var cx = 42 + (e - (g.estrelas - 1) / 2) * 20, sp = [];
          [[0, -10], [3, -3], [10, -3], [4, 2], [6, 9], [0, 5], [-6, 9], [-4, 2], [-10, -3], [-3, -3]].forEach(function (q) { sp.push([cx + q[0] * .9, 40 + q[1] * .9]); });
          relevo.add(new T.Mesh(new T.ExtrudeGeometry(poligono(T, sp, .84), bis(.05, .02, .015)), ouroVivo));
        }
        return;
      }
      dy = (g.n - 1) * 5.5 - 3; // centra o maço de galões no escudo
      for (var i = 0; i < g.n; i++) {
        var o = -i * 11 + dy;
        var v = [[12.7, 49.3 + o], [42, 34.6 + o], [71.3, 49.3 + o], [68.7, 54.7 + o], [42, 41.4 + o], [15.3, 54.7 + o]];
        relevo.add(new T.Mesh(new T.ExtrudeGeometry(poligono(T, v, k), bis(.05, .02, .015)), ouroVivo));
      }
    }
    insignia(patente);

    var cv = r.domElement; cv.style.width = cv.style.height = lado + 'px'; cv.setAttribute('aria-hidden', 'true');
    el.classList.add('e3d'); el.appendChild(cv);
    var alvo = { x: 0, y: 0 }, atual = { x: 0, y: 0 }, visivel = true, t0 = performance.now(), id = 0, vivo = true;
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { visivel = en[0].isIntersecting; if (visivel) arranca(); }) : null;
    if (io) io.observe(el);
    function mexe(ev) { var b = el.getBoundingClientRect(); alvo.x = Math.max(-1, Math.min(1, (ev.clientX - (b.left + b.width / 2)) / 220)); alvo.y = Math.max(-1, Math.min(1, (ev.clientY - (b.top + b.height / 2)) / 220)); }
    function inclina(ev) { if (ev.gamma == null) return; alvo.x = Math.max(-1, Math.min(1, ev.gamma / 30)); alvo.y = Math.max(-1, Math.min(1, (ev.beta - 45) / 30)); }
    window.addEventListener('pointermove', mexe, { passive: true });
    window.addEventListener('deviceorientation', inclina, { passive: true });
    function quadro(t) {
      var s = (t - t0) / 1000, ent = Math.min(1, s / 1.6), mola = 1 - Math.pow(1 - ent, 4);
      atual.x += (alvo.x - atual.x) * .06; atual.y += (alvo.y - atual.y) * .06;
      grupo.rotation.y = (1 - mola) * -Math.PI * 2 + Math.sin(s * .7) * .42 + atual.x * .35;
      grupo.rotation.x = Math.sin(s * .5) * .07 + atual.y * .22;
      grupo.position.y = Math.sin(s * 1.1) * .04;
      grupo.scale.setScalar(.7 + .3 * mola);
      r.render(cena, cam);
    }
    function ciclo(t) { id = 0; if (!vivo) return; quadro(t); if (visivel && !document.hidden) id = requestAnimationFrame(ciclo); }
    function arranca() { if (!vivo || id) return; if (reduz) { grupo.rotation.set(.04, .38, 0); r.render(cena, cam); return; } id = requestAnimationFrame(ciclo); }
    document.addEventListener('visibilitychange', arranca);
    requestAnimationFrame(function () { el.classList.add('e3d-on'); });
    arranca();
    return {
      el: el,
      patente: function (p) { insignia(p); if (reduz || !id) arranca(); if (reduz) r.render(cena, cam); },
      fim: function () {
        vivo = false; if (id) cancelAnimationFrame(id); if (io) io.disconnect();
        window.removeEventListener('pointermove', mexe); window.removeEventListener('deviceorientation', inclina); document.removeEventListener('visibilitychange', arranca);
        cena.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
        r.dispose(); cv.remove(); el.classList.remove('e3d-on', 'e3d');
      },
    };
  }

  window.Missao3D = {
    ligado: ligado,
    // Monta (ou atualiza) o emblema num elemento. Devolve uma promessa; falhas ficam no SVG.
    emblema: function (el, patente) {
      if (!el || !ligado() || !webgl()) return Promise.resolve(null);
      var j = vivos.filter(function (v) { return v.el === el; })[0];
      if (j) { j.patente(patente); return Promise.resolve(j); }
      if (el.__e3d) return el.__e3d;
      el.__e3d = three().then(function (T) { var v = criar(T, el, patente); vivos.push(v); el.__e3d = null; return v; }, function () { el.__e3d = null; return null; });
      return el.__e3d;
    },
    soltar: function (el) { vivos = vivos.filter(function (v) { if (v.el === el) { v.fim(); return false; } return true; }); },
    desligar: function () { vivos.forEach(function (v) { v.fim(); }); vivos = []; },
  };
})();
