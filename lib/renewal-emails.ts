import { getSiteUrl } from '@/lib/mail-transport'
import { mtmEmailShell, packBlock, checkoutUrl } from '@/lib/activation-emails'

/**
 * Aviso de renovação — sai **2 dias antes** da subscrição terminar.
 *
 * Duas versões, porque o pedido é diferente:
 *  - `auto`   → vai renovar sozinha. O email é de transparência: diz o dia, diz o valor
 *               (quando o conhecemos pelo último pagamento) e diz onde se muda ou cancela.
 *               Ninguém deve ser surpreendido por um débito nosso.
 *  - `manual` → não renova sozinha. O email é de ação: expira no dia X, renova aqui.
 */

export type RenewalKind = 'auto' | 'manual'
export type RenewalEmail = { subject: string; html: string; text: string }

function dataPT(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
}

function planoLegivel(plan: string | null | undefined, ciclo: string | null | undefined): string {
  const p = plan === 'premium' ? 'Premium' : plan === 'app_member' ? 'Membro' : 'MoreThanMoney'
  const c = ciclo === 'annual' ? 'anual' : 'mensal'
  return `${p} ${c}`
}

function valorLegivel(cents: number | null | undefined, moeda: string | null | undefined): string | null {
  if (cents == null || !(cents > 0)) return null
  const v = (cents / 100).toFixed(2).replace('.', ',')
  const m = (moeda || 'eur').toUpperCase() === 'EUR' ? '€' : ` ${(moeda || '').toUpperCase()}`
  return `${v}${m}`
}

export interface RenewalInput {
  nome: string
  email: string
  expiraEm: string
  plan?: string | null
  ciclo?: string | null
  ultimoValorCents?: number | null
  moeda?: string | null
  /** Corrige um aviso anterior que dizia, por engano, que a subscrição renovava sozinha. */
  correcao?: boolean
}

export function buildRenewalEmail(kind: RenewalKind, i: RenewalInput): RenewalEmail {
  const site = getSiteUrl()
  const dia = dataPT(i.expiraEm)
  const plano = planoLegivel(i.plan, i.ciclo)
  const valor = valorLegivel(i.ultimoValorCents, i.moeda)
  const gerir = `${site}/member-area?tab=subscription`

  if (kind === 'auto') {
    const linhaValor = valor
      ? `<b>${valor}</b>, o mesmo do costume`
      : `o valor do teu plano atual`
    const inner = `
      <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, a tua subscrição renova a ${dia}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Aviso com dois dias de antecedência, para não haver surpresas: o teu <b>${plano}</b> renova automaticamente a <b>${dia}</b> e serão cobrados ${linhaValor}.</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Não tens de fazer nada — o acesso continua sem interrupção. Mando-te este email por uma razão simples: <b>não gosto de cobrar a ninguém sem avisar primeiro</b>.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${gerir}" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Gerir a minha subscrição</a>
      </div>
      <p style="margin:0 0 6px;font-size:14px;line-height:1.7;color:#a9a9b8">Aí podes mudar de pack, passar a anual (sai mais barato por mês) ou cancelar. Sem perguntas e sem fidelização.</p>
      <p style="margin:18px 0 0;font-size:14px;line-height:1.7">Obrigado por continuares connosco.</p>
      <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>`
    return {
      subject: `${i.nome}, a tua subscrição renova a ${dia}`,
      html: mtmEmailShell(inner),
      text: `${i.nome},

Aviso com dois dias de antecedência: o teu ${plano} renova automaticamente a ${dia}${valor ? ` e serão cobrados ${valor}` : ''}.

Não tens de fazer nada — o acesso continua sem interrupção. Mando este email porque não gosto de cobrar a ninguém sem avisar primeiro.

Mudar de pack, passar a anual ou cancelar: ${gerir}

Até já,
Ricardo Garcia — MoreThanMoney`,
    }
  }

  const correcao = i.correcao
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;padding:12px 14px;border-radius:10px;background:#1c1c26"><b>Correção:</b> no último email dissemos que a tua subscrição renovava sozinha. Não é o caso — não tens um pagamento automático associado, por isso <b>nada te foi nem vai ser cobrado</b> sem seres tu a renovar.</p>`
    : ''
  const correcaoTxt = i.correcao
    ? `Correção: no último email dissemos que a tua subscrição renovava sozinha. Não é o caso — não tens um pagamento automático associado, por isso nada te foi nem vai ser cobrado sem seres tu a renovar.\n\n`
    : ''
  const inner = `
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, o teu acesso termina a ${dia}</h1>
    ${correcao}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">Faltam poucos dias. O teu <b>${plano}</b> <b>não renova sozinho</b>, por isso a ${dia} o acesso à app, às sessões e aos sinais fecha.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.7">Renovas em dois minutos e fica tudo como está — histórico, ligações e progresso intactos.</p>
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    <h2 style="margin:0 0 12px;font-size:16px;color:#fff">Renovar ou mudar de pack</h2>
    ${packBlock(i.email)}
    <div style="height:1px;background:#2a2a38;margin:22px 0"></div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#a9a9b8">Se decidires não continuar, sem problema — responde a dizer e fico a saber porquê. Isso vale-me mais do que uma renovação forçada.</p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>`
  return {
    subject: i.correcao
      ? `Correção: o teu acesso MoreThanMoney termina a ${dia}`
      : `${i.nome}, o teu acesso MoreThanMoney termina a ${dia}`,
    html: mtmEmailShell(inner),
    text: `${i.nome},

${correcaoTxt}Faltam poucos dias. O teu ${plano} não renova sozinho, por isso a ${dia} o acesso à app, às sessões e aos sinais fecha.

Renovas em dois minutos e fica tudo como está:
${checkoutUrl('premium_monthly', i.email)}

Se decidires não continuar, responde a dizer porquê — vale-me mais do que uma renovação forçada.

Até já,
Ricardo Garcia — MoreThanMoney`,
  }
}
