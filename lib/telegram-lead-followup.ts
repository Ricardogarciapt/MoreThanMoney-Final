import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { proximoPassoPago, textoDoToque, AGENTE_DO_PASSO } from '@/lib/vendas/escada-followup'

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
 * Três toques (~6 h, +24 h, +48 h). O `followup_count` só avança quando um toque aprovado sai.
 */
const MAX_TOUCHES = 3

export async function runLeadFollowups(): Promise<{ ok: boolean; sent: number; rascunhos: number; scanned: number }> {
  const supabase = getSupabaseAdmin()
  const now = Date.now()
  const T1_MS = 6 * 3600 * 1000 // 6h de silêncio → toque 1
  const T2_MS = 24 * 3600 * 1000 // 24h após toque 1 → toque 2
  const T3_MS = 48 * 3600 * 1000 // 48h após toque 2 → toque 3

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
    const lastActivity = l.updated_at ? new Date(l.updated_at as string).getTime() : 0
    const lastFollow = l.last_followup_at ? new Date(l.last_followup_at as string).getTime() : 0
    let due = false
    if (fc === 0) due = now - lastActivity >= T1_MS
    else if (fc === 1) due = now - lastFollow >= T2_MS
    else if (fc === 2) due = now - lastFollow >= T3_MS
    if (!due) continue

    const passo = proximoPassoPago({
      ehMembro: membros.has(String(l.email ?? '').trim().toLowerCase()),
      temContaCorretora: !!l.broker_uid,
      depositoValidado: !!l.granted_at || !!l.premium_group_granted_at,
    })
    if (!passo) continue

    const touch = fc + 1
    const nome = (l.first_name || '').split(' ')[0] || null
    const texto = textoDoToque(passo, touch, nome)
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
