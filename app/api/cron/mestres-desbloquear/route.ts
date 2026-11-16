import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { causaDoBloqueio, podeDesbloquearSozinha, type ContaBloqueada } from '@/lib/mestres/desbloqueio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'

/**
 * DESBLOQUEIO AUTOMÁTICO das contas de cópia — de 10 em 10 minutos.
 *
 * Contas bloqueadas por causa conhecida e inofensiva («Position not found», «Invalid stops», …)
 * voltam a copiar sozinhas; o admin recebe UM aviso por passagem. Avarias reais ficam bloqueadas.
 * Regras em `lib/mestres/desbloqueio.ts`. `?seco=1` diz o que faria, sem mexer.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const seco = request.nextUrl.searchParams.get('seco') === '1'
  const db = getSupabaseAdmin()
  try {
    const { data, error } = await db
      .from('mestres_contas')
      .select('conta_chave, conta_ref, bloqueio_motivo, ultima_falha')
      .not('bloqueada_em', 'is', null)
    if (error) throw new Error(error.message)

    const contas = (data ?? []) as ContaBloqueada[]
    const soltas: Array<{ conta: string; causa: string }> = []
    const ficam: Array<{ conta: string; causa: string }> = []
    for (const c of contas) {
      const causa = causaDoBloqueio(c).slice(0, 160)
      if (!podeDesbloquearSozinha(c)) { ficam.push({ conta: c.conta_chave, causa }); continue }
      if (!seco) {
        const { error: e } = await db
          .from('mestres_contas')
          .update({ bloqueada_em: null, bloqueio_motivo: null, falhas_seguidas: 0, alerta_em: null, updated_at: new Date().toISOString() })
          .eq('conta_chave', c.conta_chave)
        if (e) { ficam.push({ conta: c.conta_chave, causa: `erro ao desbloquear: ${e.message}` }); continue }
        await db.from('mestres_alertas').insert({
          tipo: 'conta_desbloqueada',
          conta_chave: c.conta_chave,
          mensagem: `DESBLOQUEADA sozinha · conta ${c.conta_chave} (${c.conta_ref ?? '?'}) · causa conhecida: ${causa}`,
        })
      }
      soltas.push({ conta: c.conta_chave, causa })
    }

    if (!seco && soltas.length) {
      const texto = [
        `🔓 ${soltas.length} conta${soltas.length > 1 ? 's' : ''} desbloqueada${soltas.length > 1 ? 's' : ''} sozinha${soltas.length > 1 ? 's' : ''}`,
        '',
        ...soltas.map((s) => `• ${s.conta} — ${s.causa}`),
        '',
        'Causa conhecida (a corretora já tinha fechado a cópia ou o stop ficou perto do preço): a conta está saudável e voltou a copiar.',
        ...(ficam.length ? ['', `Continuam bloqueadas (avaria real, precisam de ti): ${ficam.map((f) => f.conta).join(', ')}`] : []),
      ].join('\n')
      await sendTelegramChannelMessage(ADMIN_CHAT(), texto).catch(() => undefined)
    }

    return NextResponse.json({ ok: true, seco, desbloqueadas: soltas, continuamBloqueadas: ficam })
  } catch (e) {
    console.error('[CRON mestres-desbloquear]', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 })
  }
}
