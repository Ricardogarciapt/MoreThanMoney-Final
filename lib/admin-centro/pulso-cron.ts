import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Batimento de um cron da Vercel → cron_pulso (095). O Centro de Controlo mostra «última execução»
 * por caminho. Uma escrita por execução (upsert por caminho), nunca lança, nunca atrasa o cron.
 *
 *   export async function GET(req) {
 *     const t0 = Date.now()
 *     … trabalho …
 *     await registarPulsoCron('/api/cron/signal-tracker', { ok: true, inicio: t0 })
 *   }
 *
 * Ainda não está ligado a nenhum cron (pendente: decidir quais — escrever num cron de 1–2 min
 * soma carga à base).
 */
export async function registarPulsoCron(caminho: string, r: { ok: boolean; inicio?: number; detalhe?: string }): Promise<void> {
  try {
    await getSupabaseAdmin().from('cron_pulso').upsert({
      caminho, em: new Date().toISOString(), ok: r.ok,
      duracao_ms: r.inicio ? Date.now() - r.inicio : null, detalhe: r.detalhe?.slice(0, 300) ?? null,
    }, { onConflict: 'caminho' })
  } catch {
    // sem a 095 ou base em baixo: o cron segue
  }
}
