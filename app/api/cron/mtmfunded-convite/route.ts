import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { enviarConviteTorneio } from '@/lib/mtmfunded/envios'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O CONVITE DE CADA TORNEIO, enviado sozinho quando as inscrições abrem.
 *
 * Corre TODOS OS DIAS e não uma vez por trimestre, apesar de os torneios serem trimestrais.
 * A diferença importa: uma data fixa no calendário manda o convite no dia 1 de Janeiro quer o
 * torneio esteja aberto quer não — e um torneio adiado uma semana ganhava um convite prematuro
 * para uma porta que ainda não abriu. Aqui quem manda é o ESTADO do torneio; a periodicidade
 * trimestral vem de haver um torneio por trimestre, que é onde essa regra deve viver.
 *
 * Não há risco de repetir: `enviarConviteTorneio` marca quem já recebeu, e a marca é POR
 * TORNEIO — o seguinte volta a convidar toda a gente, este não convida ninguém duas vezes.
 *
 * Espera-se um dia depois de as inscrições abrirem. Um convite que chega no mesmo minuto em
 * que o admin carrega no botão apanha erros de configuração que ainda estavam a ser corrigidos
 * — e um email não se desfaz.
 */

const HORAS_DE_ESPERA = Number(process.env.MTMFUNDED_CONVITE_ESPERA_H || 24)

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET
  if (!esperado) return false
  const dado =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ??
    request.nextUrl.searchParams.get('secret')
  const a = Buffer.from(String(dado ?? ''))
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()

  // Traz o torneio publicado mais recente e pergunta DEPOIS se ainda aceita gente. Filtrar por
  // `estado = 'inscricoes'` na consulta deixava de fora um torneio já a decorrer cujas
  // inscrições continuam abertas — e é esse que mais precisa de convite.
  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, nome, estado, comeca_em, updated_at, publicado, inscricoes_fecham_em')
    .eq('publicado', true)
    .not('estado', 'in', '("draft","terminado","cancelado")')
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { inscricoesAbertas } = await import('@/lib/mtmfunded/inscricoes')
  if (!torneio || !inscricoesAbertas(torneio)) {
    return NextResponse.json({ ok: true, nota: 'nenhum torneio com inscrições abertas' })
  }

  // A espera conta-se desde a última mudança do torneio — que é quando as inscrições abriram.
  const desde = new Date((torneio.updated_at as string) ?? Date.now()).getTime()
  const faltam = desde + HORAS_DE_ESPERA * 3600_000 - Date.now()
  if (faltam > 0) {
    return NextResponse.json({
      ok: true,
      nota: `convite de "${torneio.nome}" sai daqui a ${Math.ceil(faltam / 3600_000)}h`,
    })
  }

  const r = await enviarConviteTorneio({ confirmar: 'SIM-ENVIAR', limite: 2000 })
  return NextResponse.json({ ok: true, torneio: torneio.nome, ...r })
}
