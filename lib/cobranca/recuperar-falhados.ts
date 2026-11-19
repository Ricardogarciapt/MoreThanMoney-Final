import { getSiteUrl } from '@/lib/mail-transport'
import { mtmEmailShell } from '@/lib/activation-emails'
import { chaveDoAviso, jaAvisado } from '@/lib/cobranca/aviso-cartao-falhado'
import { PARAGRAFO_COPIA_PAUSADA_HTML, PARAGRAFO_COPIA_PAUSADA_TEXTO } from '@/lib/cobranca/suspender-copia-emails'

/**
 * RECUPERAÇÃO DE PAGAMENTOS FALHADOS — a parte que o webhook não cobre.
 *
 * O webhook `invoice.payment_failed` já avisa à 1.ª falha e no corte (aviso-cartao-falhado.ts) e o
 * `invoice.payment_succeeded` reabre o acesso quando a pessoa paga. Faltavam três coisas, que este
 * módulo decide (puro) e o cron `/api/cron/cobranca-recuperar` executa:
 *
 *  1. REDE DE SEGURANÇA. Se o webhook falhou, chegou antes do perfil existir ou não encontrou o
 *     cliente, a pessoa nunca soube. O cron lê as faturas abertas no Stripe e manda o aviso da 1.ª
 *     falha a quem ainda não o recebeu (a mesma chave do webhook: nunca sai duas vezes).
 *  2. DEPOIS DE O STRIPE DESISTIR. Esgotadas as tentativas, a subscrição cai e a fatura fica aberta
 *     para sempre. Antes de 10/11 ninguém foi avisado (6 faturas, 285 €). Sai UM email, com o link
 *     para reativar (/upgrade), e não se volta a escrever sobre isso.
 *  3. O RESULTADO. Quanto está em curso, quanto se perdeu e quanto se recuperou este mês — é só isto
 *     que sobe ao Ricardo, na vista «Hoje» do Telegram.
 *
 * Não cancela nada, não corta acessos e não anula faturas: o corte continua a ser o do webhook
 * (3 falhas), que já estava ligado.
 */

export type MomentoRecuperacao = 'primeira' | 'reativar'

export interface FaturaAberta {
  id: string
  cliente: string
  email: string | null
  nome: string | null
  valorCents: number
  moeda: string
  /** `next_payment_attempt` do Stripe em ms; `null` quando o Stripe já desistiu. */
  proximaTentativaMs: number | null
  /** Quando a fatura falhou pela 1.ª vez (`effective_at`/`created`), em ms. */
  falhouEmMs: number
  link: string | null
}

/** Quantos dias depois da 1.ª falha ainda faz sentido convidar a reativar. */
export const JANELA_REATIVAR_DIAS = 45

export function estadoDaFatura(f: Pick<FaturaAberta, 'proximaTentativaMs'>): 'em_curso' | 'esgotada' {
  return f.proximaTentativaMs ? 'em_curso' : 'esgotada'
}

export function acaoParaFatura(
  f: FaturaAberta,
  marcas: unknown,
  agoraMs: number,
  opcoes: { reativar: boolean; janelaDias?: number } = { reativar: true },
): MomentoRecuperacao | null {
  if (!f.email || !(f.valorCents > 0)) return null
  if (estadoDaFatura(f) === 'em_curso') {
    // O webhook já avisou (primeira ou corte)? Então não se repete.
    if (jaAvisado(marcas, chaveDoAviso(f.id, 'primeira')) || jaAvisado(marcas, chaveDoAviso(f.id, 'corte'))) return null
    return 'primeira'
  }
  if (!opcoes.reativar) return null
  if (jaAvisado(marcas, `${f.id}:reativar`)) return null
  const janela = (opcoes.janelaDias ?? JANELA_REATIVAR_DIAS) * 864e5
  if (agoraMs - f.falhouEmMs > janela) return null
  return 'reativar'
}

export function chaveRecuperacao(faturaId: string, momento: MomentoRecuperacao): string {
  return momento === 'primeira' ? chaveDoAviso(faturaId, 'primeira') : `${faturaId}:reativar`
}

export interface ResumoRecuperacao {
  atualizadoEm: string
  emCurso: { quantas: number; cents: number }
  esgotadas: { quantas: number; cents: number }
  recuperadoMes: { quantas: number; cents: number }
  enviadosHoje: number
}

export function resumir(
  abertas: FaturaAberta[],
  recuperadasMesCents: number[],
  enviados: number,
  agoraMs: number,
): ResumoRecuperacao {
  const soma = (l: FaturaAberta[]) => ({ quantas: l.length, cents: l.reduce((s, f) => s + f.valorCents, 0) })
  return {
    atualizadoEm: new Date(agoraMs).toISOString(),
    emCurso: soma(abertas.filter((f) => estadoDaFatura(f) === 'em_curso')),
    esgotadas: soma(abertas.filter((f) => estadoDaFatura(f) === 'esgotada')),
    recuperadoMes: { quantas: recuperadasMesCents.length, cents: recuperadasMesCents.reduce((s, c) => s + c, 0) },
    enviadosHoje: enviados,
  }
}

const euros = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')}€`

/** Uma linha para a vista «Hoje»: só o resultado. `null` quando não há nada a dizer. */
export function linhaDoResumo(r: ResumoRecuperacao | null | undefined): string | null {
  if (!r) return null
  const partes: string[] = []
  if (r.recuperadoMes.quantas) partes.push(`${euros(r.recuperadoMes.cents)} recuperados este mês (${r.recuperadoMes.quantas})`)
  if (r.emCurso.quantas) partes.push(`${euros(r.emCurso.cents)} em recuperação (${r.emCurso.quantas})`)
  if (!partes.length) return null
  return partes.join(' · ')
}

/** Email depois de o Stripe desistir: um só, sem promessas, com a porta aberta. */
export function buildEmailReativar(i: { nome: string; valorCents?: number | null; copiaPausada?: boolean }): { subject: string; html: string; text: string } {
  const link = `${getSiteUrl()}/upgrade`
  const valor = i.valorCents && i.valorCents > 0 ? ` de ${euros(i.valorCents)}` : ''
  const inner = `
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#D2A63C">${i.nome}, a tua subscrição terminou</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">O banco recusou várias vezes o pagamento${valor} e a subscrição MoreThanMoney acabou por fechar. Pode ter sido um cartão expirado ou um bloqueio do banco, e não chegaste a saber.</p>
    ${i.copiaPausada ? PARAGRAFO_COPIA_PAUSADA_HTML : ''}
    <p style="margin:0 0 14px;font-size:15px;line-height:1.7">O teu histórico e as tuas ligações ficaram guardados. Se quiseres voltar, reativas aqui com um cartão válido:</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${link}" style="display:inline-block;background:#D2A63C;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">Reativar a subscrição</a>
    </div>
    <p style="margin:0 0 6px;font-size:14px;line-height:1.7;color:#a9a9b8">Se foi de propósito, não tens de fazer nada e não voltamos a escrever sobre isto. Se tiveres alguma dúvida, responde a este email.</p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Até já,<br/><b>Ricardo Garcia</b><br/><span style="color:#8a8a9a">MoreThanMoney</span></p>`
  return {
    subject: `${i.nome}, a tua subscrição MoreThanMoney terminou`,
    html: mtmEmailShell(inner),
    text: `${i.nome},

O banco recusou várias vezes o pagamento${valor} e a subscrição MoreThanMoney acabou por fechar.
${i.copiaPausada ? `\n${PARAGRAFO_COPIA_PAUSADA_TEXTO}\n` : ''}
O teu histórico e as tuas ligações ficaram guardados. Se quiseres voltar, reativas aqui:
${link}

Se foi de propósito, não tens de fazer nada e não voltamos a escrever sobre isto.

Até já,
Ricardo Garcia — MoreThanMoney`,
  }
}
