import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { proximoPassoPago, textoDoToque, AGENTE_DO_PASSO } from '@/lib/vendas/escada-followup'
import { TOQUES, toqueDevido } from '@/lib/vendas/cadencia-seguimento'

/**
 * FOLLOW-UP de reactivação de leads calados no funil do Telegram (bot próprio).
 *
 * ═══ O QUE MUDOU A 06/10 (F4, decisão do dono) ═════════════════════════════════════════════
 *
 * 1. O follow-up deixa de empurrar o teste grátis da app. Empurra o PRÓXIMO PASSO PAGO da escada
 *    que o lead ainda não deu — Membro 35€/mês, depois abrir conta PU Prime e depositar (que é o
 *    que desbloqueia o Premium). A decisão e os textos estão em `lib/vendas/escada-followup.ts`
 *    (puro, com guarda), e o `?ag=` é o do agente dono dessa oferta (AG-FORMACAO), já não o do teste da app.
 * 2. Continua a NÃO enviar: é iniciativa da máquina (o lead calou-se), por isso cada toque fica
 *    `pendente` em `aios_tasks` (kind `envio:telegram_followup`) e só sai por `aprovar_envio`
 *    (/admin/social/leads ou a API do agente) — ver `lib/envios-aprovacao.ts`.
 *
 * 16/11 (dono): QUATRO toques — no dia, +24 h, +48 h e +72 h — pela cadência única de
 * `lib/vendas/cadencia-seguimento.ts`. Depois do 4.º, só email com consentimento (executor do
 * pipeline). O `followup_count` só avança quando um toque aprovado sai.
 */
const MAX_TOUCHES = TOQUES

export async function runLeadFollowups(): Promise<{ ok: boolean; sent: number; rascunhos: number; scanned: number }> {
  const supabase = getSupabaseAdmin()
  const now = Date.now()

  // Leads ativos no funil, ainda sem o depósito validado, dentro do limite de toques.
  const { data: leads } = await supabase
    .from('telegram_leads')
    .select('chat_id, first_name, interest, stage, followup_count, updated_at, last_followup_at, broker_uid, granted_at, premium_group_granted_at, email')
    .in('stage', ['new', 'qualifying', 'routed'])
    .is('granted_at', null)
    .lt('followup_count', MAX_TOUCHES)
    .order('updated_at', { ascending: true })
    .limit(50)

  // Quem já é Membro: pelo email do lead, contra o perfil com subscrição activa.
  const emails = [...new Set((leads ?? []).map((l) => String(l.email ?? '').trim().toLowerCase()).filter(Boolean))]
  const membros = new Set<string>()
  if (emails.length) {
    const { data: perfis } = await supabase
      .from('profiles')
      .select('email, subscription_expires_at')
      .in('email', emails)
      .gt('subscription_expires_at', new Date().toISOString())
    for (const p of perfis ?? []) membros.add(String((p as { email: string }).email).trim().toLowerCase())
  }

  let rascunhos = 0
  const scanned = (leads ?? []).length
  const { criarEnvioPorAprovar } = await import('@/lib/envios-fila')
  const { KIND_ENVIO } = await import('@/lib/envios-aprovacao')

  for (const l of leads ?? []) {
    const fc = Number(l.followup_count || 0)
    // Toque 1: desde a última actividade do lead; os seguintes: desde o toque anterior.
    const desde = fc === 0 ? (l.updated_at as string | null) : ((l.last_followup_at as string | null) ?? null)
    const due = toqueDevido(fc + 1, desde, now)
    if (!due) continue

    const passo = proximoPassoPago({
      ehMembro: membros.has(String(l.email ?? '').trim().toLowerCase()),
      temContaCorretora: !!l.broker_uid,
      depositoValidado: !!l.granted_at || !!l.premium_group_granted_at,
    })
    if (!passo) continue

    const touch = fc + 1
    const nome = (l.first_name || '').split(' ')[0] || null
    // 10/11: a forma de sair vai em CADA toque — sem ela a passagem legal não deixa sair nada.
    const texto = `${textoDoToque(passo, touch, nome)}\n\nPara deixar de receber, escreve PARAR.`
    const codigo = AGENTE_DO_PASSO[passo]
    const r = await criarEnvioPorAprovar({
      kind: KIND_ENVIO.FOLLOWUP_TELEGRAM,
      chave: `tg-followup:${l.chat_id}:${touch}:${fc}`,
      titulo: `Follow-up Telegram · toque ${touch}/${MAX_TOUCHES} · ${passo} · ${nome ?? String(l.chat_id)}`,
      detalhes: `Lead calado (etapa ${l.stage ?? '?'}, interesse ${l.interest ?? '?'}). Próximo passo pago: ${passo}. Mensagem:\n\n${texto}`,
      payload: {
        chat_id: String(l.chat_id),
        texto,
        toque: touch,
        funil: 'telegram:followup',
        codigo,
        followup_count_na_criacao: fc,
      },
    })
    if (r.criado) rascunhos++
  }
  return { ok: true, sent: 0, rascunhos, scanned }
}
