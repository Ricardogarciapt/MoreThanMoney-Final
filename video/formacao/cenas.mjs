/**
 * Academia de Vendas MTM — o desenho de cada cena (HTML 1920×1080, animações CSS com a duração da fala).
 *
 * Cada cena recebe `--dur` (segundos) e as animações escalam com ela: as listas e os passos aparecem
 * ao ritmo da narração, não todos de uma vez. O render (`render.mjs`) pausa as animações e avança o
 * tempo frame a frame, por isso o vídeo sai igual em qualquer máquina.
 *
 * Os ecrãs do back-office: se houver captura real em `public/formacao/ecras/<id>.png`, entra ela dentro
 * da janela; senão desenha-se o ecrã com a mesma estrutura do back-office e dados de exemplo, e a cena
 * diz isso em letra pequena — nunca se faz passar um exemplo por dados reais.
 */
import fs from 'node:fs'
import path from 'node:path'

const OURO = '#D2A63C'
const OURO_CLARO = '#E9C46A'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function css(raiz) {
  const f = (n) => `file://${path.join(raiz, 'video/motor/fontes', n)}`
  return `
@font-face{font-family:Anton;src:url('${f('Anton.ttf')}')}
@font-face{font-family:Oswald;src:url('${f('Oswald.ttf')}')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#09090b;color:#f4f4f5;font-family:Inter,sans-serif}
#palco{position:absolute;inset:0;overflow:hidden}
.fundo{position:absolute;inset:-10%;background:
  radial-gradient(900px 600px at 18% 20%,rgba(210,166,60,.16),transparent 60%),
  radial-gradient(800px 700px at 85% 85%,rgba(233,196,106,.09),transparent 60%),
  linear-gradient(160deg,#0d0d10,#060607);animation:deriva calc(var(--dur)*1s) linear both}
@keyframes deriva{from{transform:scale(1.04) translate(0,0)}to{transform:scale(1.10) translate(-1.5%,-1%)}}
.grelha{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:80px 80px;mask-image:radial-gradient(circle at 50% 40%,#000 30%,transparent 80%)}
.topo{position:absolute;top:44px;left:80px;right:80px;display:flex;justify-content:space-between;align-items:center;z-index:5}
.topo img{height:84px;filter:drop-shadow(0 0 18px rgba(210,166,60,.55)) brightness(1.35)}
.marca{display:flex;align-items:center;gap:18px;font:600 30px Oswald;letter-spacing:.06em;color:#e4e4e7}
.v-centro{display:flex;flex-direction:column;justify-content:center;height:100%}
.etiqueta{font:600 20px Inter;letter-spacing:.18em;text-transform:uppercase;color:${OURO_CLARO};border:1px solid rgba(210,166,60,.35);padding:10px 18px;border-radius:999px;background:rgba(210,166,60,.06)}
.barra{position:absolute;left:0;bottom:0;height:6px;background:linear-gradient(90deg,${OURO},${OURO_CLARO});animation:barra calc(var(--dur)*1s) linear both;z-index:6}
@keyframes barra{from{width:0}to{width:100%}}
.aviso{position:absolute;bottom:26px;left:80px;right:80px;font:400 17px Inter;color:#71717a;z-index:5}
.conteudo{position:absolute;top:150px;left:120px;right:120px;bottom:110px}
h1{font-family:Anton;font-weight:400;letter-spacing:.01em;line-height:1.02}
h2{font-family:Oswald;font-weight:600;font-size:64px;line-height:1.1;color:#fff}
h2 b{color:${OURO}}
.entra{opacity:0;animation:entra .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*1s)}
@keyframes entra{from{opacity:0;transform:translateY(34px);filter:blur(8px)}to{opacity:1;transform:none;filter:none}}
.risco{height:4px;width:0;background:${OURO};animation:risco 1s .4s cubic-bezier(.2,.8,.2,1) both;margin:26px 0}
@keyframes risco{to{width:220px}}
/* capa */
.capa{display:flex;flex-direction:column;justify-content:center;height:100%}
.capa .num{position:absolute;right:40px;top:40px;font:400 520px/1 Anton;color:transparent;-webkit-text-stroke:2px rgba(210,166,60,.18);animation:entra 1.4s both}
.capa h1{font-size:150px;background:linear-gradient(90deg,#fff,${OURO_CLARO} 60%,${OURO});-webkit-background-clip:text;color:transparent}
.capa p{font:500 44px Oswald;color:#d4d4d8;letter-spacing:.02em}
/* lista */
.itens{margin-top:46px;display:grid;gap:22px}
.item{display:flex;gap:26px;align-items:center;font:500 40px Inter;color:#e4e4e7;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:22px;padding:24px 30px}
.item .ic{flex:none;width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:rgba(210,166,60,.14);color:${OURO};font:700 30px Inter}
.regra .item .ic{background:rgba(239,68,68,.14);color:#f87171}
/* fluxo */
.fluxo{display:flex;gap:0;margin-top:90px;align-items:flex-start}
.passo{flex:1;text-align:center;position:relative;padding:0 18px}
.passo .bola{width:120px;height:120px;margin:0 auto 34px;border-radius:50%;display:grid;place-items:center;font:400 58px Anton;color:#09090b;background:linear-gradient(140deg,${OURO_CLARO},${OURO});box-shadow:0 0 60px rgba(210,166,60,.35)}
.passo p{font:600 34px Oswald;color:#f4f4f5;line-height:1.2}
.passo:not(:last-child)::after{content:'';position:absolute;top:60px;left:calc(50% + 70px);width:calc(100% - 140px);height:4px;background:linear-gradient(90deg,${OURO},rgba(210,166,60,.2));transform-origin:left;transform:scaleX(0);animation:liga .8s both;animation-delay:calc((var(--i) + .6)*1s)}
@keyframes liga{to{transform:scaleX(1)}}
/* mapa */
svg.mapa{position:absolute;inset:0;width:100%;height:100%}
.ramo{fill:none;stroke:${OURO};stroke-width:4;stroke-dasharray:900;stroke-dashoffset:900;animation:traca 1.1s both;animation-delay:calc(var(--i)*1s)}
@keyframes traca{to{stroke-dashoffset:0}}
.no.centro{position:absolute;width:280px;height:280px;border-radius:50%;display:grid;place-items:center;text-align:center;font:400 50px/1.05 Anton;color:#09090b;background:radial-gradient(circle at 30% 30%,${OURO_CLARO},${OURO});box-shadow:0 0 120px rgba(210,166,60,.45);padding:28px}
.cartao-mapa{position:absolute;background:rgba(20,20,23,.92);border:2px solid rgba(210,166,60,.55);border-radius:24px;padding:26px 26px 18px}
.cartao-mapa .ramo-n{font:600 40px Oswald;color:${OURO_CLARO};margin-bottom:16px}
.cartao-mapa .folha{font:500 27px/1.3 Inter;color:#e4e4e7;padding:10px 0 10px 26px;border-top:1px solid rgba(255,255,255,.07);position:relative}
.cartao-mapa .folha::before{content:'';position:absolute;left:2px;top:22px;width:10px;height:10px;border-radius:50%;background:${OURO}}
/* guião */
.guiao{display:grid;grid-template-columns:1fr 560px;gap:80px;height:100%;align-items:center}
.guiao .quando{margin-top:22px;font:400 32px Inter;color:#a1a1aa}
.guiao .quando b{color:${OURO_CLARO};font-weight:600}
.tel{width:520px;height:860px;border-radius:64px;background:#111114;border:3px solid #2a2a30;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 10px #0c0c0e;padding:90px 26px 30px;position:relative}
.tel::before{content:'';position:absolute;top:24px;left:50%;transform:translateX(-50%);width:150px;height:34px;border-radius:20px;background:#000}
.tel .cab{font:600 24px Inter;color:#d4d4d8;padding:0 10px 20px;border-bottom:1px solid #222;margin-bottom:26px}
.bolha{background:linear-gradient(140deg,#1f6f4a,#16573a);color:#fff;font:400 27px/1.42 Inter;padding:22px 24px;border-radius:26px 26px 6px 26px;margin-left:30px;white-space:pre-wrap}
.cursor{display:inline-block;width:3px;height:28px;background:#fff;vertical-align:-4px;animation:pisca .8s steps(1) infinite}
@keyframes pisca{50%{opacity:0}}
/* ecrã */
.janela{position:absolute;left:0;top:0;width:1180px;height:760px;border-radius:20px;overflow:hidden;background:#0b0b0d;border:1px solid #27272a;box-shadow:0 40px 120px rgba(0,0,0,.6);animation:janela 1.2s cubic-bezier(.2,.8,.2,1) both}
@keyframes janela{from{opacity:0;transform:perspective(1600px) rotateY(12deg) translateX(-60px) scale(.94)}to{opacity:1;transform:perspective(1600px) rotateY(4deg)}}
.barra-nav{height:46px;background:#18181b;display:flex;align-items:center;gap:9px;padding:0 18px}
.barra-nav i{width:13px;height:13px;border-radius:50%;background:#3f3f46}
.barra-nav span{margin-left:18px;font:400 17px Inter;color:#a1a1aa;background:#0b0b0d;padding:6px 18px;border-radius:8px}
.bo{display:grid;grid-template-columns:230px 1fr;height:calc(100% - 46px)}
.bo nav{border-right:1px solid #1f1f23;padding:22px 14px}
.bo nav .logo{font:700 18px Inter;color:${OURO_CLARO};margin:0 10px 22px}
.bo nav p{font:600 11px Inter;letter-spacing:.18em;color:#71717a;margin:16px 10px 8px;text-transform:uppercase}
.bo nav a{display:block;font:400 17px Inter;color:#a1a1aa;padding:8px 12px;border-radius:8px}
.bo nav a.on{background:rgba(210,166,60,.15);color:${OURO_CLARO};font-weight:600}
.bo main{padding:26px 30px;overflow:hidden}
.bo h3{font:700 28px Inter;color:#fff}
.bo .sub{font:400 15px Inter;color:#71717a;margin:4px 0 18px}
.cartao{border:1px solid rgba(255,255,255,.07);background:rgba(24,24,27,.7);border-radius:14px;padding:14px 16px;margin-bottom:10px;font:400 15px Inter;color:#d4d4d8}
.cartao b{color:#fff}
.chip{display:inline-block;font:600 12px Inter;padding:3px 10px;border-radius:999px;background:rgba(210,166,60,.15);color:${OURO_CLARO};margin-left:8px}
.chip.v{background:rgba(34,197,94,.14);color:#4ade80}
.chip.c{background:rgba(255,255,255,.08);color:#a1a1aa}
.btn{display:inline-block;font:600 13px Inter;padding:6px 12px;border-radius:8px;background:${OURO};color:#09090b;margin-top:8px}
.cols{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.cols .col{background:rgba(255,255,255,.03);border-radius:12px;padding:10px}
.cols .col h4{font:600 13px Inter;color:#a1a1aa;margin-bottom:8px}
.exemplo{position:absolute;left:0;top:784px;font:400 16px Inter;color:#52525b}
.destaques{position:absolute;right:0;top:150px;width:520px;display:grid;gap:22px}
.destaque{display:flex;gap:18px;align-items:flex-start;font:500 30px/1.3 Inter;color:#f4f4f5;background:rgba(9,9,11,.85);border:1px solid rgba(210,166,60,.35);border-left:6px solid ${OURO};border-radius:16px;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.destaque .n{flex:none;font:400 34px Anton;color:${OURO}}
.ecra-titulo{position:absolute;right:0;top:0;width:520px;font:600 50px/1.1 Oswald;color:#fff}
.real{width:100%;height:calc(100% - 46px);object-fit:cover;object-position:top left}
/* fim */
.fim{display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center}
.fim .tarefa{margin-top:40px;font:600 54px/1.2 Oswald;color:#fff;max-width:1400px;padding:40px 60px;border-radius:28px;border:2px solid ${OURO};background:rgba(210,166,60,.07);box-shadow:0 0 120px rgba(210,166,60,.18)}
`
}

const sb = (on) => {
  const itens = [['hoje', 'Hoje'], ['pipeline', 'Pipeline'], ['tarefas', 'Tarefas'], ['chamadas', 'Chamadas'], ['extracto', 'O meu extracto'], ['equipa', 'A minha equipa'], ['material', 'Materiais'], ['ib', 'Rede de IBs']]
  const alias = { quadro: 'pipeline', ficha: 'pipeline', whatsapp: 'pipeline' }
  const a = alias[on] || on
  return `<nav><div class="logo">MTM · Backoffice</div><p>O meu trabalho</p>${itens.map(([k, n]) => `<a class="${k === a ? 'on' : ''}">${n}</a>`).join('')}</nav>`
}

/** O miolo de cada ecrã, com a estrutura do back-office e dados de EXEMPLO. */
function miolo(id, L) {
  const pt = L === 'pt'
  const M = {
    hoje: `<h3>${pt ? 'Bom dia, Ana' : 'Good morning, Ana'}</h3><div class="sub">${pt ? '6 coisas para hoje, por urgência' : '6 things for today, by urgency'}</div>
      ${[['Rui M.', pt ? 'Respondeu ontem · qualificar' : 'Replied yesterday · qualify', 'v'], ['Sofia L.', pt ? 'Reunião amanhã · lembrete' : 'Meeting tomorrow · reminder', ''], ['João P.', pt ? 'Lead novo · primeiro contacto' : 'New lead · first contact', 'c']].map(([n, s, c]) => `<div class="cartao"><b>${n}</b><span class="chip ${c}">${s}</span><div style="margin-top:8px;color:#a1a1aa">${pt ? 'Rascunho: «Olá ' + n.split(' ')[0] + ', obrigado pela resposta…»' : 'Draft: “Hi ' + n.split(' ')[0] + ', thanks for your reply…”'}</div><span class="btn">${pt ? 'Abrir e enviar' : 'Open and send'}</span></div>`).join('')}`,
    pipeline: `<h3>Pipeline</h3><div class="sub">${pt ? 'Os teus negócios · bolsa · WhatsApp' : 'Your deals · pool · WhatsApp'}</div>
      ${[['Marta R.', 'Lead', 'c', pt ? 'Primeiro contacto' : 'First contact'], ['Pedro A.', pt ? 'Contactado' : 'Contacted', '', pt ? 'Qualificar antes de apresentar' : 'Qualify before presenting'], ['Inês C.', pt ? 'Qualificado' : 'Qualified', '', pt ? 'Marcar a conversa' : 'Book the call'], ['Tiago F.', pt ? 'Reunião marcada' : 'Meeting booked', 'v', pt ? 'Lembrete na véspera' : 'Reminder the day before']].map(([n, e, c, p]) => `<div class="cartao"><b>${n}</b><span class="chip ${c}">${e}</span><div style="margin-top:6px;color:#a1a1aa">${pt ? 'Passo seguinte' : 'Next step'}: ${p}</div></div>`).join('')}
      <div class="cartao" style="border-color:rgba(210,166,60,.4)"><b>${pt ? 'Bolsa' : 'Pool'}</b> · ${pt ? '12 leads sem dono' : '12 unowned leads'} <span class="btn">${pt ? 'Pegar' : 'Take'}</span></div>`,
    quadro: '',
    ficha: `<h3>Rui Martins</h3><div class="sub">${pt ? 'Ficha 360° · Funil Educação' : '360° record · Education funnel'}</div>
      <div class="cartao"><b>${pt ? 'Nota' : 'Note'}</b>: ${pt ? 'paga mensalidade há 8 meses, opera sozinho, 5 h/semana' : 'pays a monthly fee for 8 months, trades alone, 5 h/week'}</div>
      <div class="cartao"><b>${pt ? 'Consentimento' : 'Consent'}</b><span class="chip v">WhatsApp ✓</span><span class="chip v">Email ✓</span></div>
      <div class="cartao"><b>${pt ? 'Histórico' : 'History'}</b><div style="margin-top:6px;color:#a1a1aa">${pt ? 'Comentou «SCANNER» → recebeu o guia → respondeu ao setter' : 'Commented “SCANNER” → got the guide → replied to the setter'}</div></div>
      <div class="cartao"><b>${pt ? 'Agenda' : 'Calendar'}</b> · ${pt ? 'Onboarding qui 15:30 · Google Meet' : 'Onboarding Thu 15:30 · Google Meet'}</div>`,
    whatsapp: `<h3>${pt ? 'Primeira mensagem de WhatsApp' : 'First WhatsApp message'}</h3><div class="sub">${pt ? 'Leads novos · mais recentes primeiro' : 'New leads · newest first'}</div>
      ${['Carla S.', 'Bruno T.', 'Helena V.'].map((n) => `<div class="cartao"><b>${n}</b><span class="chip c">Lead</span><div style="margin-top:6px;color:#a1a1aa">${pt ? '«Olá ' + n.split(' ')[0] + '! Vi que pediste o guia…»' : '“Hi ' + n.split(' ')[0] + '! I saw you requested the guide…”'}</div><span class="btn">${pt ? 'Abrir WhatsApp' : 'Open WhatsApp'}</span> <span class="btn" style="background:#27272a;color:#e4e4e7">${pt ? 'Marquei enviada' : 'Marked as sent'}</span></div>`).join('')}`,
    tarefas: '',
    chamadas: `<h3>${pt ? 'Chamadas' : 'Calls'}</h3><div class="sub">Google Meet · ${pt ? 'resumo por IA' : 'AI summary'}</div>
      <div class="cartao"><b>${pt ? 'Apresentação · Inês C.' : 'Presentation · Inês C.'}</b><span class="chip v">${pt ? 'terminada' : 'ended'}</span><div style="margin-top:8px;color:#a1a1aa">${pt ? 'Resumo: quer começar com pouco tempo; prefere conta própria; pediu para ver o WebTrader outra vez.' : 'Summary: wants to start with little time; prefers own account; asked to see the WebTrader again.'}</div><span class="btn">${pt ? 'Guardar na ficha' : 'Save to record'}</span> <span class="btn" style="background:#27272a;color:#e4e4e7">${pt ? 'Criar tarefa' : 'Create task'}</span></div>`,
    material: `<h3>${pt ? 'Materiais' : 'Materials'}</h3><div class="sub">${pt ? 'O teu código, os links e o kit do teu papel' : 'Your code, links and role kit'}</div>
      <div class="cartao" style="border-color:rgba(210,166,60,.4)"><div style="font:700 30px monospace;color:${OURO}">ANA7K2</div><div style="color:#a1a1aa;margin-top:4px">morethanmoney.pt/register?ref=ANA7K2</div></div>
      <div class="cartao"><b>${pt ? 'Kit de setter' : 'Setter kit'}</b> · ${pt ? 'guiões, triagem, objeções' : 'scripts, triage, objections'}</div>
      <div class="cartao"><b>${pt ? 'A oferta, como ela é hoje' : 'The offer, as it is today'}</b> · ${pt ? 'preços lidos do sistema' : 'prices read from the system'}</div>
      <div class="cartao"><b>Academia de Vendas</b> · ${pt ? '8 aulas' : '8 lessons'}</div>`,
    extracto: `<h3>${pt ? 'O meu extracto' : 'My statement'}</h3><div class="sub">${pt ? 'O que ganhei, de onde veio, o que falta receber' : 'What I earned, where from, what is pending'}</div>
      ${[[pt ? 'Venda confirmada · Membro' : 'Confirmed sale · Member', 'setter', '+'], [pt ? 'Venda confirmada · Premium' : 'Confirmed sale · Premium', 'closer', '+'], [pt ? 'Devolução' : 'Refund', 'closer', '−']].map(([d, p, s]) => `<div class="cartao"><b>${d}</b><span class="chip c">${p}</span><span style="float:right;color:${s === '+' ? '#4ade80' : '#f87171'};font-weight:700">${s} · · ·</span></div>`).join('')}`,
    equipa: `<h3>${pt ? 'A minha equipa' : 'My team'}</h3><div class="sub">${pt ? 'Quem responde a ti' : 'Who reports to you'}</div>
      ${[['Ana', 'setter', pt ? '9 negócios' : '9 deals'], ['Rui', 'closer', pt ? '4 reuniões' : '4 meetings'], ['Sara', 'prospector', pt ? '23 conversas' : '23 conversations']].map(([n, p, x]) => `<div class="cartao"><b>${n}</b><span class="chip">${p}</span><span style="float:right;color:#a1a1aa">${x}</span></div>`).join('')}`,
    ib: `<h3>${pt ? 'Rede de IBs' : 'IB network'}</h3><div class="sub">PU Prime · ${pt ? 'por onde vale a pena começar' : 'where it’s worth starting'}</div>
      ${[['Conta 1029…', pt ? 'por contactar' : 'to contact', 'c'], ['Conta 8841…', pt ? 'em conversa' : 'in conversation', ''], ['Conta 5512…', pt ? 'no ecossistema' : 'in the ecosystem', 'v']].map(([n, e, c]) => `<div class="cartao"><b>${n}</b><span class="chip ${c}">${e}</span></div>`).join('')}`,
  }
  return M[id] || M.pipeline
}

function janela(id, L, raiz) {
  const real = path.join(raiz, 'public/formacao/ecras', `${id}.png`)
  const url = `backoffice.morethanmoney.pt/${id === 'hoje' ? '' : id}`
  const barra = `<div class="barra-nav"><i></i><i></i><i></i><span>${url}</span></div>`
  if (fs.existsSync(real)) return { html: `<div class="janela">${barra}<img class="real" src="file://${real}"></div>`, exemplo: false }
  return { html: `<div class="janela">${barra}<div class="bo">${sb(id)}<main>${miolo(id, L)}</main></div></div>`, exemplo: true }
}

/** Mind map em árvore: o centro em cima, os ramos em cartões lado a lado com as folhas lá dentro. */
function mapa(c, L) {
  const W = 1680, cx = W / 2, cy = 130, n = c.ramos.length, gap = 36
  const larg = (W - gap * (n - 1)) / n, topoCartao = 400
  let svg = '', html = `<div class="no centro entra" style="left:${cx - 140}px;top:${cy - 140}px;--i:.1">${esc(c.centro[L])}</div>`
  c.ramos.forEach((r, i) => {
    const x = i * (larg + gap), mx = x + larg / 2, t0 = 0.6 + i * 0.9
    svg += `<path class="ramo" style="--i:${t0}" d="M${cx},${cy + 140} C${cx},${cy + 230} ${mx},${topoCartao - 110} ${mx},${topoCartao}"/>`
    html += `<div class="cartao-mapa entra" style="left:${x}px;top:${topoCartao}px;width:${larg}px;--i:${t0 + 0.4}">
      <div class="ramo-n">${esc(r.nome[L])}</div>
      ${r.folhas.map((f, j) => `<div class="folha entra" style="--i:${t0 + 0.8 + j * 0.3}">${esc(f[L])}</div>`).join('')}</div>`
  })
  return `<div style="position:absolute;left:0;top:-20px;width:${W}px;height:820px">
    <svg class="mapa" viewBox="0 0 ${W} 820" preserveAspectRatio="none">${svg}</svg>${html}</div>`
}

/** HTML completo de uma cena. `t` = ritmo: segundos entre elementos que entram. */
export function htmlCena({ cena, aula, total, indice, L, dur, raiz }) {
  const tag = `${L === 'pt' ? 'Aula' : 'Lesson'} ${aula.numero} · ${indice + 1}/${total}`
  let corpo = ''
  // passo entre elementos que entram, para acabarem a ~70% da fala
  const ritmo = (n) => Math.max(0.35, Math.min(3, (dur * 0.7 - 0.8) / Math.max(1, n)))
  const c = cena
  if (c.tipo === 'capa') {
    corpo = `<div class="capa"><div class="num">${String(aula.numero).padStart(2, '0')}</div>
      <h1 class="entra" style="--i:.15">${esc(c.titulo[L])}</h1><div class="risco"></div>
      <p class="entra" style="--i:.6">${esc(c.sub[L])}</p></div>`
  } else if (c.tipo === 'lista' || c.tipo === 'regra') {
    const r = ritmo(c.itens.length)
    const ic = c.tipo === 'regra' ? '✕' : '✓'
    corpo = `<div class="${c.tipo} v-centro"><h2 class="entra" style="--i:0">${esc(c.titulo[L])}</h2><div class="risco"></div>
      <div class="itens">${c.itens.map((it, i) => `<div class="item entra" style="--i:${0.6 + i * r}"><span class="ic">${ic}</span>${esc(it[L])}</div>`).join('')}</div></div>`
  } else if (c.tipo === 'fluxo') {
    const r = ritmo(c.passos.length)
    corpo = `<div class="v-centro" style="margin-top:-60px"><h2 class="entra" style="--i:0">${esc(c.titulo[L])}</h2><div class="risco"></div>
      <div class="fluxo">${c.passos.map((p, i) => `<div class="passo entra" style="--i:${0.6 + i * r}"><div class="bola">${i + 1}</div><p>${esc(p[L])}</p></div>`).join('')}</div></div>`
  } else if (c.tipo === 'mapa') {
    const folhas = c.ramos.reduce((s, r) => s + r.folhas.length, 0)
    const base = 0.6 + c.ramos.length * 0.9 + 1.6
    const escala = Math.max(0.5, Math.min(2.2, (dur * 0.7) / base))
    corpo = `<div style="--esc:${escala}">${mapa(c, L).replace(/--i:([\d.]+)/g, (_, v) => `--i:${(Number(v) * escala).toFixed(2)}`)}</div>`
    void folhas
  } else if (c.tipo === 'ecra') {
    const j = janela(c.ecra, L, raiz)
    const r = ritmo(c.destaques.length + 1)
    corpo = `${j.html}
      <div class="ecra-titulo entra" style="--i:.5">${esc(c.titulo[L])}</div>
      <div class="destaques">${c.destaques.map((d, i) => `<div class="destaque entra" style="--i:${1.2 + i * r}"><span class="n">${i + 1}</span><span>${esc(d[L])}</span></div>`).join('')}</div>
      <div class="exemplo">${j.exemplo ? (L === 'pt' ? 'Ecrã ilustrativo do back-office · dados de exemplo' : 'Illustrative back-office screen · sample data') : (L === 'pt' ? 'Back-office real · dados de exemplo' : 'Real back-office · sample data')}</div>`
  } else if (c.tipo === 'guiao') {
    const txt = c.texto[L]
    const escrita = Math.min(dur * 0.65, Math.max(3, txt.length / 28))
    corpo = `<div class="guiao"><div><div class="etiqueta entra" style="--i:0;display:inline-block">${L === 'pt' ? 'Guião' : 'Script'}</div>
        <h2 class="entra" style="--i:.3;margin-top:28px">${esc(c.titulo[L])}</h2><div class="risco"></div>
        <div class="quando entra" style="--i:.8"><b>${L === 'pt' ? 'Quando' : 'When'}:</b> ${esc(c.quando[L])}</div></div>
      <div class="tel entra" style="--i:.2"><div class="cab">WhatsApp · {nome}</div>
        <div class="bolha" id="bolha" data-texto="${esc(txt)}" data-inicio="1.2" data-dur="${escrita.toFixed(2)}"></div></div></div>`
  } else if (c.tipo === 'fim') {
    corpo = `<div class="fim"><div class="etiqueta entra" style="--i:0">${esc(c.titulo[L])}</div>
      <div class="tarefa entra" style="--i:.5">${esc(c.cta[L])}</div></div>`
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(raiz)}</style></head>
  <body style="--dur:${dur.toFixed(3)}"><div id="palco"><div class="fundo"></div><div class="grelha"></div>
  <div class="topo"><div class="marca"><img src="file://${path.join(raiz, 'public/logo-mtm-transparent.png')}">MORETHANMONEY</div><span class="etiqueta">${esc(tag)}</span></div>
  <div class="conteudo">${corpo}</div>
  <div class="aviso">${L === 'pt' ? 'Formação interna · Conteúdo educativo, não constitui consultoria financeira' : 'Internal training · Educational content, not financial advice'}</div>
  <div class="barra"></div></div>
  <script>
  // máquina de escrever do guião, controlada pelo tempo que o render avança
  window.__tempo = function(t){
    const b = document.getElementById('bolha'); if(!b) return;
    const txt = b.dataset.texto, i0 = +b.dataset.inicio, d = +b.dataset.dur
    const k = Math.max(0, Math.min(1, (t - i0) / d))
    const n = Math.round(txt.length * k)
    b.innerHTML = txt.slice(0, n).replace(/&/g,'&amp;').replace(/</g,'&lt;') + (k < 1 ? '<span class="cursor"></span>' : '')
  }
  </script></body></html>`
}
