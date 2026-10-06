import { getSiteUrl } from '@/lib/mail-transport'
import { mtmEmailShell } from '@/lib/activation-emails'

/**
 * Aviso de cartão falhado — sai do webhook `invoice.payment_failed`.
 *
 * Até 06/10 o Stripe tentava cobrar 9 a 12 vezes em silêncio e cancelava: seis clientes perderam o
 * acesso sem nunca saberem que o banco tinha recusado. É email de SERVIÇO (sobre uma subscrição que
 * a pessoa tem), não campanha, por isso não depende de consentimento de marketing.
 *
 * Dois momentos, e só dois — mais do que isto é assédio:
 *  - `primeira` → a primeira falha da fatura: ainda tem acesso, basta actualizar o cartão.
 *  - `corte`    → a falha que fecha o acesso (a 3.ª): diz que fechou e como se reabre.
 * Cada (fatura, momento) sai uma vez; a marca fica em `profile_data.avisos_cartao`.
 */

export type MomentoAviso = 'primeira' | 'corte'

export function momentoDoAviso(i: {
  /** `invoice.attempt_count` do Stripe (1 na primeira tentativa). */
  tentativaFatura: number | null | undefined
  /** Falhas acumuladas no perfil, já contando esta. */
  falhasPerfil: number
  /** Limiar a partir do qual o webhook fecha o acesso. */
  limiarCorte: number
}): MomentoAviso | null {
  if (i.falhasPerfil >= i.limiarCorte) return 'corte'
  if ((i.tentativaFatura ?? 1) <= 1) return 'primeira'
  return null
}

export function chaveDoAviso(faturaId: string, momento: MomentoAviso): string {
  return `${faturaId}:${momento}`
}

export function jaAvisado(marcas: unknown, chave: string): boolean {
  return Array.isArray(marcas) && marcas.includes(chave)
}

/** Guarda só as 20 marcas mais recentes — chega para meses de faturas e não incha o perfil. */
export function juntarMarca(marcas: unknown, chave: string): string[] {
  const lista = Array.isArray(marcas) ? marcas.filter((m): m is string => typeof m === 'string') : []
  return [...lista.filter((m) => m !== chave), chave].slice(-20)
}

function valorLegivel(cents: number | null | undefined, moeda: string | null | undefined): string | null {
  if (cents == null || !(cents > 0)) return null
  const v = (cents / 100).toFixed(2).replace('.', ',')
  const m = (moeda || 'eur').toUpperCase() === 'EUR' ? '€' : ` ${(moeda || '').toUpperCase()}`
  return `${v}${m}`
}

export interface AvisoCartaoInput {
  nome: string
  momento: MomentoAviso
  valorCents?: number | null
  moeda?: string | null
  /** `invoice.hosted_invoice_url`: a página do Stripe onde se paga a fatura com outro cartão. */
  linkFatura?: string | null
}

export function buildAvisoCartaoFalhado(i: AvisoCartaoInput): { subject: string; html: string; text: string } {
  const site = getSiteUrl()
  const gerir = `${site}/member-area?tab=subscription`
  const link = i.linkFatura && /^https:\/\//.test(i.linkFatura) ? i.linkFatura : gerir
  const valor = valorLegivel(i.valorCents, i.moeda)
  const doValor = valor ? ` de <b>${valor}</b>` : ''
  const doValorTxt = valor ? ` de ${valor}` : ''

  if (i.momento === 'primeira') {
    const inner = `
      <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, o banco recusou o pagamento</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7">O pagamento${doValor} da tua subscrição MoreThanMoney não passou. Acontece muito: cartão expirado, limite, ou o banco a bloquear um débito online.</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7"><b>O teu acesso continua aberto.</b> Só tens de pagar a fatura com um cartão válido — demora um minuto.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${link}" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Atualizar o cartão e pagar</a>
      </div>
      <p style="margin:0 0 6px;font-size:14px;line-height:1.7;color:#a9a9b8">Se não fizeres nada, o Stripe volta a tentar nos próximos dias. Se continuar a falhar, o acesso fecha. Se queres cancelar, responde a este email e eu trato.</p>
      <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>`
    return {
      subject: `${i.nome}, o pagamento da tua subscrição não passou`,
      html: mtmEmailShell(inner),
      text: `${i.nome},

O pagamento${doValorTxt} da tua subscrição MoreThanMoney não passou (cartão expirado, limite, ou o banco a bloquear um débito online).

O teu acesso continua aberto. Paga a fatura com um cartão válido aqui:
${link}

Se não fizeres nada, o Stripe volta a tentar nos próximos dias; se continuar a falhar, o acesso fecha. Para cancelar, responde a este email.

Até já,
Ricardo Garcia — MoreThanMoney`,
    }
  }

  const inner = `
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, o teu acesso foi suspenso</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Tentámos várias vezes cobrar a subscrição${doValor} e o banco recusou sempre. Por isso o acesso à app, às sessões e aos sinais ficou suspenso.</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7"><b>Nada se perdeu:</b> histórico, ligações e progresso ficam guardados. Pagas a fatura com outro cartão e reabre.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Pagar e reabrir o acesso</a>
    </div>
    <p style="margin:0 0 6px;font-size:14px;line-height:1.7;color:#a9a9b8">Se foi de propósito e não queres continuar, não tens de fazer nada. Se houve algum problema, responde e falamos.</p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>`
  return {
    subject: `${i.nome}, o teu acesso MoreThanMoney foi suspenso`,
    html: mtmEmailShell(inner),
    text: `${i.nome},

Tentámos várias vezes cobrar a subscrição${doValorTxt} e o banco recusou sempre, por isso o acesso ficou suspenso.

Nada se perdeu. Paga a fatura com outro cartão e reabre:
${link}

Se foi de propósito, não tens de fazer nada. Se houve algum problema, responde e falamos.

Até já,
Ricardo Garcia — MoreThanMoney`,
  }
}
