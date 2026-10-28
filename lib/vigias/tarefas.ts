/**
 * VIGIAS — os monitores que eram crons de 1 min na Vercel e passam a correr no VPS (mtm-vigias).
 *
 * Porquê: 10 crons de minuto davam ~14.400 chamadas/dia à Vercel, cada uma a pagar memória
 * provisionada enquanto esperava pela MetaApi/Supabase. No VPS correm num só processo, mais depressa
 * (de 10 em 10 s em vez de 60 s) e sem custo por chamada.
 *
 * A passagem é por tarefa e sem dupla execução: o VPS só corre as tarefas de VIGIAS_TAREFAS e
 * escreve-as no pulso (servicos_pulso 'mtm-vigias'). O cron da Vercel de cada tarefa pergunta
 * `vigiaNaVps(nome)` e, se o VPS a correu há pouco, devolve logo sem trabalhar. Se o VPS parar,
 * o pulso envelhece e o cron da Vercel volta a fazer o trabalho sozinho no minuto seguinte.
 */
export const TAREFAS_VIGIAS = [
  'webtrader-gestao-auto',
  't2t-price-monitor',
  'signal-tracker',
  'premium-zone-monitor',
  'premium-price-monitor',
  'perps-position-monitor',
  'mestre-publicar',
  'funis',
  'mtmcopy-master-poll',
  /** O agente trader na conta de papel 77549217. Na Vercel só corria às 06:00 com sinais de 15 min:
   *  nunca via um sinal fresco. Aqui corre de minuto a minuto. Sem cron Vercel de reserva — se o VPS
   *  parar, o agente simplesmente não abre (é papel; a passagem das 06:00 continua a registar). */
  'agente-trader',
  /** O agente cripto (lib/cripto/ciclo.ts): AG-SCANNER + sub-agentes + AG-TRADER + guarda. Em papel
   *  abre e fecha posições simuladas; em real só escreve pedidos `pendente` para o executor da VPS,
   *  que é outro processo. Sem cron Vercel de reserva (os hosts de dados só respondem à VPS). */
  'agente-cripto',
] as const

export type TarefaVigia = (typeof TAREFAS_VIGIAS)[number]

export const SERVICO_VIGIAS = 'mtm-vigias'

/** Depois disto sem pulso, a Vercel assume outra vez (o pulso é escrito de 30 em 30 s). */
export const PULSO_VALIDO_MS = 120_000

export interface EstadoTarefa {
  /** ISO da última passagem que terminou (com ou sem erro). */
  ultima: string | null
  ms: number | null
  erro: string | null
  passagens: number
}

export interface EstadoVigias {
  tarefas: Partial<Record<TarefaVigia, EstadoTarefa>>
}

/** Uma tarefa conta como «a correr no VPS» se a última passagem acabou há menos de PULSO_VALIDO_MS. */
export function tarefaViva(estado: EstadoVigias | null | undefined, pulsoEm: string | null | undefined, nome: TarefaVigia, agora = Date.now()): boolean {
  if (!estado?.tarefas || !pulsoEm) return false
  if (agora - Date.parse(pulsoEm) > PULSO_VALIDO_MS) return false
  const t = estado.tarefas[nome]
  if (!t?.ultima) return false
  return agora - Date.parse(t.ultima) <= PULSO_VALIDO_MS
}
