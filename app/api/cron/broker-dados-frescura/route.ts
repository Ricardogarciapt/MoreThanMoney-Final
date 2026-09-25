import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  DIAS_AVISO_FRESCURA,
  DIAS_LIMITE_FRESCURA,
  avaliarFrescura,
  leadsSemCorrespondencia,
} from '@/lib/broker/dados-corretora'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vigia dos DADOS da corretora — o alarme que faltava.
 *
 * O `broker-gate-renew` corre todos os dias e, quando os dados do broker têm mais de 40 dias,
 * passa toda a gente a "grace": não valida ninguém por mérito e não revoga ninguém. É o
 * comportamento certo — os exports da PU Prime são manuais e revogar à cega seria pior. O
 * problema é que ele o faz EM SILÊNCIO.
 *
 * A 2026-09-24 isso custou 66 dias: o último export era de 20/07, os dois únicos leads com
 * acesso tinham UIDs que nem sequer existiam em `broker_clients`, e a rota da corretora — o
 * gargalo número um do negócio — estava a zero sem ninguém perceber porquê. Um número que
 * envelhece sozinho precisa de alguém que grite; é só isso que esta rota faz.
 *
 * Avisa aos 30 dias (antes do precipício dos 40), repete a cada 3 dias enquanto durar, e manda
 * uma mensagem de alívio quando entra um export novo. Não escreve em `broker_clients`, não toca
 * em acessos, não revoga nem concede nada a ninguém.
 */

const CHAVE_ESTADO = 'broker_dados_frescura_state'
const DIAS_ENTRE_AVISOS = 3

type Estado = { estado?: string; ultimo_aviso?: number | null; dias?: number | null }

async function chatDoAdmin(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .maybeSingle()
    const v = (data?.value as { chat_id?: string } | null)?.chat_id
    return v ? String(v) : process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null
  } catch {
    return process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || null
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const agora = Date.now()

  // 1) Quando foi a última vez que alguém trouxe dados da corretora.
  const { data: maisRecente } = await supabase
    .from('broker_clients')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const frescura = avaliarFrescura(maisRecente?.updated_at ?? null, agora)

  // 2) Leads com acesso cujo UID não existe em `broker_clients`.
  //
  // Vive aqui e não numa rota própria porque é o MESMO sintoma visto de outro ângulo: um UID que
  // não casa deixa a pessoa em grace permanente — nunca validada por mérito, nunca revogável — e
  // até hoje ninguém tinha forma de saber que isso estava a acontecer.
  const { data: leads } = await supabase
    .from('telegram_leads')
    .select('chat_id, broker_uid, username, first_name')
    .not('broker_uid', 'is', null)
  const { data: clientes } = await supabase.from('broker_clients').select('uid')
  const uids = (clientes ?? []).map((c) => String(c.uid))
  const orfaos = leadsSemCorrespondencia(leads ?? [], uids)

  // 3) Estado anterior, para não repetir o mesmo aviso todos os dias.
  let anterior: Estado = {}
  try {
    const { data } = await supabase.from('site_settings').select('value').eq('key', CHAVE_ESTADO).maybeSingle()
    if (data?.value && typeof data.value === 'object') anterior = data.value as Estado
  } catch {
    /* primeira vez */
  }

  const precisaAvisar = frescura.estado === 'velho' || frescura.estado === 'a_envelhecer' || frescura.estado === 'sem_dados'
  const diasDesdeAviso = anterior.ultimo_aviso ? (agora - anterior.ultimo_aviso) / 86_400_000 : Infinity
  const mudouDeEstado = anterior.estado !== frescura.estado
  const deveEnviar = precisaAvisar && (mudouDeEstado || diasDesdeAviso >= DIAS_ENTRE_AVISOS)
  const recuperou = frescura.estado === 'fresco' && !!anterior.estado && anterior.estado !== 'fresco'

  let avisado = false
  const chat = await chatDoAdmin(supabase)

  if (chat && (deveEnviar || recuperou)) {
    const linhasOrfaos = orfaos.length
      ? `\n\n🔗 <b>${orfaos.length} lead(s) com UID que não casa com nenhum cliente</b> — ficam em grace para sempre:\n` +
        orfaos
          .slice(0, 10)
          .map((o) => `• ${o.username ? '@' + String(o.username).replace(/^@/, '') : o.first_name || o.chat_id} — UID <code>${o.broker_uid}</code>`)
          .join('\n')
      : ''

    const texto = recuperou
      ? `✅ <b>Dados da corretora atualizados</b> — ${frescura.mensagem} O gate volta a decidir por mérito.${linhasOrfaos}`
      : (frescura.estado === 'velho' ? '🚨' : '⚠️') +
        ` <b>Dados da corretora ${frescura.estado === 'sem_dados' ? 'inexistentes' : `com ${frescura.dias} dias`}</b>\n\n` +
        `${frescura.mensagem}\n\n` +
        `👉 Exporta o Funds/Rebate Report no portal de IB da PU Prime e importa-o em ` +
        `/admin/sales-machine (secção «Dados da corretora»). Leva 30 segundos e é o que destranca ` +
        `a rota da corretora.${linhasOrfaos}`

    try {
      await sendTelegramChannelMessage(chat, texto, { parseMode: 'HTML' })
      avisado = true
    } catch {
      /* best-effort: o alarme não pode derrubar o cron */
    }
  }

  try {
    await supabase.from('site_settings').upsert(
      {
        key: CHAVE_ESTADO,
        value: {
          estado: frescura.estado,
          dias: frescura.dias,
          ultimo_aviso: avisado && precisaAvisar ? agora : (anterior.ultimo_aviso ?? null),
          verificado_em: agora,
          orfaos: orfaos.length,
        },
        description: 'Frescura dos dados de broker_clients (aviso antes dos 40 dias do broker-gate-renew)',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch {
    /* ignora */
  }

  return NextResponse.json({
    ok: true,
    estado: frescura.estado,
    dias: frescura.dias,
    limite: DIAS_LIMITE_FRESCURA,
    aviso_a_partir_de: DIAS_AVISO_FRESCURA,
    clientes: uids.length,
    leads_sem_correspondencia: orfaos.length,
    avisado,
  })
}
