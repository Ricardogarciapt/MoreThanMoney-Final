// Mapa 3D das Rotas (MapLibre GL + mosaicos vetoriais OpenFreeMap, sem chave):
// cidade em 3D com prédios em relevo nas cores da marca, faróis de luz nos pontos do jogo,
// etiquetas de jogo, o teu marcador com pulso, a linha até ao alvo e o trajeto GPS do dia.
// Sem WebGL devolve false e a app usa o mapa 2D antigo.
(function () {
  'use strict';
  var V = '4.7.1', JS = 'https://unpkg.com/maplibre-gl@' + V + '/dist/maplibre-gl.js', CSS = 'https://unpkg.com/maplibre-gl@' + V + '/dist/maplibre-gl.css';
  var reduz = false; try { reduz = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  var carga = null;
  function lib() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (carga) return carga;
    carga = new Promise(function (ok, ko) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = CSS; document.head.appendChild(l);
      var s = document.createElement('script'); s.src = JS; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { window.maplibregl ? ok(window.maplibregl) : ko(new Error('sem maplibre')); };
      s.onerror = function () { carga = null; ko(new Error('falhou')); };
      document.head.appendChild(s);
    });
    return carga;
  }
  function webgl() { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (_) { return false; } }

  var css = document.createElement('style');
  css.textContent = [
    '.m3d{position:relative;height:min(64vh,560px);min-height:380px;border-radius:20px;overflow:hidden;border:1px solid rgba(233,196,106,.25);background:#06080c;box-shadow:0 24px 60px -30px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,236,180,.08);margin:10px 0 14px}',
    '.m3d.cheio{position:fixed;inset:0;height:auto;min-height:0;border-radius:0;z-index:40;margin:0}body.mapa-cheio .doca,body.mapa-cheio .topo{display:none!important}body.mapa-cheio>.cx{z-index:50}.m3d.cheio .m3d-hud{top:calc(env(safe-area-inset-top) + 10px)}.m3d.cheio .m3d-bts,.m3d.cheio .m3d-leg{bottom:calc(env(safe-area-inset-bottom) + 34px)}',
    '.m3d .mapa-in{position:absolute;inset:0}',
    '.m3d::before{content:"";position:absolute;left:0;right:0;top:0;height:34%;z-index:2;pointer-events:none;background:linear-gradient(180deg,rgba(40,30,12,.55),rgba(6,8,12,0))}',
    '.m3d::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;box-shadow:inset 0 0 80px rgba(0,0,0,.75)}',
    '.m3d-hud{position:absolute;left:10px;right:10px;top:10px;z-index:3;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none}',
    '.m3d-chip{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;background:rgba(10,12,18,.78);border:1px solid rgba(233,196,106,.3);backdrop-filter:blur(8px);color:#f3f4f7;font:600 12px/1 Oswald,sans-serif;letter-spacing:.6px;text-transform:uppercase}',
    '.m3d-chip b{color:#E9C46A;font-family:Anton,sans-serif;font-weight:400;font-size:15px;letter-spacing:.4px}',
    '.m3d-gps{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:4;border:0;border-radius:999px;padding:12px 18px;font:600 14px/1 Oswald,sans-serif;letter-spacing:.5px;color:#15110a;background:radial-gradient(120% 90% at 50% 0%,#fff1c2,#E9C46A 40%,#D2A63C 75%,#8a6418);box-shadow:0 10px 26px -8px rgba(233,196,106,.75),inset 0 1px 0 rgba(255,255,255,.6);cursor:pointer;white-space:nowrap}.m3d-gps[hidden]{display:none}',
    '.m3d-bts{position:absolute;right:10px;bottom:34px;z-index:3;display:grid;gap:8px}',
    '.m3d-bts button{width:44px;height:44px;border-radius:14px;border:1px solid rgba(233,196,106,.35);background:linear-gradient(180deg,rgba(28,32,44,.92),rgba(10,12,18,.92));color:#E9C46A;font-size:18px;display:grid;place-items:center;box-shadow:0 8px 20px -8px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.08);cursor:pointer}',
    '.m3d-bts button:active{transform:scale(.92)}',
    '.m3d-leg{position:absolute;left:10px;bottom:34px;z-index:3;display:grid;gap:4px;padding:8px 10px;border-radius:12px;background:rgba(10,12,18,.72);border:1px solid rgba(255,255,255,.08);font:500 11px/1.2 Oswald,sans-serif;color:#c9ced8;letter-spacing:.4px}',
    '.m3d-leg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px}',
    '.m3d .maplibregl-ctrl-attrib{background:rgba(6,8,12,.6)!important;font-size:10px}.m3d .maplibregl-ctrl-attrib a{color:#8a93a3!important}',
    '.m3d .maplibregl-ctrl-attrib-button{filter:invert(1) opacity(.6)}',
    // etiquetas de jogo
    '.m3d-et{cursor:pointer;display:flex;flex-direction:column;align-items:center;transform-origin:50% 100%}',
    '.m3d-et .c{display:flex;align-items:center;gap:7px;padding:5px 10px 5px 5px;border-radius:12px;background:linear-gradient(180deg,rgba(26,30,42,.95),rgba(9,11,16,.95));border:1px solid rgba(233,196,106,.45);box-shadow:0 10px 24px -10px rgba(0,0,0,.9),0 0 18px -6px rgba(233,196,106,.6);white-space:nowrap;max-width:200px}',
    '.m3d-et .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font-size:14px;background:radial-gradient(circle at 30% 25%,#fff1c2,#D2A63C 55%,#7a5812);color:#15110a;flex:none}',
    '.m3d-et .t{display:flex;flex-direction:column;min-width:0}.m3d-et .t b{font:600 12.5px/1.15 Oswald,sans-serif;color:#f5f6f8;overflow:hidden;text-overflow:ellipsis}.m3d-et .t small{font:500 10.5px/1.2 Oswald,sans-serif;color:#E9C46A;letter-spacing:.4px;text-transform:uppercase}',
    '.m3d-et .p{width:2px;height:16px;background:linear-gradient(180deg,rgba(233,196,106,.9),rgba(233,196,106,0))}',
    '.m3d-et.n .c{border-color:rgba(30,170,230,.5);box-shadow:0 10px 24px -10px rgba(0,0,0,.9),0 0 16px -6px rgba(30,170,230,.6)}.m3d-et.n .ic{background:radial-gradient(circle at 30% 25%,#c9f0ff,#1EAAE6 55%,#0b4f72);color:#04131d}.m3d-et.n .t small{color:#7fd3f7}.m3d-et.n .p{background:linear-gradient(180deg,rgba(30,170,230,.9),rgba(30,170,230,0))}',
    '.m3d-et.feito{opacity:.62}.m3d-et.feito .ic{background:radial-gradient(circle at 30% 25%,#d9ffe9,#3ccf8e 55%,#0b3b2a)}',
    '.m3d-et.alvo .c{border-color:#fff3c4;box-shadow:0 0 0 2px rgba(233,196,106,.55),0 0 28px -4px rgba(233,196,106,.9)}',
    '.m3d-et .c{animation:m3dFlut 3.2s ease-in-out infinite}@keyframes m3dFlut{50%{transform:translateY(-4px)}}',
    '.m3d-eu{width:22px;height:22px;border-radius:50%;background:#1EAAE6;border:3px solid #fff;box-shadow:0 0 0 0 rgba(30,170,230,.6),0 4px 12px rgba(0,0,0,.6);animation:m3dPulso 2s ease-out infinite}',
    '@keyframes m3dPulso{0%{box-shadow:0 0 0 0 rgba(30,170,230,.55),0 4px 12px rgba(0,0,0,.6)}100%{box-shadow:0 0 0 26px rgba(30,170,230,0),0 4px 12px rgba(0,0,0,.6)}}',
    '@media (prefers-reduced-motion:reduce){.m3d-et .c,.m3d-eu{animation:none}}'
  ].join('');
  document.head.appendChild(css);

  var GL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
  function estilo() {
    var lw = function (a, b) { return ['interpolate', ['exponential', 1.6], ['zoom'], 12, a, 18, b]; };
    return {
      version: 8, glyphs: GL, light: { anchor: 'map', color: '#ffe2a8', intensity: .55, position: [1.4, 210, 40] },
      sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' } },
      layers: [
        { id: 'fundo', type: 'background', paint: { 'background-color': '#0b0e14' } },
        { id: 'uso', type: 'fill', source: 'omt', 'source-layer': 'landuse', paint: { 'fill-color': '#0f131c', 'fill-opacity': .8 } },
        { id: 'verde', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland', 'wetland']]], paint: { 'fill-color': '#0b1a13', 'fill-opacity': .9 } },
        { id: 'parque', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#0d2117', 'fill-outline-color': '#1c4a32' } },
        { id: 'agua', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#06192a' } },
        { id: 'agua-l', type: 'line', source: 'omt', 'source-layer': 'water', paint: { 'line-color': '#0f3b5c', 'line-width': 1, 'line-blur': 1 } },
        { id: 'rio', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#0c2c45', 'line-width': lw(1, 6) } },
        { id: 'caminho', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['path', 'track', 'pedestrian']]], paint: { 'line-color': '#3a4a3a', 'line-width': lw(.6, 2.5), 'line-dasharray': [2, 1.5] } },
        { id: 'rua-c', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#030407', 'line-width': lw(1.6, 22) } },
        { id: 'rua', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2a3244', 'line-width': lw(.8, 16) } },
        { id: 'avenida', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['secondary', 'primary']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5a4a26', 'line-width': lw(1.2, 20) } },
        { id: 'via', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['in', ['get', 'class'], ['literal', ['trunk', 'motorway']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8a6a2a', 'line-width': lw(1.6, 24) } },
        { id: 'predios', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13.5,
          paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#232a3a', 20, '#2c3346', 50, '#3a3d4e', 120, '#5a4b2c'],
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, ['coalesce', ['get', 'render_height'], 8]],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': .92, 'fill-extrusion-vertical-gradient': true } },
        { id: 'rua-nome', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': '#7c8596', 'text-halo-color': '#05070a', 'text-halo-width': 1.4 } },
        { id: 'lugar', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter']]], layout: { 'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 12], 'text-transform': 'uppercase', 'text-letter-spacing': .15 }, paint: { 'text-color': '#b39250', 'text-halo-color': '#05070a', 'text-halo-width': 1.6 } }
      ]
    };
  }

  // Círculo em polígono (metros) para faróis e raios de chegada.
  function circulo(lon, lat, m, n) {
    n = n || 40; var c = [], dLat = m / 111320, dLon = m / (111320 * Math.cos(lat * Math.PI / 180));
    for (var i = 0; i <= n; i++) { var a = i / n * Math.PI * 2; c.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]); }
    return c;
  }
  function distM(a, b) { var R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; var h = Math.pow(Math.sin(dLa / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dLo / 2), 2); return 2 * R * Math.asin(Math.sqrt(h)); }
  function fc(f) { return { type: 'FeatureCollection', features: f }; }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICONES = { Parque: '🌳', Jardim: '🌿', 'Praça': '⛲', Biblioteca: '📚', Miradouro: '🔭', Museu: '🏛️' };

  // ── Trajeto GPS do dia (fica no telemóvel) ──
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function trajetoLer() { try { var t = JSON.parse(localStorage.getItem('missaoTrajeto') || 'null'); return t && t.dia === hoje() ? t : { dia: hoje(), pts: [], m: 0 }; } catch (_) { return { dia: hoje(), pts: [], m: 0 }; } }
  function trajetoGuardar(t) { try { localStorage.setItem('missaoTrajeto', JSON.stringify(t)); } catch (_) {} }

  function criar(M, el, op) {
    el.innerHTML = '';
    el.classList.add('m3d');
    var dentro = document.createElement('div'); dentro.className = 'mapa-in'; el.appendChild(dentro);
    var hud = document.createElement('div'); hud.className = 'm3d-hud';
    hud.innerHTML = '<span class="m3d-chip" data-m="pontos">⌖ <b>0</b> pontos</span><span class="m3d-chip" data-m="km">👣 <b>0,0</b> km hoje</span>';
    el.appendChild(hud);
    var gps = document.createElement('button'); gps.type = 'button'; gps.className = 'm3d-gps'; gps.innerHTML = '📍 Usar a minha localização';
    gps.addEventListener('click', function () { gps.textContent = 'A localizar…'; if (op.pedirPosicao) op.pedirPosicao(); setTimeout(function () { if (!est.eu) gps.innerHTML = '📍 Usar a minha localização'; }, 15000); });
    el.appendChild(gps);
    var bts = document.createElement('div'); bts.className = 'm3d-bts';
    bts.innerHTML = '<button type="button" data-mb="eu" aria-label="Centrar em mim">◎</button><button type="button" data-mb="vista" aria-label="Alternar 2D e 3D">2D</button><button type="button" data-mb="rodar" aria-label="Rodar a câmara">⟳</button><button type="button" data-mb="cheio" aria-label="Ecrã inteiro">⛶</button>';
    el.appendChild(bts);
    var leg = document.createElement('div'); leg.className = 'm3d-leg';
    leg.innerHTML = '<span><i style="background:#E9C46A"></i>Lição do Ricardo</span><span><i style="background:#1EAAE6"></i>Ponto seguro</span><span><i style="background:#3ccf8e"></i>Visitado</span>';
    el.appendChild(leg);

    var c0 = op.centro || { lat: 38.7223, lon: -9.1393 };
    var mapa = new M.Map({ container: dentro, style: estilo(), center: [c0.lon, c0.lat], zoom: op.zoom || 15.6, pitch: 62, bearing: -24, maxPitch: 75, antialias: true, attributionControl: { compact: true }, dragRotate: true, touchPitch: true });
    var est = { pontos: [], eu: null, alvo: null, vis: {}, marcas: [], euM: null, pronto: false, rodar: false, tr: trajetoLer() };

    function prepara() {
      if (est.pronto || !mapa.isStyleLoaded()) return;
      mapa.addSource('raios', { type: 'geojson', data: fc([]) });
      mapa.addSource('farois', { type: 'geojson', data: fc([]) });
      mapa.addSource('trajeto', { type: 'geojson', data: fc([]) });
      mapa.addSource('linha', { type: 'geojson', data: fc([]) });
      mapa.addLayer({ id: 'raio-f', type: 'fill', source: 'raios', paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': .1 } }, 'predios');
      mapa.addLayer({ id: 'raio-l', type: 'line', source: 'raios', paint: { 'line-color': ['get', 'cor'], 'line-width': 1.5, 'line-opacity': .6, 'line-dasharray': [2, 2] } }, 'predios');
      mapa.addLayer({ id: 'traj-brilho', type: 'line', source: 'trajeto', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1EAAE6', 'line-width': 12, 'line-blur': 8, 'line-opacity': .55 } });
      mapa.addLayer({ id: 'traj', type: 'line', source: 'trajeto', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#bff0ff', 'line-width': 3.5 } });
      mapa.addLayer({ id: 'linha-brilho', type: 'line', source: 'linha', paint: { 'line-color': '#E9C46A', 'line-width': 9, 'line-blur': 6, 'line-opacity': .45 } });
      mapa.addLayer({ id: 'linha', type: 'line', source: 'linha', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#fff1c2', 'line-width': 3, 'line-dasharray': [1.2, 1.4] } });
      mapa.addLayer({ id: 'farois', type: 'fill-extrusion', source: 'farois', paint: { 'fill-extrusion-color': ['get', 'cor'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': .85 } });
      est.pronto = true; pinta(); trajetoPinta();
      if (op.aoPronto) op.aoPronto();
    }
    // O estilo é nosso; mesmo que os mosaicos demorem, as camadas do jogo entram logo.
    mapa.on('style.load', prepara); mapa.on('load', prepara); mapa.on('styledata', prepara);

    function cor(p) { return est.vis[p.id] ? '#3ccf8e' : p.ricardo ? '#E9C46A' : '#1EAAE6'; }
    function pinta() {
      var raios = [], farois = [];
      est.pontos.forEach(function (p) {
        var k = cor(p), alto = p.ricardo ? 70 : 42;
        raios.push({ type: 'Feature', properties: { cor: k }, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, p.raio_m || 80, 48)] } });
        // farol: haste fina + anel luminoso no topo
        farois.push({ type: 'Feature', properties: { cor: k, h: alto, b: 0 }, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, 3.2, 16)] } });
        farois.push({ type: 'Feature', properties: { cor: k, h: alto + 6, b: alto - 2 }, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, 9, 24)] } });
        if (est.alvo === p.id) farois.push({ type: 'Feature', properties: { cor: '#fff3c4', h: 2, b: 0 }, geometry: { type: 'Polygon', coordinates: [circulo(p.lon, p.lat, 16, 32)] } });
      });
      if (est.pronto) { mapa.getSource('raios').setData(fc(raios)); mapa.getSource('farois').setData(fc(farois)); }
      est.marcas.forEach(function (m) { m.remove(); }); est.marcas = [];
      est.pontos.forEach(function (p) {
        var d = est.eu ? distM(est.eu, p) : null, e = document.createElement('div');
        e.className = 'm3d-et' + (p.ricardo ? '' : ' n') + (est.vis[p.id] ? ' feito' : '') + (est.alvo === p.id ? ' alvo' : '');
        var sub = est.vis[p.id] ? 'Visitado ✓' : (p.ricardo ? (p.xp_extra ? '+' + p.xp_extra + ' XP · ' : '') + 'Lição' : esc(p.tipo || 'Ponto')) + (d != null ? ' · ' + (d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m') : '');
        e.innerHTML = '<div class="c"><span class="ic">' + (p.ricardo ? '★' : (ICONES[p.tipo] || '⌖')) + '</span><span class="t"><b>' + esc(p.nome) + '</b><small>' + sub + '</small></span></div><div class="p"></div>';
        e.addEventListener('click', function (ev) { ev.stopPropagation(); if (op.aoTocar) op.aoTocar(p); });
        est.marcas.push(new M.Marker({ element: e, anchor: 'bottom', offset: [0, -6] }).setLngLat([p.lon, p.lat]).addTo(mapa));
      });
      hud.querySelector('[data-m=pontos] b').textContent = est.pontos.length;
      linha();
    }
    function linha() {
      if (!est.pronto) return;
      var p = est.pontos.filter(function (k) { return k.id === est.alvo; })[0];
      mapa.getSource('linha').setData(fc(p && est.eu ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[est.eu.lon, est.eu.lat], [p.lon, p.lat]] } }] : []));
    }
    function trajetoPinta() {
      var t = est.tr; hud.querySelector('[data-m=km] b').textContent = (t.m / 1000).toFixed(1).replace('.', ',');
      if (est.pronto) mapa.getSource('trajeto').setData(fc(t.pts.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: t.pts } }] : []));
    }
    function enquadrar(anim) {
      var pts = est.pontos.map(function (p) { return [p.lon, p.lat]; }); if (est.eu) pts.push([est.eu.lon, est.eu.lat]);
      if (!pts.length) return;
      if (pts.length === 1) { mapa.easeTo({ center: pts[0], zoom: 16, pitch: 62, duration: anim ? 1400 : 0 }); return; }
      var b = new M.LngLatBounds(pts[0], pts[0]); pts.forEach(function (q) { b.extend(q); });
      mapa.fitBounds(b, { padding: { top: 70, bottom: 60, left: 50, right: 70 }, maxZoom: 16.6, pitch: 62, bearing: mapa.getBearing(), duration: anim ? 1600 : 0 });
    }
    bts.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return; var k = b.getAttribute('data-mb');
      if (k === 'eu') { if (est.eu) mapa.flyTo({ center: [est.eu.lon, est.eu.lat], zoom: 17, pitch: 65, duration: 1400 }); else if (op.pedirPosicao) op.pedirPosicao(); }
      else if (k === 'vista') { var em3 = mapa.getPitch() > 10; mapa.easeTo({ pitch: em3 ? 0 : 62, bearing: em3 ? 0 : -24, duration: 900 }); b.textContent = em3 ? '3D' : '2D'; }
      else if (k === 'rodar') { est.rodar = !est.rodar; b.style.color = est.rodar ? '#fff' : ''; if (est.rodar) rodar(); }
      else if (k === 'cheio') { el.classList.toggle('cheio'); var ch = el.classList.contains('cheio'); document.body.style.overflow = ch ? 'hidden' : ''; document.body.classList.toggle('mapa-cheio', ch); b.textContent = el.classList.contains('cheio') ? '✕' : '⛶'; setTimeout(function () { mapa.resize(); }, 60); }
    });
    function rodar() { if (!est.rodar || reduz) return; mapa.easeTo({ bearing: mapa.getBearing() + 40, duration: 6000, easing: function (t) { return t; } }); mapa.once('moveend', rodar); }
    mapa.on('dragstart', function () { est.rodar = false; var rb = bts.querySelector('[data-mb=rodar]'); if (rb) rb.style.color = ''; });

    var primeiraVez = true;
    return {
      mapa: mapa,
      pontos: function (lista, vis, alvo) {
        est.pontos = lista || []; est.vis = vis || {}; est.alvo = alvo || null; pinta();
        if (primeiraVez && est.pontos.length) { primeiraVez = false; enquadrar(!reduz); }
      },
      enquadrar: function () { enquadrar(true); },
      alvo: function (id) { est.alvo = id; pinta(); },
      eu: function (pos) {
        est.eu = pos; if (!pos) return;
        gps.hidden = true;
        if (!est.euM) { var e = document.createElement('div'); e.className = 'm3d-eu'; est.euM = new M.Marker({ element: e }).setLngLat([pos.lon, pos.lat]).addTo(mapa); }
        else est.euM.setLngLat([pos.lon, pos.lat]);
        // Trajeto: só com boa precisão e quando te mexes mais de 8 m
        if (pos.prec == null || pos.prec < 40) {
          var t = est.tr; if (t.dia !== hoje()) t = est.tr = { dia: hoje(), pts: [], m: 0 };
          var u = t.pts[t.pts.length - 1], d = u ? distM({ lat: u[1], lon: u[0] }, pos) : 99;
          if (d > 8 && d < 500) { if (u) t.m += d; t.pts.push([+pos.lon.toFixed(6), +pos.lat.toFixed(6)]); if (t.pts.length > 2000) t.pts.shift(); trajetoGuardar(t); trajetoPinta(); }
          else if (!u) { t.pts.push([+pos.lon.toFixed(6), +pos.lat.toFixed(6)]); trajetoGuardar(t); }
        }
        linha();
        est.marcas.forEach(function (m, i) { var p = est.pontos[i]; if (!p) return; var s = m.getElement().querySelector('small'); if (s && !est.vis[p.id]) { var dd = distM(pos, p); s.textContent = (p.ricardo ? (p.xp_extra ? '+' + p.xp_extra + ' XP · ' : '') + 'Lição' : (p.tipo || 'Ponto')) + ' · ' + (dd >= 1000 ? (dd / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(dd) + ' m'); } });
      },
      redimensionar: function () { mapa.resize(); },
    };
  }

  var inst = null;
  window.MissaoMapa = {
    suporta: webgl,
    // Monta uma vez; devolve uma promessa com a instância (ou null, e a app usa o 2D).
    montar: function (el, op) {
      if (inst) return Promise.resolve(inst);
      if (!el || !webgl()) return Promise.resolve(null);
      return lib().then(function (M) { inst = criar(M, el, op || {}); return inst; }, function () { return null; });
    },
    instancia: function () { return inst; },
  };
})();
