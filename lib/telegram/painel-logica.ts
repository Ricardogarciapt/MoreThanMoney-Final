/**
 * GESTÃO → TELEGRAM, a parte pura: o que o painel conclui do pulso dos relays e do registo de
 * publicações. Sem rede, sem Supabase — testável com `npx tsx lib/telegram/painel-logica.check.ts`.
 *
 * Os serviços Telegram da VPS (ver `services/gmi-relay`, `services/forex-swings-relay`):
 *   · gmi-relay  — rotas MTProto → Premium e outras (RELAY_ROUTES no .env da VPS)
 *   · fs-relay   — James → MTM Auto FOREX Swings
 *   · pv-relay   — PrimeVerse → Sensei (parado desde 04/10)
 *   · mtm-dialogos — a lista dos grupos do dono, só leitura (lib/prospecao/dialogos.ts)
 */
export const RELAYS_CONHECIDOS = ['gmi-relay', 'fs-relay', 'pv-relay']

export const NOME_RELAY: Record<string, string> = {
  'gmi-relay': 'Relay de sinais (Premium e rotas)',
  'fs-relay': 'FOREX Swings (James)',
  'pv-relay': 'PrimeVerse → Sensei',
}

export const servicoDoRelay = (relay: string) => `telegram:${relay}`

/** O relay pulsa de 5 em 5 min; 12 min sem pulso é um ciclo falhado mais folga. */
export const PULSO_ATRASADO_MS = 12 * 60_000

export type EstadoPulso = 'vivo' | 'atrasado' | 'sem-pulso'

export function estadoDoPulso(emIso: string | null | undefined, agoraMs = Date.now()): EstadoPulso {
  if (!emIso) return 'sem-pulso'
  const t = Date.parse(emIso)
  if (!Number.isFinite(t)) return 'sem-pulso'
  return agoraMs - t <= PULSO_ATRASADO_MS ? 'vivo' : 'atrasado'
}

export type LinhaRelayLog = { source_chat_id: string; target_chat_id: string; status: string; created_at: string; error: string | null }

export type RotaObservada = {
  fonte: string
  destino: string
  fonteNome: string | null
  destinoNome: string | null
  publicadas24h: number
  publicadas7d: number
  falhas7d: number
  ultimaIso: string | null
  ultimoErro: string | null
  /** Dias desde a última publicação; o painel avisa a partir de 3. */
  diasParada: number | null
  /** Publicadas por dia nos últimos 14 dias, do mais antigo para hoje (o gráfico da linha). */
  serie14d: number[]
}

/** Agrupa o registo por fonte→destino. As linhas vêm dos últimos 30 dias. */
export function agregarRotas(linhas: LinhaRelayLog[], titulos: Map<string, string>, agoraMs = Date.now()): RotaObservada[] {
  const mapa = new Map<string, RotaObservada>()
  for (const l of linhas) {
    const k = `${l.source_chat_id}→${l.target_chat_id}`
    let r = mapa.get(k)
    if (!r) {
      r = {
        fonte: l.source_chat_id, destino: l.target_chat_id,
        fonteNome: titulos.get(l.source_chat_id) ?? null, destinoNome: titulos.get(l.target_chat_id) ?? null,
        publicadas24h: 0, publicadas7d: 0, falhas7d: 0, ultimaIso: null, ultimoErro: null, diasParada: null,
        serie14d: new Array(14).fill(0),
      }
      mapa.set(k, r)
    }
    const t = Date.parse(l.created_at)
    const idade = agoraMs - t
    if (l.status === 'sent') {
      if (idade <= 86_400_000) r.publicadas24h++
      if (idade <= 7 * 86_400_000) r.publicadas7d++
      const dia = Math.floor(idade / 86_400_000)
      if (dia >= 0 && dia < 14) r.serie14d[13 - dia]++
      if (!r.ultimaIso || t > Date.parse(r.ultimaIso)) r.ultimaIso = l.created_at
    } else if (idade <= 7 * 86_400_000) {
      r.falhas7d++
      if (l.error && !r.ultimoErro) r.ultimoErro = l.error.slice(0, 200)
    }
  }
  for (const r of mapa.values()) {
    r.diasParada = r.ultimaIso ? Math.floor((agoraMs - Date.parse(r.ultimaIso)) / 86_400_000) : null
  }
  return [...mapa.values()].sort((a, b) => (Date.parse(b.ultimaIso ?? '0') || 0) - (Date.parse(a.ultimaIso ?? '0') || 0))
}
