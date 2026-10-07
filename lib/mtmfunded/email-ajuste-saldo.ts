import { mtmEmailShell } from '@/lib/activation-emails'
import { getSiteUrl } from '@/lib/mail-transport'

/**
 * EMAIL DE SERVIÇO: «o saldo da tua conta mudou» — valor, referência, observação e saldo novo.
 *
 * Sai SÓ quando o dono carrega no botão (caixa «Enviar email ao cliente» no ajuste, ou «Enviar
 * email» numa linha do histórico). Nenhum ajuste manda email sozinho. Puro (o teste chama-o):
 * o envio vive em `enviarEmailDoAjuste`, em ./admin-conta-accoes.
 *
 * É email de serviço sobre uma conta que a pessoa tem — não campanha, não depende de consentimento
 * de marketing. Sem passwords, como sempre.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const usd = (v: number) => `${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`

export interface DadosEmailAjuste {
  nome: string | null
  login: string
  delta: number
  referencia: string
  observacao: string | null
  saldoNovo: number
  em: Date
}

export function construirEmailAjuste(d: DadosEmailAjuste): { subject: string; html: string; text: string } {
  const primeiro = String(d.nome ?? '').trim().split(/\s+/)[0] || 'Trader'
  const credito = d.delta > 0
  const valor = `${credito ? '+' : '−'}${usd(Math.abs(d.delta))}`
  const quando = d.em.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'long', timeStyle: 'short' })
  const titulo = credito ? `Crédito na tua conta ${d.login}` : `Movimento na tua conta ${d.login}`
  const linha = (rotulo: string, valorHtml: string) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #2a2a38;font-size:13px;color:#8a8a9a">${rotulo}</td>
        <td style="padding:9px 0;border-bottom:1px solid #2a2a38;font-size:14px;color:#e9e9ee;text-align:right">${valorHtml}</td>
      </tr>`
  const inner = `
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${esc(titulo)}</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7">Olá ${esc(primeiro)}, o saldo da tua conta MTM Funded <b>${esc(d.login)}</b> foi actualizado. Fica aqui o registo, para guardares.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      ${linha('Valor', `<b style="color:${credito ? '#E9C46A' : '#e9e9ee'}">${esc(valor)}</b>`)}
      ${linha('Referência', `<span style="font-family:Menlo,Consolas,monospace">${esc(d.referencia)}</span>`)}
      ${d.observacao ? linha('Observação', esc(d.observacao)) : ''}
      ${linha('Saldo novo', `<b>${esc(usd(d.saldoNovo))}</b>`)}
      ${linha('Data', esc(quando))}
    </table>
    <div style="text-align:center;margin:22px 0 6px">
      <a href="${getSiteUrl()}/mtmfunded/tradingtournament/dashboard" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:12px 26px;border-radius:10px">Abrir a minha conta</a>
    </div>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.7;color:#a9a9b8">Se alguma coisa não bater certo, responde a este email com a referência acima.</p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney · MTM Funded</span></p>`
  const text = [
    `${titulo}`,
    '',
    `Olá ${primeiro}, o saldo da tua conta MTM Funded ${d.login} foi actualizado.`,
    `Valor: ${valor}`,
    `Referência: ${d.referencia}`,
    ...(d.observacao ? [`Observação: ${d.observacao}`] : []),
    `Saldo novo: ${usd(d.saldoNovo)}`,
    `Data: ${quando}`,
    '',
    'Se alguma coisa não bater certo, responde a este email com a referência.',
    'Ricardo Garcia · MoreThanMoney',
  ].join('\n')
  return { subject: `${titulo} · ${d.referencia}`, html: mtmEmailShell(inner), text }
}
