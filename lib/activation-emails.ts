import { getEmailLogoSrc, getSiteUrl } from '@/lib/mail-transport'
import type { ActivationDecision } from '@/lib/member-activation'

/**
 * Emails da campanha de ativação de packs.
 *
 * Quatro variantes, uma por decisão tomada no painel de membros:
 *  - pay      → escolher pack e pagar (a conta fica à espera do pagamento)
 *  - free     → acesso oferecido, confirmação e enquadramento
 *  - partner  → acordo de parceiro
 *  - off      → aviso de inativação
 *
 * A escolha do pack é feita no email (cada pack é um botão que abre o checkout
 * Stripe já com o plano selecionado) — é aí que vive o upsell: o Premium e o
 * Fundador aparecem ao lado do Membro, com a diferença explicada numa linha.
 */

export type ActivationEmail = { subject: string; html: string; text: string }

export interface PackOption {
  planId: string
  nome: string
  preco: string
  linha: string
  destaque?: boolean
}

export const PACKS: PackOption[] = [
  {
    planId: 'app_member_monthly',
    nome: 'Membro',
    preco: '35€/mês',
    linha: 'App completa, sessões ao vivo, formação e comunidade.',
  },
  {
    planId: 'premium_monthly',
    nome: 'Premium',
    preco: '65€/mês',
    linha: 'Tudo do Membro + sinais Premium, scanners e Tap to Trade.',
    destaque: true,
  },
]

export function checkoutUrl(planId: string, email: string): string {
  const u = new URL('/upgrade', getSiteUrl())
  u.searchParams.set('plan', planId)
  u.searchParams.set('from', 'ativacao')
  u.searchParams.set('email', email)
  return u.toString()
}

export function mtmEmailShell(inner: string): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  return `<!doctype html><html lang="pt"><body style="margin:0;background:#08080b;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9e9ee">
  <div style="max-width:600px;margin:0 auto;padding:0 0 28px">
    <div style="height:4px;background:linear-gradient(90deg,#8a6a1e,#D2A63C,#f0d68a,#D2A63C,#8a6a1e)"></div>
    <div style="text-align:center;padding:26px 22px 18px">
      <img src="${logo}" alt="MoreThanMoney" width="130" style="max-width:130px;height:auto"/>
      <p style="margin:10px 0 0;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8a7a52">
        Formação · Sinais · Execução · Certificação
      </p>
    </div>
    <div style="margin:0 22px;background:#141419;border:1px solid #2a2a38;border-radius:16px;padding:26px 22px">
      ${inner}
    </div>
    <p style="margin:18px 22px 0;text-align:center;font-size:11px;line-height:1.7;color:#6a6a78">
      <b style="color:#8a8a9a">MoreThanMoney</b> · <a href="${site}" style="color:#D2A63C;text-decoration:none">morethanmoney.pt</a><br/>
      Dúvidas? Responde a este email — respondo eu.<br/>
      <span style="color:#4a4a58">O trading envolve risco. Resultados passados não garantem resultados futuros.</span>
    </p>
  </div></body></html>`
}


/** O que nos separa do resto do mercado — usado nos emails de pagamento e de inativação. */
export function vantagensBlock(): string {
  const linhas: [string, string][] = [
    ['Tap to Trade', 'Aceitas um sinal com um toque e ele abre na tua conta MT5 — com break-even, parciais e trailing geridos sozinhos. Não existe mais nada assim em português.'],
    ['Copy trading próprio', 'As nossas estratégias copiam direto para a tua conta, com o teu risco e os teus lotes. Infraestrutura nossa, não um serviço alugado.'],
    ['Scanners que construímos', 'Sensei, GoldKiller, Aurum Flow e MTM Scanner — indicadores próprios no TradingView, não versões repintadas de indicadores públicos.'],
    ['Sessões ao vivo e gravadas', 'Educadores em direto, com legendas traduzidas e as gravações organizadas em cursos para reveres quando quiseres.'],
    ['Certificação a sério', 'Emitimos certificados avaliados: Fast Start, Validação do Bootcamp (30 horas) e o Teste Final — Junior Trader. Com nota mínima e correção real, porque um certificado que toda a gente passa não vale nada.'],
    ['App própria', 'iOS e Android, feitas por nós. Não somos um grupo de Telegram com um site à frente.'],
  ]
  return linhas.map(([t, d]) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px">
      <tr>
        <td width="4" style="background:#D2A63C;border-radius:2px"></td>
        <td style="padding-left:12px">
          <div style="font-size:14px;font-weight:700;color:#D2A63C">${t}</div>
          <p style="margin:3px 0 0;font-size:13.5px;line-height:1.6;color:#b4b4c2">${d}</p>
        </td>
      </tr>
    </table>`).join('')
}

/** Cartões de pack — é aqui que o membro escolhe e paga. */
export function packBlock(email: string): string {
  const cards = PACKS.map((p) => {
    const cor = p.destaque ? '#D2A63C' : '#3a3a52'
    const fundo = p.destaque ? 'rgba(210,166,60,0.08)' : '#1b1b26'
    const botao = p.destaque
      ? 'background:#D2A63C;color:#0b0b0f'
      : 'background:transparent;color:#D2A63C;border:1px solid #D2A63C'
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px">
      <tr><td style="background:${fundo};border:1px solid ${cor};border-radius:12px;padding:16px 18px">
        <div style="font-size:16px;font-weight:700;color:#fff">${p.nome}
          <span style="float:right;color:#D2A63C;font-size:15px">${p.preco}</span></div>
        <div style="clear:both"></div>
        <p style="margin:6px 0 12px;font-size:13px;line-height:1.55;color:#a9a9b8">${p.linha}</p>
        <a href="${checkoutUrl(p.planId, email)}" style="display:inline-block;${botao};text-decoration:none;font-weight:700;font-size:14px;padding:10px 20px;border-radius:8px">Escolher ${p.nome}</a>
      </td></tr>
    </table>`
  }).join('')
  return `${cards}
    <p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:#6a6a78">Pagamento seguro por Stripe. Cancelas quando quiseres, sem fidelização.</p>`
}

const ASSINATURA = `<p style="margin:22px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>`

function payEmail(nome: string, email: string, bloqueado: boolean): ActivationEmail {
  const abertura = bloqueado
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7">A tua conta está aberta há algum tempo <b>sem pack ativo</b>. Vou ser direto, porque é assim que trabalhamos: para continuares a entrar, falta escolheres o teu pack e ativares o pagamento.</p>`
    : `<p style="margin:0 0 14px;font-size:15px;line-height:1.7">Vou ser direto: a tua assinatura precisa de ser <b>ativada</b> para não perderes o acesso. Escolhes o pack e ficas resolvido em dois minutos.</p>`

  const inner = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#D2A63C">${nome}, está na hora de ativares o teu lugar</h1>
    ${abertura}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Este último ano mudou a MoreThanMoney. Deixámos de ser um grupo de sinais e passámos a ser aquilo que praticamente não existe no mercado de língua portuguesa: <b>uma casa onde a formação, os sinais, a execução e a certificação vivem no mesmo sítio</b> — e todos construídos por nós.</p>
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    <h2 style="margin:0 0 14px;font-size:16px;color:#fff">O que tens aqui e não tens noutro lado</h2>
    ${vantagensBlock()}
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7">E há uma coisa que não negoceio: <b>transparência</b>. Mostramos os resultados como são, os bons e os maus, e tratamos cada membro e cada fundador com o respeito de quem confiou primeiro. É por isso que te peço isto de frente, em vez de te cortar o acesso sem uma palavra.</p>
    <h2 style="margin:0 0 12px;font-size:16px;color:#fff">Escolhe o teu pack</h2>
    ${packBlock(email)}
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#a9a9b8">Se preferires falar antes de decidires, responde a este email. Prefiro ter-te connosco com a escolha certa do que com a escolha rápida.</p>
    ${ASSINATURA}`

  const text = `${nome},

A tua conta está aberta sem pack ativo. Para continuares a entrar, falta escolheres o teu pack e ativares o pagamento.

Este último ano mudou a MoreThanMoney. Deixámos de ser um grupo de sinais e passámos a ser aquilo que praticamente não existe no mercado de língua portuguesa: uma casa onde a formação, os sinais, a execução e a certificação vivem no mesmo sítio — e todos construídos por nós.

O QUE TENS AQUI E NÃO TENS NOUTRO LADO
• Tap to Trade — aceitas um sinal com um toque e ele abre na tua conta MT5, com break-even, parciais e trailing geridos sozinhos.
• Copy trading próprio — as nossas estratégias copiam direto para a tua conta, com o teu risco e os teus lotes.
• Scanners que construímos — Sensei, GoldKiller, Aurum Flow e MTM Scanner, indicadores próprios no TradingView.
• Sessões ao vivo e gravadas — educadores em direto, com legendas traduzidas e gravações organizadas em cursos.
• Certificação a sério — Fast Start, Validação do Bootcamp (30 horas) e Teste Final — Junior Trader, com nota mínima e correção real.
• App própria — iOS e Android, feitas por nós.

E há uma coisa que não negoceio: transparência. Mostramos os resultados como são e tratamos cada membro e cada fundador com o respeito de quem confiou primeiro.

ESCOLHE O TEU PACK:
${PACKS.map((p) => `• ${p.nome} — ${p.preco}\n  ${p.linha}\n  ${checkoutUrl(p.planId, email)}`).join('\n')}

Pagamento seguro por Stripe. Cancelas quando quiseres.

Se preferires falar antes de decidir, responde a este email.

Até já,
Ricardo Garcia — MoreThanMoney
O trading envolve risco. Resultados passados não garantem resultados futuros.`

  return {
    subject: `${nome}, falta ativares o teu pack MoreThanMoney`,
    html: mtmEmailShell(inner),
    text,
  }
}

function freeEmail(nome: string, email: string): ActivationEmail {
  const inner = `
    <h1 style="margin:0 0 14px;font-size:21px;color:#D2A63C">${nome}, o teu acesso continua aberto</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65">Fizemos uma revisão a todas as contas da comunidade e a tua fica <b>ativa e oferecida</b>. Não tens nada a pagar nem nada a fazer.</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65">Faço-o por uma razão simples: contribuíste para isto crescer, e aqui isso conta. A MoreThanMoney vive de transparência — dizemos quem paga, quem não paga e porquê, e tratamos membros e fundadores com o respeito de quem esteve cá desde o início.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.65">Continua a usar tudo: app, sessões ao vivo, scanners e a comunidade.</p>
    <div style="text-align:center;margin:22px 0">
      <a href="${getSiteUrl()}/app-mobile" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Abrir a app</a>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.65;color:#a9a9b8">Se um dia quiseres subir de pack, é só dizeres — mas não é isso que te peço hoje.</p>
    ${ASSINATURA}`
  return {
    subject: `${nome}, o teu acesso MoreThanMoney continua aberto`,
    html: mtmEmailShell(inner),
    text: `${nome},

Revimos todas as contas da comunidade e a tua fica ativa e oferecida. Não tens nada a pagar nem nada a fazer.

Faço-o por uma razão simples: contribuíste para isto crescer, e aqui isso conta.

Continua a usar tudo: ${getSiteUrl()}/app-mobile

Até já,
Ricardo Garcia — MoreThanMoney`,
  }
}

function partnerEmail(nome: string, email: string): ActivationEmail {
  const inner = `
    <h1 style="margin:0 0 14px;font-size:21px;color:#D2A63C">${nome}, vamos formalizar a parceria</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65">A tua conta fica marcada como <b>parceiro</b>: acesso completo mantido, sem mensalidade.</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65">Faz sentido acertarmos o que cada lado traz para a mesa — o que partilhas, o que divulgas, o que operas connosco — e deixarmos isso escrito. Não é burocracia: é a mesma transparência que exijo aos números que publico.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.65">Responde a este email com a tua disponibilidade e marcamos 20 minutos.</p>
    ${ASSINATURA}`
  return {
    subject: `${nome}, a tua parceria com a MoreThanMoney`,
    html: mtmEmailShell(inner),
    text: `${nome},

A tua conta fica marcada como parceiro: acesso completo mantido, sem mensalidade.

Faz sentido acertarmos o que cada lado traz para a mesa e deixarmos isso escrito.

Responde com a tua disponibilidade e marcamos 20 minutos.

Ricardo Garcia — MoreThanMoney`,
  }
}

function offEmail(nome: string, email: string): ActivationEmail {
  const inner = `
    <h1 style="margin:0 0 14px;font-size:20px;color:#D2A63C">${nome}, a tua conta vai ser desativada</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.65">Revimos todas as contas da comunidade e a tua não tem pack ativo nem atividade recente, por isso vai ser desativada.</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Se foi engano, ou se queres voltar, resolve-se com um clique: escolhes o pack e a conta volta ao estado em que estava, com o teu histórico intacto.</p>
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    <h2 style="margin:0 0 14px;font-size:16px;color:#fff">O que ficas a perder</h2>
    ${vantagensBlock()}
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    ${packBlock(email)}
    ${ASSINATURA}`
  return {
    subject: `${nome}, a tua conta MoreThanMoney vai ser desativada`,
    html: mtmEmailShell(inner),
    text: `${nome},

A tua conta não tem pack ativo nem atividade recente, por isso vai ser desativada.

Se foi engano, ou se queres voltar, escolhe o pack e a conta volta ao estado em que estava:
${PACKS.map((p) => `• ${p.nome} — ${p.preco}: ${checkoutUrl(p.planId, email)}`).join('\n')}

Ricardo Garcia — MoreThanMoney`,
  }
}

export function buildActivationEmail(
  decision: ActivationDecision,
  nome: string,
  email: string,
  opts?: { bloqueado?: boolean },
): ActivationEmail {
  switch (decision) {
    case 'free':
      return freeEmail(nome, email)
    case 'partner':
      return partnerEmail(nome, email)
    case 'off':
      return offEmail(nome, email)
    case 'pay':
    default:
      return payEmail(nome, email, opts?.bloqueado !== false)
  }
}

/** Mini-funil WhatsApp — 3 toques, para quem tem número. */
export function whatsappFunnel(nome: string, email: string): { passo: number; quando: string; texto: string }[] {
  const link = checkoutUrl('premium_monthly', email)
  return [
    {
      passo: 1,
      quando: 'dia 0 — logo a seguir ao email',
      texto: `Olá ${nome}, é o Ricardo da MoreThanMoney 👋 Acabei de te enviar um email sobre a ativação da tua conta. Só para garantir que chegou — chegou?`,
    },
    {
      passo: 2,
      quando: 'dia 2 — se respondeu ou abriu',
      texto: `${nome}, sem rodeios: a tua conta está sem pack ativo. O Premium são 65€/mês e dá-te os sinais, os scanners e o Tap to Trade — que é o que a maioria usa mesmo. Queres que te deixe o link ou preferes começar pelo Membro a 35€?`,
    },
    {
      passo: 3,
      quando: 'dia 5 — último toque',
      texto: `${nome}, último toque da minha parte para não te andar a chatear. Se quiseres continuar connosco é por aqui: ${link} — se não for altura, diz só "agora não" e fico descansado. Bom trading 🤝`,
    },
  ]
}
