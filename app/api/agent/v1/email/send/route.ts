import { NextRequest } from 'next/server'
import { agentError, agentOk, requireAgentAccess } from '@/lib/agent-site-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { brandedMailAttachments, createMailTransporter, mailFrom, prepareBrandedEmailHtml } from '@/lib/mail-transport'
import { LIMITE_POR_CHAMADA, separarConhecidos, validarPedido } from '@/lib/agent-email-envio'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agent/v1/email/send — o endpoint que faltava ao bot.
 *
 * O bot tinha o rascunho pronto e não tinha por onde o disparar: esta API só tinha
 * definições, CMS e insights, e o `business` dizia expressamente «outreach_draft (rascunho,
 * NUNCA envia)». Esta é a primeira rota da API do agente que pode mesmo enviar — e é por isso que
 * traz os travões que essa fronteira exigia. As regras e o porquê de cada uma estão em
 * `lib/agent-email-envio.ts`, puras e presas por guardas.
 *
 * Em resumo: só para quem já existe em `profiles`, ENSAIO por omissão (é preciso `confirmar: true`),
 * e tecto de {@link LIMITE_POR_CHAMADA} por chamada.
 *
 * PEDIDO
 *   { to: string | string[], subject: string, html?: string, text?: string, confirmar?: boolean }
 *
 * RESPOSTA
 *   { ensaio, enviados[], falhados[], desconhecidos[], limite }
 *
 * `desconhecidos` são os endereços que não existem em `profiles`: vêm listados de propósito, para
 * o agente perceber que não foi engano dele e não repetir a chamada.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    return agentError('json_invalido', 400)
  }

  const validado = validarPedido(corpo as Record<string, unknown>)
  // O detalhe vai sempre embrulhado: `agentError` espera um objecto, e o detalhe tanto é uma
  // lista de endereços como um número. Quem lê a resposta precisa dele para não repetir a chamada.
  if ('erro' in validado) {
    return agentError(validado.erro, 400, validado.detalhe === undefined ? undefined : { detalhe: validado.detalhe })
  }

  const db = getSupabaseAdmin()
  const { data: perfis } = await db
    .from('profiles')
    .select('email')
    .in('email', validado.destinatarios)
  const { seguem, desconhecidos } = separarConhecidos(
    validado.destinatarios,
    (perfis ?? []).map((p) => String((p as { email?: string }).email ?? '')),
  )

  if (!seguem.length) {
    return agentError('nenhum_destinatario_conhecido', 422, { desconhecidos })
  }

  if (validado.ensaio) {
    return agentOk({
      ensaio: true,
      enviaria: seguem,
      desconhecidos,
      assunto: validado.assunto,
      limite: LIMITE_POR_CHAMADA,
      nota: 'Nada foi enviado. Repete com "confirmar": true para enviar mesmo.',
    })
  }

  const transporter = createMailTransporter()
  const enviados: string[] = []
  const falhados: Array<{ email: string; motivo: string }> = []

  for (const email of seguem) {
    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: email,
        subject: validado.assunto,
        ...(validado.html ? { html: prepareBrandedEmailHtml(validado.html) } : {}),
        ...(validado.texto ? { text: validado.texto } : {}),
        attachments: validado.html ? brandedMailAttachments() : undefined,
      })
      enviados.push(email)
    } catch (e) {
      // Um destinatário que falha não pára os outros — mas o motivo vai na resposta, senão o
      // agente conclui que correu tudo bem e nunca ninguém sabe que faltou um.
      falhados.push({ email, motivo: e instanceof Error ? e.message.slice(0, 160) : 'erro' })
    }
  }

  // Quem enviou, o quê e para quem — para se poder auditar depois. Uma falha a registar não pode
  // desfazer um envio que já aconteceu, por isso não derruba a resposta.
  try {
    await db.from('email_sends').insert(
      enviados.map((email) => ({
        email,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: { origem: 'agent_api', actor: auth.actor, keyId: auth.keyId, assunto: validado.assunto },
      })),
    )
  } catch { /* o registo é desejável, não é condição do envio */ }

  console.info(`[agent/email] ${auth.actor}: ${enviados.length} enviado(s), ${falhados.length} falha(s)`)
  return agentOk({ ensaio: false, enviados, falhados, desconhecidos, limite: LIMITE_POR_CHAMADA })
}
