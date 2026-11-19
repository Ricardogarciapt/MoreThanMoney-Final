import { getSiteUrl } from '@/lib/mail-transport'
import { mtmEmailShell } from '@/lib/activation-emails'
import { motivoHumano } from '@/lib/cobranca/suspender-copia-regras'

/** Parágrafo que entra nos emails de reativação quando a cópia da pessoa está em pausa. */
export const PARAGRAFO_COPIA_PAUSADA_HTML =
  '<p style="margin:0 0 14px;font-size:15px;line-height:1.7"><b>A tua cópia parou de copiar</b> por falta de pagamento: as ligações MTM Auto e MTM Funded estão em pausa. Assim que o pagamento entrar, voltam a ligar-se sozinhas, com as mesmas definições.</p>'
export const PARAGRAFO_COPIA_PAUSADA_TEXTO =
  'A tua cópia parou de copiar por falta de pagamento: as ligações MTM Auto e MTM Funded estão em pausa. Assim que o pagamento entrar, voltam a ligar-se sozinhas, com as mesmas definições.'

const botao = (link: string, texto: string) =>
  `<div style="text-align:center;margin:24px 0"><a href="${link}" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">${texto}</a></div>`

const assinatura =
  '<p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>'

export function buildEmailCopiaPausada(i: { nome: string; motivo: string }): { subject: string; html: string; text: string } {
  const link = `${getSiteUrl()}/upgrade`
  const porque = motivoHumano(i.motivo)
  const inner = `
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, a tua cópia está em pausa</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Como ${porque}, a tua cópia parou de copiar: as ligações MTM Auto e MTM Funded ficaram em pausa e o acesso à app e à área de membro fica suspenso até ao pagamento.</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Nada se perdeu. As tuas contas, definições e histórico ficaram guardados. Assim que pagares, tudo volta a ligar-se sozinho.</p>
    ${botao(link, 'Regularizar o pagamento')}
    <p style="margin:0 0 6px;font-size:14px;line-height:1.7;color:#a9a9b8">Se achas que é engano (já pagaste, ou mudaste de cartão), responde a este email e resolvemos.</p>
    <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#8a8a9a">Conteúdo educativo, não constitui consultoria financeira. Resultados passados não garantem resultados futuros.</p>
    ${assinatura}`
  return {
    subject: `${i.nome}, a tua cópia parou de copiar`,
    html: mtmEmailShell(inner),
    text: `${i.nome},

Como ${porque}, a tua cópia parou de copiar: as ligações MTM Auto e MTM Funded ficaram em pausa e o acesso à app e à área de membro fica suspenso até ao pagamento.

Nada se perdeu. Assim que pagares, tudo volta a ligar-se sozinho:
${link}

Se achas que é engano, responde a este email.

Até já,
Ricardo Garcia — MoreThanMoney`,
  }
}

export function buildEmailCopiaReligada(i: { nome: string }): { subject: string; html: string; text: string } {
  const link = `${getSiteUrl()}/app-mobile`
  const inner = `
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, a tua cópia voltou</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Obrigado, o pagamento entrou. As tuas ligações MTM Auto e MTM Funded voltaram a ligar-se com as mesmas definições de antes. As contas MT5 podem demorar alguns minutos a ficar online.</p>
    ${botao(link, 'Abrir a app')}
    ${assinatura}`
  return {
    subject: `${i.nome}, a tua cópia voltou a copiar`,
    html: mtmEmailShell(inner),
    text: `${i.nome},

Obrigado, o pagamento entrou. As tuas ligações MTM Auto e MTM Funded voltaram a ligar-se com as mesmas definições. As contas MT5 podem demorar alguns minutos a ficar online.

${link}

Até já,
Ricardo Garcia — MoreThanMoney`,
  }
}
