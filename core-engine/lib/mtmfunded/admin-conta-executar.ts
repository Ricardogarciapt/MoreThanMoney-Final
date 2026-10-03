/**
 * UMA CONTA FUNDED, UMA ACÇÃO, UM CAMINHO — auditar, executar, fechar o registo.
 *
 * Isto era o corpo do POST de `app/api/admin/mtmfunded/conta/[id]`. Saiu de lá por uma razão
 * concreta: o bot de Telegram passou a poder decidir levantamentos (pedido do dono, 24/09), e a
 * alternativa era escrever no bot um segundo caminho com a sua própria auditoria e as suas
 * próprias guardas. Dois caminhos para mexer no mesmo dinheiro divergem no dia em que alguém
 * corrige um deles — e o que fica por corrigir é sempre o que ninguém está a olhar.
 *
 * A ordem não é negociável, e é a mesma dos dois lados:
 *
 *   1. A INTENÇÃO fica escrita ANTES de acontecer seja o que for, com a chave de idempotência.
 *      A mesma chave outra vez devolve o resultado da primeira — um duplo toque no telemóvel ou
 *      uma rede que repete o pedido não podem pagar duas vezes.
 *   2. A acção corre pelas mesmas funções do WebTrader/motor (admin-conta-accoes).
 *   3. O registo FECHA com o «depois» e o resultado. Passwords nunca lá entram.
 *
 * Sem a tabela da auditoria (migração 079) não se age. Uma acção de admin sem registo é uma
 * acção que ninguém consegue explicar depois.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { fotografia } from './admin-conta'
import type { PedidoAccao } from './admin-conta'
import { ErroAdmin, executarAccao } from './admin-conta-accoes'

export type ContaFunded = Record<string, unknown> & {
  id: string
  estado: string
  motor: string
  tipo: string
}

/** A conta, inteira, pela id. A mesma leitura no /admin e no bot. */
export async function lerContaFunded(id: string): Promise<ContaFunded | null> {
  const { data } = await getSupabaseAdmin().from('mtm_trading_accounts').select('*').eq('id', id).maybeSingle()
  return (data as ContaFunded | null) ?? null
}

export interface ResultadoExecucao {
  status: number
  /** O corpo que a rota devolve (e que o bot transforma em texto). Pode levar passwords. */
  resposta: Record<string, unknown>
  /** A chave já tinha sido usada: devolve-se o que a primeira vez fez, sem repetir nada. */
  repetido: boolean
}

/**
 * Executa uma acção de admin sobre uma conta Funded, com a auditoria à frente.
 *
 * `adminId`/`adminEmail` são a identidade de quem manda — verificada por quem chama, nunca aqui.
 * A rota tira-a da sessão; o bot tira-a do perfil do dono (ver `lib/telegram-admin-porta.ts`).
 */
export async function executarComAuditoria(p: {
  adminId: string
  adminEmail: string | null
  conta: ContaFunded
  pedido: PedidoAccao
  chave: string
}): Promise<ResultadoExecucao> {
  const db = getSupabaseAdmin()
  const { conta, pedido, chave } = p
  const id = conta.id

  // ── 1. a intenção na auditoria, com a chave (única) ──────────────────────
  const pedidoAuditado = Object.fromEntries(Object.entries(pedido).filter(([k]) => k !== 'confirmacao'))
  const { data: linha, error: erroAudit } = await db.from('mtm_funded_admin_audit').insert({
    account_id: id,
    admin_id: p.adminId,
    admin_email: p.adminEmail,
    accao: pedido.accao,
    motivo: 'motivo' in pedido ? pedido.motivo ?? null : null,
    pedido: pedidoAuditado,
    antes: fotografia(conta),
    chave_idempotencia: chave,
  }).select('id').single()

  if (erroAudit) {
    if (erroAudit.code === '23505') {
      const { data: anterior } = await db.from('mtm_funded_admin_audit')
        .select('account_id, accao, estado, resultado').eq('chave_idempotencia', chave).maybeSingle()
      if (!anterior || anterior.account_id !== id || anterior.accao !== pedido.accao) {
        return { status: 409, resposta: { error: 'chave de idempotência já usada noutra acção' }, repetido: false }
      }
      if (anterior.estado === 'em_curso') {
        return { status: 409, resposta: { error: 'esta acção ainda está a correr' }, repetido: false }
      }
      if (anterior.estado === 'falhou') {
        return {
          status: 409,
          resposta: { error: `já falhou antes: ${(anterior.resultado as { erro?: string } | null)?.erro ?? '—'} (abre a confirmação outra vez para repetir)` },
          repetido: false,
        }
      }
      // Regenerar credenciais não devolve as passwords da primeira vez: não foram guardadas.
      return { status: 200, resposta: { ok: true, repetido: true, resultado: anterior.resultado }, repetido: true }
    }
    // Sem auditoria não se age: uma acção de admin sem registo é uma acção que ninguém pode explicar.
    const falta = /42P01|PGRST205|mtm_funded_admin_audit/i.test(`${erroAudit.code} ${erroAudit.message}`)
    return {
      status: 503,
      resposta: { error: falta ? 'auditoria indisponível — aplica a migração 079 antes de gerir contas' : `auditoria falhou: ${erroAudit.message}` },
      repetido: false,
    }
  }

  // ── 2. a acção ───────────────────────────────────────────────────────────
  const agora = new Date().toISOString()
  let status = 200
  let resposta: Record<string, unknown>
  let paraAuditoria: Record<string, unknown>
  let estado: 'ok' | 'falhou' = 'ok'
  try {
    const r = await executarAccao({ db, adminId: p.adminId, adminEmail: p.adminEmail, conta, agora }, pedido)
    resposta = { ok: true, ...r.resposta }
    paraAuditoria = r.auditoria ?? r.resposta
  } catch (e) {
    estado = 'falhou'
    status = e instanceof ErroAdmin ? e.status : typeof (e as { status?: number }).status === 'number' ? (e as { status: number }).status : 500
    const erro = e instanceof Error ? e.message : String(e)
    if (status === 500) console.error('[admin/mtmfunded/conta]', pedido.accao, id, e)
    resposta = { error: erro }
    paraAuditoria = { erro }
  }

  // ── 3. o depois ──────────────────────────────────────────────────────────
  const depois = estado === 'ok' ? fotografia(await lerContaFunded(id)) : null
  const { error: erroFecho } = await db.from('mtm_funded_admin_audit').update({
    depois, resultado: paraAuditoria, estado, concluido_em: new Date().toISOString(),
  }).eq('id', linha.id)
  if (erroFecho) console.error('[admin/mtmfunded/conta] auditoria não fechou', linha.id, erroFecho.message)

  return { status, resposta, repetido: false }
}
