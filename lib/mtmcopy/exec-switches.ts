import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Interruptores por-execução do MTM Copy (runtime, sem redeploy).
 * Guardados em site_settings.value (jsonb) na key 'mtmcopy_exec_switches'.
 * Cada provider pode ser ligado/desligado de forma independente.
 */
export interface ExecSwitches {
  sensei: boolean // Ouro/BTC (conta Sensei) — MASTER: gate da GESTÃO das posições abertas (parciais/BE/trailing)
  /** Só as ENTRADAS novas do Sensei (gold/BTC). Permite pausar entradas MANTENDO a gestão das abertas
   *  (sensei=true + sensei_entries=false). Default TRUE (não altera comportamento existente). */
  sensei_entries: boolean
  forex: boolean // MTM Auto Forex (conta 5IHE)
  premium: boolean // MTM Auto Premium
  goldkiller: boolean // MTM Auto GoldKiller (conta SDNb / 181271197)
  /** Monitor de preço Premium: fecha parciais/BE/trailing por PREÇO (não por mensagem).
   *  Default FALSE — ligar só depois de validar em demo. */
  premium_price_monitor: boolean
  /** Espelha os exits Premium (parcial/BE/trailing/fecho) DIRETAMENTE em cada conta de
   *  subscritor via MetaAPI — o CopyFactory não replica fechos PARCIAIS. Default FALSE
   *  (kill-switch: dinheiro real de subscritores). Ligar quando validado. */
  premium_subscriber_exits: boolean
  /** Monitor de posição dos PERPÉTUOS (Bybit): acompanha a posição-mestre em tempo real e publica
   *  o ciclo de vida (Entry Hit → parcial → BE → fecho c/ resultado) no chat + Telegram dos perps.
   *  Só NOTIFICA (as saídas já são nativas da Bybit). Default ON. */
  perps_position_monitor: boolean
  /** Fecho automático das ordens T2T dos SEGUIDORES quando a fonte fecha/cancela (PrimeVerse,
   *  Premium, Sensei, GoldKiller, Forex Swings). Kill-switch único. Default ON. */
  t2t_auto_close: boolean
  /** Fluxo do Premium para a CONTA MESTRE (real). OFF = Premium passa a SEMI-AUTOMÁTICO: o sinal do
   *  Telegram/chat vai DIRETO para a conta de cada subscritor (execução direta), sem conta mestre nem
   *  CopyFactory. Default TRUE (comportamento antigo). */
  premium_master_exec: boolean
  /** Monitor de PREÇO das posições T2T dos seguidores (entry-hit → parciais → BE → trailing →
   *  fecho), em tempo real e SEM depender de mensagens da fonte. É o que dá gestão completa ao
   *  MTM Scanner (só manda entradas). Default ON. */
  t2t_price_monitor: boolean
  /**
   * O trailing segue o PREÇO AO VIVO em vez do instantâneo da posição.
   *
   * O `currentPrice` que vem com a posição pode ter segundos de atraso — a MetaApi devolve o
   * estado da conta, não um tick. Num movimento rápido esses segundos são a diferença entre
   * travar o lucro e devolvê-lo no recuo.
   *
   * É um interruptor e não o comportamento fixo porque custa uma leitura de preço por posição e
   * por passagem. Com muitas posições abertas isso é muitas chamadas por minuto, e quem opera
   * swing não ganha nada com elas — o instantâneo chega. Ligar em quem faz scalp.
   *
   * Default FALSE: mantém exactamente o comportamento que existia.
   */
  trailing_tempo_real: boolean
  /**
   * A perna GOLD DID: a mesma entrada do Premium aberta também na conta do Alcy, com regras
   * próprias (0,02 lotes, saídas a meias, trailing pelo motor).
   *
   * Tem interruptor próprio porque abre ordens sozinha numa segunda conta. O precedente é o
   * Forex Swings, que entrou rotulado de Premium e abriu nas contas de toda a gente: quando uma
   * coisa destas corre mal, tem de haver um sítio para a desligar sem esperar por um deploy.
   * Default ON — foi pedida a funcionar.
   */
  golddid_exec: boolean
}

const KEY = "mtmcopy_exec_switches"

export async function getExecSwitches(): Promise<ExecSwitches> {
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<ExecSwitches>
    // Default = ligado (não altera o comportamento existente enquanto não for tocado)
    return {
      sensei: v.sensei !== false,
      sensei_entries: v.sensei_entries !== false, // default ON (só false pausa entradas mantendo gestão)
      forex: v.forex !== false,
      premium: v.premium !== false,
      goldkiller: v.goldkiller !== false, // default ON
      premium_price_monitor: v.premium_price_monitor === true, // default OFF
      premium_subscriber_exits: v.premium_subscriber_exits === true, // default OFF (dinheiro real)
      perps_position_monitor: v.perps_position_monitor !== false, // default ON (só notifica)
      t2t_auto_close: v.t2t_auto_close !== false, // default ON
      t2t_price_monitor: v.t2t_price_monitor !== false, // default ON
      // Default OFF: liga-se por escolha, porque custa uma leitura de preço por posição.
      trailing_tempo_real: v.trailing_tempo_real === true,
      premium_master_exec: v.premium_master_exec !== false, // default ON (conta mestre)
      golddid_exec: v.golddid_exec !== false, // default ON (conta demo do Alcy)
    }
  } catch {
    return {
      sensei: true,
      sensei_entries: true,
      forex: true,
      premium: true,
      goldkiller: true,
      premium_price_monitor: false,
      premium_subscriber_exits: false,
      perps_position_monitor: true,
      t2t_auto_close: true,
      t2t_price_monitor: true,
      trailing_tempo_real: false,
      premium_master_exec: true,
      golddid_exec: true,
    }
  }
}

export async function setExecSwitches(patch: Partial<ExecSwitches>): Promise<ExecSwitches> {
  const current = await getExecSwitches()
  const next: ExecSwitches = { ...current, ...patch }
  await getSupabaseAdmin()
    .from("site_settings")
    .upsert(
      { key: KEY, value: next, description: "Interruptores por-execução MTM Copy", updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  return next
}
