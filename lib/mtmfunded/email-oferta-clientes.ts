/**
 * O EMAIL DA OFERTA DE GRATIDÃO (2026-09) — PT e EN.
 *
 * Leva login, servidor, as regras REAIS do programa (vêm da linha de `mtm_funded_programs`), o
 * botão «Ver credenciais» (o mesmo link seguro de uso único de ./credenciais-link.ts), o WebTrader,
 * o convite a partilhar e os passatempos que estão a decorrer (lidos da tabela `giveaways`, com o
 * permalink real do post).
 *
 * NUNCA leva a password: `DadosEmailOferta` não tem campo para ela e o teste
 * (__tests__/oferta-clientes.check.ts) afirma-o sobre o HTML e o texto.
 *
 * Conformidade: sem euros, sem promessas de resultados, conta dita simulada com todas as letras,
 * aviso de risco e rodapé de cancelamento como os broadcasts (lib/broadcast-emails.ts).
 *
 * Puro — sem base nem transporte — para se poder pré-visualizar e testar.
 */
import type { Idioma } from './oferta-clientes'

export interface RegrasOferta {
  objetivo_pct?: number
  objetivo_fase2_pct?: number
  perda_diaria_pct?: number
  perda_maxima_pct?: number
  dias_minimos?: number
  risco_max_pct?: number
}

export interface SorteioOferta {
  slug: string
  palavra: string
  entrada: 'comentario' | 'email' | string
  bilhetesEntrada: number
  extras: Array<{ tipo: string; bilhetes: number; maximo: number }>
  permalink: string | null
  acabaEm: string
}

export interface DadosEmailOferta {
  idioma: Idioma
  nome: string
  login: string
  servidor: string
  saldo: number
  programa: string
  regras: RegrasOferta
  urlLink: string
  expiraEm: string
  siteUrl: string
  sorteios: SorteioOferta[]
  /** Prémios dos sorteios, já em texto (ex.: «5× Desafio MTM Funded · 5K · 1 fase»). */
  premios: string[]
  /** `cid:mtm-logo` no envio; URL pública na pré-visualização. */
  logoSrc?: string
}

const IG = 'https://www.instagram.com/morethanmoney.pt/'
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const num = (n: number | undefined, idioma: Idioma) => (n == null ? '—' : n.toLocaleString(idioma === 'pt' ? 'pt-PT' : 'en-GB'))

function dataCurta(iso: string, idioma: Idioma, comHora = false): string {
  return new Date(iso).toLocaleString(idioma === 'pt' ? 'pt-PT' : 'en-GB', {
    day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/** Como se entra num sorteio, a partir da mecânica gravada. */
export function comoEntrar(s: SorteioOferta, idioma: Idioma): string {
  const pt = idioma === 'pt'
  const extra = (e: SorteioOferta['extras'][number]) => {
    const ate = e.maximo > 1 ? (pt ? `, até ${e.maximo}` : `, up to ${e.maximo}`) : ''
    switch (e.tipo) {
      case 'etiqueta': return pt ? `identifica amigos no post (+${e.bilhetes} cada${ate})` : `tag friends on the post (+${e.bilhetes} each${ate})`
      case 'seguir': return pt ? `segue @morethanmoney.pt (+${e.bilhetes})` : `follow @morethanmoney.pt (+${e.bilhetes})`
      case 'story': return pt ? `partilha nos stories e marca-nos (+${e.bilhetes})` : `share it in your stories and tag us (+${e.bilhetes})`
      case 'referencia': return pt ? `cada pessoa que entrar com o teu código (+${e.bilhetes}${ate})` : `each person who joins with your code (+${e.bilhetes}${ate})`
      case 'broker': return pt ? `conta aberta na corretora parceira (+${e.bilhetes})` : `an account opened with our partner broker (+${e.bilhetes})`
      default: return `${e.tipo} (+${e.bilhetes})`
    }
  }
  const b = s.bilhetesEntrada
  const comCodigo = s.extras.some((e) => e.tipo === 'referencia')
  const entrada = s.entrada !== 'email' && comCodigo
    ? (pt ? `Comenta <b>${esc(s.palavra)}</b> no post e recebes o teu código no Direct (${b} bilhete${b === 1 ? '' : 's'}).`
          : `Comment <b>${esc(s.palavra)}</b> on the post and we'll DM you your code (${b} ticket${b === 1 ? '' : 's'}).`)
    : s.entrada === 'email'
    ? (pt ? `Comenta <b>${esc(s.palavra)}</b> no post e recebes no Direct o link para entrar com o teu email (${b} bilhetes).`
          : `Comment <b>${esc(s.palavra)}</b> on the post and we'll DM you the link to enter with your email (${b} tickets).`)
    : (pt ? `Comenta <b>${esc(s.palavra)}</b> no post (${b} bilhete${b === 1 ? '' : 's'}).`
          : `Comment <b>${esc(s.palavra)}</b> on the post (${b} ticket${b === 1 ? '' : 's'}).`)
  const extras = s.extras.map(extra)
  return extras.length ? `${entrada} ${pt ? 'Mais bilhetes' : 'More tickets'}: ${extras.join('; ')}.` : entrada
}

const tirarTags = (h: string) => h.replace(/<[^>]+>/g, '')

export function montarEmailOferta(d: DadosEmailOferta): { assunto: string; html: string; texto: string } {
  const pt = d.idioma === 'pt'
  const site = d.siteUrl.replace(/\/$/, '')
  const webtrader = `${site}/webtrader`
  const regrasUrl = `${site}/mtmfunded`
  const sorteioUrl = `${site}/sorteio`
  const logo = d.logoSrc ?? 'cid:mtm-logo'
  const nome = (d.nome || (pt ? 'Trader' : 'Trader')).trim()
  const expira = dataCurta(d.expiraEm, d.idioma, false)
  const r = d.regras
  const saldo = num(d.saldo, d.idioma)
  const fim = d.sorteios[0]?.acabaEm ? dataCurta(d.sorteios[0].acabaEm, d.idioma) : null

  const assunto = pt ? 'Um presente para ti: a tua conta MTM Funded de 10K' : 'A gift for you: your 10K MTM Funded account'
  const preheader = pt
    ? 'Obrigado por fazeres parte do crescimento da MoreThanMoney. A tua conta já está ativa.'
    : 'Thank you for being part of MoreThanMoney’s growth. Your account is already active.'

  const T = pt ? {
    ola: `Obrigado, ${esc(nome)}.`,
    p1: 'Quando comecei a MoreThanMoney, o objetivo era construir uma comunidade onde se aprende trading a sério — com método, sem atalhos e sem promessas. Uma parte enorme do que ela é hoje foste tu: cada sessão em que estiveste, cada pergunta que fizeste, cada vez que falaste de nós a alguém.',
    p2: 'Este mês demos um passo grande: a MoreThanMoney tem agora o seu <b>próprio sistema de avaliação de traders, o MTM Funded</b>, e o seu <b>próprio WebTrader</b>. Não queria abrir isto ao mundo sem agradecer primeiro a quem nos trouxe até aqui.',
    presenteT: 'O teu presente',
    presente: `Um <b>Desafio MTM Funded 10K · 2 fases</b>, criado em teu nome e já ativo. Sem custo, sem cartão, sem letras pequenas.`,
    login: 'Login', servidor: 'Servidor', tipo: 'Tipo de conta', tipoV: 'F1 · Fase 1 de 2', saldoL: 'Saldo simulado',
    regrasT: 'Como funciona',
    regrasP: 'É uma <b>conta de avaliação simulada</b>: negoceias com saldo virtual, <b>não há dinheiro real depositado nem em risco</b>. As regras são as de qualquer desafio deste programa:',
    rObj: `Objetivo de lucro: <b>${num(r.objetivo_pct, 'pt')}%</b> na fase 1 e <b>${num(r.objetivo_fase2_pct, 'pt')}%</b> na fase 2`,
    rDia: `Perda diária máxima: <b>${num(r.perda_diaria_pct, 'pt')}%</b>`,
    rMax: `Perda máxima total: <b>${num(r.perda_maxima_pct, 'pt')}%</b>`,
    rDias: `Mínimo de <b>${num(r.dias_minimos, 'pt')}</b> dias de negociação`,
    rRisco: `Risco máximo por operação: <b>${num(r.risco_max_pct, 'pt')}%</b>`,
    regrasFim: `Se uma regra for quebrada, a conta termina — tal e qual um desafio comprado. As regras completas estão em <a href="${regrasUrl}" style="color:#f6c85a">morethanmoney.pt/mtmfunded</a>.`,
    comecarT: 'Como começar',
    passo1: 'Toca em <b>Ver credenciais</b> e entra com a tua conta MTM (o email onde recebeste esta mensagem). A password da conta aparece uma vez, só para ti.',
    passo2: `Abre o <b>WebTrader</b> em <a href="${webtrader}" style="color:#f6c85a">morethanmoney.pt/webtrader</a> — a conta aparece no seletor de contas, com as tuas métricas.`,
    passo3: 'Negoceia com calma. O objetivo é mostrar consistência, não pressa.',
    seguranca: `Por segurança, a password nunca vai por email. O link é só teu, vale 14 dias (até <b>${esc(expira)}</b>) e abre uma única vez; se expirar ou já o tiveres usado, pedes outro no WebTrader → A minha conta → Credenciais.`,
    btn1: 'Ver credenciais', btn2: 'Abrir o WebTrader',
    partilhaT: 'Partilha isto',
    partilha: 'Se este presente te fez sentido, conta a quem te segue. Publica nos stories ou no feed, identifica <a href="' + IG + '" style="color:#f6c85a">@morethanmoney.pt</a> e mostra o teu WebTrader. <b>Há outra surpresa a caminho para quem partilhar</b> — por isso partilha o mais que puderes.',
    sorteiosT: 'Os passatempos que estão a decorrer',
    sorteiosP: `${fim ? `Até <b>${esc(fim)}</b> há` : 'Há'} três sorteios de lançamento no Instagram, gratuitos e sem compra de nada. Em jogo: ${esc(d.premios.join(' · '))}. Podes entrar em todos:`,
    nomes: { 'lancamento-porta-larga': 'Porta larga', 'lancamento-porta-estreita': 'Porta estreita', 'lancamento-amplificacao': 'Amplificação' } as Record<string, string>,
    verPost: 'Ver o post', paginaSorteio: `Todos os detalhes em <a href="${sorteioUrl}" style="color:#f6c85a">morethanmoney.pt/sorteio</a>.`,
    assinatura: 'Com gratidão,<br/><b>Ricardo Garcia</b><br/>MoreThanMoney',
    aviso: 'Conta simulada educativa: a negociação não é real e não envolve dinheiro real. Trading envolve risco de perda; resultados passados, incluindo numa conta simulada, não garantem resultados futuros. Nada neste email é aconselhamento financeiro. Os passatempos não são patrocinados, apoiados nem associados ao Instagram. A MoreThanMoney nunca te pede passwords por email, telefone ou mensagem.',
    rodape: 'Recebes este email por teres conta na MoreThanMoney.',
    cancelar: 'Cancelar subscrição',
  } : {
    ola: `Thank you, ${esc(nome)}.`,
    p1: 'When I started MoreThanMoney, the goal was to build a community where people learn trading properly — with method, no shortcuts and no promises. A huge part of what it is today is you: every session you joined, every question you asked, every time you told someone about us.',
    p2: 'This month we took a big step: MoreThanMoney now has its <b>own trader evaluation system, MTM Funded</b>, and its <b>own WebTrader</b>. I didn’t want to open it to the world without first thanking the people who brought us here.',
    presenteT: 'Your gift',
    presente: 'A <b>10K MTM Funded Challenge · 2 phases</b>, created in your name and already active. No cost, no card, no fine print.',
    login: 'Login', servidor: 'Server', tipo: 'Account type', tipoV: 'F1 · Phase 1 of 2', saldoL: 'Simulated balance',
    regrasT: 'How it works',
    regrasP: 'This is a <b>simulated evaluation account</b>: you trade a virtual balance, <b>no real money is deposited or at risk</b>. The rules are the same as any challenge in this program:',
    rObj: `Profit target: <b>${num(r.objetivo_pct, 'en')}%</b> in phase 1 and <b>${num(r.objetivo_fase2_pct, 'en')}%</b> in phase 2`,
    rDia: `Maximum daily loss: <b>${num(r.perda_diaria_pct, 'en')}%</b>`,
    rMax: `Maximum overall loss: <b>${num(r.perda_maxima_pct, 'en')}%</b>`,
    rDias: `At least <b>${num(r.dias_minimos, 'en')}</b> trading days`,
    rRisco: `Maximum risk per trade: <b>${num(r.risco_max_pct, 'en')}%</b>`,
    regrasFim: `If a rule is broken, the account ends — exactly like a purchased challenge. Full rules at <a href="${regrasUrl}" style="color:#f6c85a">morethanmoney.pt/mtmfunded</a>.`,
    comecarT: 'How to start',
    passo1: 'Tap <b>View credentials</b> and sign in with your MTM account (the email this message was sent to). The account password is shown once, only to you.',
    passo2: `Open the <b>WebTrader</b> at <a href="${webtrader}" style="color:#f6c85a">morethanmoney.pt/webtrader</a> — the account shows up in the account switcher, with your own metrics.`,
    passo3: 'Take your time. The goal is to show consistency, not speed.',
    seguranca: `For your security, the password is never sent by email. The link is yours only, valid for 14 days (until <b>${esc(expira)}</b>) and opens a single time; if it expires or you have already used it, request a new one in WebTrader → My account → Credentials.`,
    btn1: 'View credentials', btn2: 'Open the WebTrader',
    partilhaT: 'Share it',
    partilha: 'If this gift means something to you, tell the people who follow you. Post it in your stories or feed, tag <a href="' + IG + '" style="color:#f6c85a">@morethanmoney.pt</a> and show your WebTrader. <b>Another surprise is on its way for those who share</b> — so share as much as you can.',
    sorteiosT: 'Giveaways running right now',
    sorteiosP: `${fim ? `Until <b>${esc(fim)}</b> there are` : 'There are'} three launch giveaways on Instagram, free and with no purchase required. Prizes: ${esc(d.premios.join(' · '))}. You can enter all of them:`,
    nomes: { 'lancamento-porta-larga': 'Wide door', 'lancamento-porta-estreita': 'Narrow door', 'lancamento-amplificacao': 'Amplification' } as Record<string, string>,
    verPost: 'See the post', paginaSorteio: `All the details (in Portuguese) at <a href="${sorteioUrl}" style="color:#f6c85a">morethanmoney.pt/sorteio</a>.`,
    assinatura: 'With gratitude,<br/><b>Ricardo Garcia</b><br/>MoreThanMoney',
    aviso: 'Educational simulated account: trading is not real and involves no real money. Trading involves risk of loss; past results, including on a simulated account, do not guarantee future results. Nothing in this email is financial advice. The giveaways are not sponsored, endorsed or administered by, or associated with, Instagram. MoreThanMoney will never ask for your passwords by email, phone or message.',
    rodape: 'You are receiving this email because you have a MoreThanMoney account.',
    cancelar: 'Unsubscribe',
  }

  const linha = (rot: string, val: string) =>
    `<tr><td style="padding:9px 0;color:#a9a9b8;border-top:1px solid #26263a;font-size:14px">${rot}</td><td style="padding:9px 0;text-align:right;font-weight:700;color:#ffffff;border-top:1px solid #26263a;font-family:'Courier New',monospace;font-size:14px">${esc(val)}</td></tr>`
  const titulo = (t: string) => `<h2 style="margin:0 0 10px;font-size:16px;color:#f6c85a">${t}</h2>`
  const par = (t: string, cor = '#e9e9ee') => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${cor}">${t}</p>`
  const sep = '<div style="height:1px;background:#26263a;margin:22px 0"></div>'
  const botao = (t: string, href: string, principal: boolean) => principal
    ? `<a href="${href}" style="display:inline-block;background:#f6c85a;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px;margin:4px">${t}</a>`
    : `<a href="${href}" style="display:inline-block;background:transparent;border:1px solid #f6c85a;color:#f6c85a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;margin:4px">${t}</a>`

  const sorteiosHtml = d.sorteios.map((s) => `
    <div style="padding:14px 16px;margin:0 0 10px;background:#101018;border:1px solid #26263a;border-radius:12px">
      <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#ffffff">${esc(T.nomes[s.slug] ?? s.slug)} · <span style="color:#f6c85a">${esc(s.palavra)}</span></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#c9c9d6">${comoEntrar(s, d.idioma)}</p>
      <a href="${esc(s.permalink ?? IG)}" style="font-size:13px;color:#f6c85a;font-weight:600">${T.verPost} →</a>
    </div>`).join('')

  const inner = `
    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#f6c85a">${T.ola}</h1>
    ${par(T.p1)}
    ${par(T.p2)}
    <div style="margin:22px 0;padding:20px;background:linear-gradient(135deg,#1d1a10,#15151d);border:1px solid #6b5520;border-radius:14px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f6c85a">🎁 ${T.presenteT}</p>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#ffffff">${T.presente}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse">
        ${linha(T.login, d.login)}
        ${linha(T.servidor, d.servidor)}
        ${linha(T.tipo, T.tipoV)}
        ${linha(T.saldoL, `${saldo} USD`)}
      </table>
    </div>
    ${titulo(T.regrasT)}
    ${par(T.regrasP)}
    <ul style="margin:0 0 14px;padding-left:18px;font-size:14px;line-height:1.8;color:#d5d5df">
      <li>${T.rObj}</li><li>${T.rDia}</li><li>${T.rMax}</li><li>${T.rDias}</li><li>${T.rRisco}</li>
    </ul>
    ${par(T.regrasFim, '#c9c9d6')}
    ${sep}
    ${titulo(T.comecarT)}
    <ol style="margin:0 0 14px;padding-left:18px;font-size:14px;line-height:1.8;color:#d5d5df">
      <li>${T.passo1}</li><li>${T.passo2}</li><li>${T.passo3}</li>
    </ol>
    <div style="text-align:center;margin:20px 0 10px">
      ${botao(T.btn1, d.urlLink, true)}
      ${botao(T.btn2, webtrader, false)}
    </div>
    <p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:#8a8a98">🔐 ${T.seguranca}</p>
    ${sep}
    ${titulo(`📣 ${T.partilhaT}`)}
    ${par(T.partilha)}
    ${sep}
    ${titulo(`🎟️ ${T.sorteiosT}`)}
    ${par(T.sorteiosP, '#c9c9d6')}
    ${sorteiosHtml}
    <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#a9a9b8">${T.paginaSorteio}</p>
    ${sep}
    <p style="margin:0;font-size:15px;line-height:1.6;color:#e9e9ee">${T.assinatura}</p>
    <p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#7a7a88">⚠️ ${T.aviso}</p>`

  const html = `<!doctype html><html lang="${pt ? 'pt-PT' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
  <body style="margin:0;background:#0b0b0f;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9e9ee">
  <div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
  <div style="max-width:580px;margin:0 auto;padding:28px 18px">
    <div style="text-align:center;margin-bottom:18px">
      <img src="${logo}" alt="MoreThanMoney" width="110" style="max-width:110px;height:auto"/>
    </div>
    <div style="background:#15151d;border:1px solid #26263a;border-radius:16px;padding:28px 22px">
      ${inner}
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;line-height:1.6;color:#6a6a78">
      ${T.rodape}<br/>
      <a href="mailto:morethanmoneypt@gmail.com?subject=${pt ? 'Cancelar%20emails' : 'Unsubscribe'}" style="color:#8a8a9a">${T.cancelar}</a> · <a href="${site}" style="color:#8a8a9a">morethanmoney.pt</a>
    </p>
  </div></body></html>`

  const t = (h: string) => tirarTags(h).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const texto = [
    t(T.ola), '', t(T.p1), '', t(T.p2), '',
    `== ${T.presenteT} ==`, t(T.presente),
    `${T.login}: ${d.login}`, `${T.servidor}: ${d.servidor}`, `${T.tipo}: ${T.tipoV}`, `${T.saldoL}: ${saldo} USD`, '',
    `== ${T.regrasT} ==`, t(T.regrasP), `- ${t(T.rObj)}`, `- ${t(T.rDia)}`, `- ${t(T.rMax)}`, `- ${t(T.rDias)}`, `- ${t(T.rRisco)}`, t(T.regrasFim), '',
    `== ${T.comecarT} ==`, `1. ${t(T.passo1)}`, `2. ${t(T.passo2)}`, `3. ${t(T.passo3)}`, '',
    `${T.btn1}: ${d.urlLink}`, `${T.btn2}: ${webtrader}`, t(T.seguranca), '',
    `== ${T.partilhaT} ==`, t(T.partilha), `Instagram: ${IG}`, '',
    `== ${T.sorteiosT} ==`, t(T.sorteiosP),
    ...d.sorteios.flatMap((s) => [`* ${T.nomes[s.slug] ?? s.slug} (${s.palavra}): ${t(comoEntrar(s, d.idioma))}`, `  ${s.permalink ?? IG}`]),
    t(T.paginaSorteio), '',
    t(T.assinatura.replace(/<br\/>/g, '\n')), '',
    t(T.aviso), '',
    `${T.rodape} ${T.cancelar}: ${pt ? 'responde a este email com "Cancelar".' : 'reply to this email with "Unsubscribe".'}`,
  ].join('\n')

  return { assunto, html, texto }
}
