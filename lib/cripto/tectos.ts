/**
 * Os TECTOS DO EXECUTOR: a última fechadura antes do dinheiro. Puros.
 *
 * Vêm do env (VPS, ou Vercel para os perps da AURUM: app/api/cron/cripto-executar), nunca da Supabase. A guarda do vigia já aprovou a
 * ordem, mas a Supabase pode ser escrita por qualquer processo com a service key (Vercel incluída):
 * se alguém lá metesse uma posição `pendente` de 50 000 $, era aqui que morria.
 */

export interface Tectos {
  real: boolean
  ordemMaxUsd: number
  exposicaoMaxUsd: number
  perdaDiaMaxUsd: number
  alavancagemMax: number
  pendenteMaxIdadeMs: number
  capitalBaseUsd: number
  varreduraMaxUsd: number
  destinoLucros: string | null
  varrerBybit: boolean
  /**
   * A chave Bybit é a da conta-MESTRE do Copy Trading (escolha do dono, 28/10): cada ordem do
   * agente é copiada pelos seguidores. Nesse modo o executor não abre em pares com posição da
   * mestre, só fecha a quantidade que ele próprio abriu, mede o capital do agente pelo
   * CRIPTO_CAPITAL_BYBIT_USD (nunca pelo saldo da mestre) e NUNCA levanta dinheiro da Bybit.
   */
  bybitMestre: boolean
  capitalBybitUsd: number
  /**
   * Só memecoins (carteira Solana/Jupiter, incluindo tokens da Pump.fun). Os perps correm na Vercel
   * (app/api/cron/cripto-executar) com a chave da AURUM; o executor da VPS não lhes toca.
   */
  soSpot: boolean
  /** 2.ª carteira do agente («sniper»), para os tokens da Pump.fun e as carteiras espertas. */
  sniper: boolean
  /** Quanto a sniper deve ter em USDC; abaixo de metade, a principal repõe-na (0 = não repõe). */
  sniperCapitalUsd: number
  /** Movimentos ENTRE carteiras do agente: tecto por movimento e por dia. Os lucros têm o seu. */
  movimentoMaxUsd: number
  movimentosDiaMaxUsd: number
}

export function lerTectos(env: Record<string, string | undefined>): Tectos {
  const n = (k: string, d: number) => {
    const v = Number(env[k])
    return env[k] != null && env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : d
  }
  return {
    real: env.CRIPTO_REAL === '1',
    ordemMaxUsd: n('CRIPTO_ORDEM_MAX_USD', 25),
    exposicaoMaxUsd: n('CRIPTO_EXPOSICAO_MAX_USD', 100),
    perdaDiaMaxUsd: n('CRIPTO_PERDA_DIA_MAX_USD', 10),
    alavancagemMax: Math.min(5, n('CRIPTO_ALAVANCAGEM_MAX', 3)),
    pendenteMaxIdadeMs: n('CRIPTO_PENDENTE_MAX_S', 120) * 1000,
    capitalBaseUsd: n('CRIPTO_CAPITAL_BASE_USD', 0),
    varreduraMaxUsd: n('CRIPTO_VARREDURA_MAX_USD', 500),
    destinoLucros: env.CRIPTO_DESTINO_LUCROS?.trim() || null,
    // Da mestre não sai dinheiro, diga o env o que disser.
    varrerBybit: env.CRIPTO_VARRER_BYBIT === '1' && env.CRIPTO_BYBIT_MESTRE !== '1',
    bybitMestre: env.CRIPTO_BYBIT_MESTRE === '1',
    capitalBybitUsd: n('CRIPTO_CAPITAL_BYBIT_USD', 0),
    soSpot: env.CRIPTO_SO_SPOT === '1',
    sniper: env.CRIPTO_SNIPER === '1',
    sniperCapitalUsd: n('CRIPTO_SNIPER_CAPITAL_USD', 0),
    movimentoMaxUsd: n('CRIPTO_MOVIMENTO_MAX_USD', 50),
    movimentosDiaMaxUsd: n('CRIPTO_MOVIMENTOS_DIA_MAX_USD', 200),
  }
}

/**
 * A FECHADURA DOS MOVIMENTOS. Para onde pode ir dinheiro do agente:
 *  · `rebalanço`: só entre carteiras DO PRÓPRIO AGENTE (as que este executor tem no cofre da VPS,
 *    nunca uma lista lida da Supabase), com tecto por movimento e por dia;
 *  · `lucros`: só para CRIPTO_DESTINO_LUCROS (env da VPS) e até ao tecto da varredura.
 * Qualquer outro destino é recusado (e o executor regista e alerta).
 */
export interface Movimento {
  de: string
  para: string
  valorUsd: number
  motivo: 'rebalanço' | 'lucros'
}

export function verificarMovimento(m: Movimento, t: Tectos, ctx: { proprias: Set<string>; movidoHojeUsd: number }): string | null {
  if (!t.real) return 'CRIPTO_REAL não está a 1 nesta VPS.'
  if (!(m.valorUsd > 0) || !Number.isFinite(m.valorUsd)) return 'Valor inválido.'
  if (!ctx.proprias.has(m.de)) return 'A origem não é uma carteira deste executor.'
  if (m.de === m.para) return 'Origem e destino iguais.'
  if (m.motivo === 'lucros') {
    if (!t.destinoLucros || m.para !== t.destinoLucros) return 'Lucros só vão para CRIPTO_DESTINO_LUCROS.'
    if (m.valorUsd > t.varreduraMaxUsd) return `Envio de ${m.valorUsd} $ acima do tecto da varredura (${t.varreduraMaxUsd} $).`
    return null
  }
  if (!ctx.proprias.has(m.para)) return 'Destino fora das carteiras do agente: recusado.'
  if (m.valorUsd > t.movimentoMaxUsd) return `Movimento de ${m.valorUsd} $ acima do tecto (${t.movimentoMaxUsd} $).`
  if (ctx.movidoHojeUsd + m.valorUsd > t.movimentosDiaMaxUsd) return `Movimentos de hoje passariam de ${t.movimentosDiaMaxUsd} $.`
  return null
}

/** Repor a sniper: se tiver menos de metade do alvo, a principal manda o que falta (com tecto). */
export function planoRebalanco(t: Tectos, usdcPrincipal: number, usdcSniper: number): number {
  if (!t.sniper || !(t.sniperCapitalUsd > 0) || usdcSniper >= t.sniperCapitalUsd / 2) return 0
  const falta = t.sniperCapitalUsd - usdcSniper
  return Math.floor(Math.max(0, Math.min(falta, usdcPrincipal, t.movimentoMaxUsd)) * 100) / 100
}

/** Os gatilhos que, com a sniper ligada, usam a sniper (Pump.fun e carteiras espertas). */
export const TIPOS_SNIPER = new Set(['pump-graduado', 'carteira-esperta'])

export interface Pendente {
  nocional_usd: number
  alavancagem: number
  aberta_em: string
}

export function verificarPendente(p: Pendente, t: Tectos, ctx: { exposicaoAbertaUsd: number; perdaHojeUsd: number; agora: Date }): string | null {
  if (!t.real) return 'CRIPTO_REAL não está a 1 nesta VPS.'
  const idade = ctx.agora.getTime() - new Date(p.aberta_em).getTime()
  if (!(idade >= 0 && idade <= t.pendenteMaxIdadeMs)) return `Pedido com ${Math.round(idade / 1000)} s: o preço já não é o da decisão.`
  if (!(Number(p.nocional_usd) > 0)) return 'Nocional inválido.'
  if (Number(p.nocional_usd) > t.ordemMaxUsd) return `Nocional ${p.nocional_usd} $ acima do tecto da VPS (${t.ordemMaxUsd} $).`
  if (ctx.exposicaoAbertaUsd + Number(p.nocional_usd) > t.exposicaoMaxUsd) return `Exposição passaria de ${t.exposicaoMaxUsd} $.`
  if (ctx.perdaHojeUsd >= t.perdaDiaMaxUsd) return `Perda de hoje ${ctx.perdaHojeUsd.toFixed(2)} $ já no tecto (${t.perdaDiaMaxUsd} $).`
  if (!(p.alavancagem >= 1 && p.alavancagem <= t.alavancagemMax)) return `Alavancagem ${p.alavancagem} fora do tecto (${t.alavancagemMax}).`
  return null
}

/** Quanto enviar no fim da sessão, com os números DO EXECUTOR (saldos que ele próprio leu). */
export function valorAEnviar(t: Tectos, equityUsd: number, livreSolanaUsd: number, minimoUsd: number): { usd: number; porque: string } {
  if (!t.destinoLucros) return { usd: 0, porque: 'CRIPTO_DESTINO_LUCROS não definido na VPS.' }
  if (!(t.capitalBaseUsd > 0)) return { usd: 0, porque: 'CRIPTO_CAPITAL_BASE_USD não definido na VPS.' }
  const lucro = equityUsd - t.capitalBaseUsd
  if (lucro <= 0) return { usd: 0, porque: `Sem lucro acima da base (${lucro.toFixed(2)} $).` }
  const usd = Math.floor(Math.min(lucro, livreSolanaUsd, t.varreduraMaxUsd) * 100) / 100
  if (usd < minimoUsd) return { usd: 0, porque: `Lucro enviável ${usd.toFixed(2)} $ abaixo do mínimo.` }
  return { usd, porque: `Lucro acima da base: ${usd.toFixed(2)} $.` }
}

/**
 * Equity Bybit QUE É DO AGENTE. Na subconta é o saldo da conta. Na mestre é o capital atribuído
 * mais o PnL realizado das trades do agente: o saldo da mestre é dinheiro do Aurum e, se entrasse
 * aqui, o agente dimensionava ordens pelo capital dos outros.
 */
export function equityBybitDoAgente(t: Tectos, saldoConta: { equity: number; livre: number } | null, pnlRealizadoAgenteUsd: number, margemAbertaUsd: number): { equity: number; livre: number } {
  if (!t.bybitMestre) return saldoConta ?? { equity: 0, livre: 0 }
  if (!saldoConta) return { equity: 0, livre: 0 }
  const equity = Math.max(0, t.capitalBybitUsd + pnlRealizadoAgenteUsd)
  const livre = Math.max(0, Math.min(equity - margemAbertaUsd, saldoConta.livre))
  return { equity, livre }
}

/** Na mestre, um par com posição que não é do agente fica de fora (one-way: as posições fundiam-se). */
export function parOcupadoNaMestre(t: Tectos, tamanhoNaConta: number | null): string | null {
  if (!t.bybitMestre) return null
  if (tamanhoNaConta == null) return 'Não consegui ler a posição da mestre neste par.'
  return tamanhoNaConta > 0 ? 'A mestre já tem posição neste par (Aurum): o agente não entra por cima.' : null
}

/**
 * Tectos do executor da VERCEL (perps na AURUM, mestre do Copy Trading). Sempre em modo mestre e
 * sem levantamentos; se o env não disser nada, 100 $ de capital do agente. Os restantes valores
 * por omissão já são pequenos (ordem 25 $, exposição 100 $, perda do dia 10 $, alavancagem 3).
 */
export function tectosDaVercel(env: Record<string, string | undefined>): Tectos {
  const t = lerTectos(env)
  const capital = env.CRIPTO_CAPITAL_BYBIT_USD != null && env.CRIPTO_CAPITAL_BYBIT_USD !== '' ? t.capitalBybitUsd : 100
  // O cron corre de minuto a minuto e o vigia também: um pedido pode ter até ~2 min quando chega.
  const pendente = env.CRIPTO_PENDENTE_MAX_S ? t.pendenteMaxIdadeMs : 150_000
  return { ...t, bybitMestre: true, varrerBybit: false, capitalBybitUsd: capital, pendenteMaxIdadeMs: pendente }
}

/**
 * O saldo do agente tem duas partes, lidas por dois executores: a carteira Solana (VPS) e a parte
 * dele na AURUM (Vercel). Cada um grava a sua e repete a última do outro, para que a última linha
 * de cripto_saldos (a que a guarda do vigia lê) tenha sempre o total.
 */
export interface PartesSaldo { solana: { equity: number; livre: number }; bybit: { equity: number; livre: number } }

export function juntarPartes(nova: Partial<PartesSaldo>, anterior: unknown): PartesSaldo & { equity: number; livre: number } {
  const ant = (anterior && typeof anterior === 'object' ? anterior : {}) as Partial<PartesSaldo>
  const parte = (x: unknown) => {
    const o = (x && typeof x === 'object' ? x : {}) as { equity?: unknown; livre?: unknown }
    return { equity: Number(o.equity) || 0, livre: Number(o.livre) || 0 }
  }
  const solana = parte(nova.solana ?? ant.solana)
  const bybit = parte(nova.bybit ?? ant.bybit)
  return { solana, bybit, equity: solana.equity + bybit.equity, livre: solana.livre + bybit.livre }
}
