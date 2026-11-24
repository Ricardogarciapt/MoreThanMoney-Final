/**
 * ENVIO DOS EXTRATOS MENSAIS das contas MTM Funded.
 *
 * Quem recebe: contas `financiada`, motor `sim`, estado `ativa` e sem `quebrada_em`. As contas
 * reais (`real`) NÃO entram aqui; entram quando o dono o decidir (ver `ROTULO_TIPO`).
 *
 * Três guardas, por esta ordem:
 *  1. Dry-run por omissão. Só envia com `MTM_STATEMENTS_ENVIO=1` no ambiente. Até o dono aprovar
 *     o template, o cron calcula e regista na resposta, mas não manda nada e não grava nada.
 *  2. Conciliação. Se o saldo reconstruído dos movimentos não bate com `sim_saldo`, o extrato
 *     NÃO sai: fica `por_conciliar` e aparece na resposta do cron para se olhar.
 *  3. Idempotência. Uma conta, um mês: se já há `enviado` na tabela, não se volta a mandar.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'
import { montarExtratoEmail, type DadosExtrato, type PeriodoExtrato } from './extrato-mensal'

export type EstadoExtrato = 'enviado' | 'falhou' | 'por_conciliar' | 'sem_email' | 'simulado'

export interface ResultadoExtrato {
  conta_id: string
  etiqueta: string | null
  estado: EstadoExtrato
  destinatario?: string
  assunto?: string
  erro?: string
  diferenca?: number
}

export interface ResumoExtratos {
  periodo: string
  modo: 'envio' | 'simulacao'
  contas: number
  enviados: number
  simulados: number
  por_conciliar: number
  sem_email: number
  falhou: number
  ja_enviados: number
  resultados: ResultadoExtrato[]
}

/** Mês anterior ao de `agora`, em UTC. Quem corre a 1 de novembro trata de outubro. */
export function mesAnterior(agora: Date): PeriodoExtrato {
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1))
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}

export function chavePeriodo(p: PeriodoExtrato): string {
  return `${p.ano}-${String(p.mes).padStart(2, '0')}`
}

export function envioAtivo(): boolean {
  return (process.env.MTM_STATEMENTS_ENVIO ?? '').trim() === '1'
}

/** Corre o mês `periodo` para todas as contas elegíveis. Nunca lança por uma conta: regista e segue. */
export async function correrExtratosMensais(periodo: PeriodoExtrato, opts: { enviar?: boolean } = {}): Promise<ResumoExtratos> {
  const enviar = opts.enviar ?? envioAtivo()
  const db = getSupabaseAdmin()
  const chave = chavePeriodo(periodo)
  const ini = new Date(Date.UTC(periodo.ano, periodo.mes - 1, 1)).toISOString()
  const fim = new Date(Date.UTC(periodo.ano, periodo.mes, 1)).toISOString()

  const { data: contas, error } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, etiqueta')
    .eq('motor', 'sim')
    .eq('tipo', 'financiada')
    .eq('estado', 'ativa')
    .is('quebrada_em', null)
  if (error) throw new Error(`contas: ${error.message}`)

  const { data: ja } = await db
    .from('mtm_funded_extratos_envios')
    .select('account_id')
    .eq('periodo', chave)
    .eq('estado', 'enviado')
  const jaEnviados = new Set((ja ?? []).map((r: { account_id: string }) => r.account_id))

  const resumo: ResumoExtratos = {
    periodo: chave,
    modo: enviar ? 'envio' : 'simulacao',
    contas: contas?.length ?? 0,
    enviados: 0,
    simulados: 0,
    por_conciliar: 0,
    sem_email: 0,
    falhou: 0,
    ja_enviados: 0,
    resultados: [],
  }

  for (const conta of contas ?? []) {
    const id = conta.id as string
    const etiqueta = (conta.etiqueta as string | null) ?? null

    if (jaEnviados.has(id)) {
      resumo.ja_enviados++
      continue
    }

    try {
      const { data: dados, error: errExtrato } = await db.rpc('mtm_funded_extrato', { p_account: id, p_ini: ini, p_fim: fim })
      if (errExtrato || !dados) throw new Error(errExtrato?.message ?? 'extrato vazio')
      const d = dados as DadosExtrato

      if (!d.conciliado) {
        resumo.por_conciliar++
        resumo.resultados.push({ conta_id: id, etiqueta, estado: 'por_conciliar', diferenca: d.diferenca_conciliacao })
        await registar(db, id, chave, 'por_conciliar', null, null, `diferença ${d.diferenca_conciliacao} $`)
        continue
      }

      const { data: userData } = await db.auth.admin.getUserById(conta.user_id as string)
      const destinatario = userData?.user?.email ?? null
      if (!destinatario) {
        resumo.sem_email++
        resumo.resultados.push({ conta_id: id, etiqueta, estado: 'sem_email' })
        await registar(db, id, chave, 'sem_email', null, null, null)
        continue
      }

      const { assunto, html } = montarExtratoEmail(d, periodo, { site: getSiteUrl(), logo: getEmailLogoSrc() })

      if (!enviar) {
        resumo.simulados++
        resumo.resultados.push({ conta_id: id, etiqueta, estado: 'simulado', destinatario, assunto })
        continue
      }

      try {
        const transporter = createMailTransporter()
        await transporter.sendMail({
          from: mailFrom(),
          to: destinatario,
          subject: assunto,
          html: prepareBrandedEmailHtml(html),
          attachments: brandedMailAttachments(),
        })
        resumo.enviados++
        resumo.resultados.push({ conta_id: id, etiqueta, estado: 'enviado', destinatario, assunto })
        await registar(db, id, chave, 'enviado', destinatario, assunto, null)
      } catch (errEnvio) {
        const msg = errEnvio instanceof Error ? errEnvio.message : 'erro ao enviar'
        resumo.falhou++
        resumo.resultados.push({ conta_id: id, etiqueta, estado: 'falhou', destinatario, assunto, erro: msg })
        await registar(db, id, chave, 'falhou', destinatario, assunto, msg)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro'
      resumo.falhou++
      resumo.resultados.push({ conta_id: id, etiqueta, estado: 'falhou', erro: msg })
    }
  }

  return resumo
}

async function registar(
  db: ReturnType<typeof getSupabaseAdmin>,
  conta: string,
  periodo: string,
  estado: 'enviado' | 'falhou' | 'por_conciliar' | 'sem_email',
  destinatario: string | null,
  assunto: string | null,
  erro: string | null,
) {
  const { error } = await db.from('mtm_funded_extratos_envios').upsert(
    { account_id: conta, periodo, estado, destinatario, assunto, erro, enviado_em: new Date().toISOString() },
    { onConflict: 'account_id,periodo' },
  )
  if (error) console.error('[extrato-mensal] registo falhou:', error.message)
}
