/**
 * CANAIS PUBLICADOS PELA MESTRE — quando uma estratégia tem `mestres_estrategias.sinal_modo='live'`
 * (o webhook abre o sinal directamente na conta-mestre SIM), o chat dessa estratégia e o grupo de
 * Telegram correspondente passam a ter UMA fonte de verdade: o que a mestre abre, gere e fecha
 * (lib/mestres/servidor/publicar.ts).
 *
 * Todos os outros escritores desses canais (cartões do webhook, seguimentos do Pine, tracker de
 * preço, monitor T2T, espelho de fecho T2T, avisos de desfecho) perguntam aqui antes de escrever e
 * calam-se — era a mistura deles que punha o chat «MTM Auto Sensei» diferente do Telegram, com
 * duplicados e fora de ordem (18/09).
 *
 * Reversível sem deploy: `sinal_modo` fora de 'live' devolve o canal aos escritores de sempre.
 * Módulo sem dependências de motores (evita ciclos de import).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  resolvedGoldkillerScannerChatId,
  resolvedTradeIdeasChatId,
} from '@/lib/telegram-channel-ids'

export interface PublicacaoDaMestre {
  /** slug de mestres_estrategias, em minúsculas */
  estrategia: string
  /** canal do chat da app */
  canal: string
  /** grupo Telegram (null = sem Telegram) */
  telegram: () => string | null
  /** etiqueta no formato único */
  etiqueta: string
}

/** Estratégias cujo canal pode passar a ser publicado pela mestre. */
export const PUBLICACOES: Record<string, PublicacaoDaMestre> = {
  sensei: {
    estrategia: 'sensei',
    canal: 'sensei-scanner',
    telegram: () => resolvedTradeIdeasChatId() || null,
    etiqueta: 'MTM Auto Sensei',
  },
  goldkiller: {
    estrategia: 'goldkiller',
    canal: 'sinais-goldkiller',
    telegram: () => resolvedGoldkillerScannerChatId() || null,
    etiqueta: 'MTM Auto GoldKiller',
  },
}

export interface EstrategiaPublicada extends PublicacaoDaMestre {
  contaMestreId: string
  providerId: string
}

let cache: { em: number; lista: EstrategiaPublicada[] } | null = null
const CACHE_MS = 20_000

/** Estratégias com a mestre em live E com publicação definida. Nunca lança (erro → lista vazia). */
export async function estrategiasPublicadasPelaMestre(): Promise<EstrategiaPublicada[]> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.lista
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('mestres_estrategias')
      .select('slug, sinal_modo, conta_mestre_id, provider_id')
    if (error) throw error
    const lista: EstrategiaPublicada[] = []
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const slug = String(r.slug ?? '').toLowerCase()
      const pub = PUBLICACOES[slug]
      if (!pub || r.sinal_modo !== 'live' || !r.conta_mestre_id) continue
      lista.push({ ...pub, contaMestreId: String(r.conta_mestre_id), providerId: String(r.provider_id ?? '') })
    }
    cache = { em: Date.now(), lista }
    return lista
  } catch {
    // Sem leitura não se cala ninguém: um canal mudo é pior do que um canal com eco.
    return cache?.lista ?? []
  }
}

/** Este canal do chat é publicado pela mestre? (os outros escritores calam-se) */
export async function canalPublicadoPelaMestre(canal: string | null | undefined): Promise<boolean> {
  if (!canal) return false
  const lista = await estrategiasPublicadasPelaMestre()
  return lista.some((e) => e.canal === canal)
}

/** Para testes: esquece a cache. */
export function limparCacheCanaisPublicados(): void {
  cache = null
}
