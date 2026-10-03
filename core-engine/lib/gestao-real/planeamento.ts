/**
 * QUE CONTAS TÊM LIGAÇÃO DE STREAMING — puro.
 *
 * Cada ligação de streaming a uma conta é uma subscrição paga na MetaApi e conta para os limites do
 * token. Por isso o motor só liga contas com posições ABERTAS para gerir (mais as da fotografia do
 * Premium, que ficam sempre), com um tecto, prioridades, uma graça depois de a última posição
 * fechar (evita ligar/desligar em rajada entre sinais seguidos), e recua perante erros:
 *
 *  · erro de LIMITE da MetaApi → não liga NADA de novo durante `pausaLimiteMs` (a quota é do token
 *    e as ordens dos clientes têm prioridade) e esta conta fica parada o mesmo tempo;
 *  · outro erro → recuo exponencial por conta (1 min → 15 min);
 *  · conta marcada como inexistente / leitura de fundo bloqueada → recusada (sem tentar).
 */

export interface PedidoConta {
  conta: string
  /** 0 = fotografia/mestre (fica sempre) · 1 Premium directa · 2 T2T · 3 MTM Auto · 4 educador · 5 subscritor */
  prioridade: number
  /** Chave do token (não o token): contas de equipas usam outra chave MetaApi. */
  chaveToken: string
  motivos: string[]
  /** Contas da fotografia: nunca desligam por graça. */
  fixa?: boolean
}

export interface EstadoConta {
  ligada: boolean
  /** Última vez em que a conta foi pedida (ms). */
  pedidaEm: number
  /** Não tentar ligar antes disto. */
  paradaAte: number
  falhas: number
}

export interface ConfigPlaneamento {
  maxContas: number
  gracaMs: number
  pausaLimiteMs: number
}

export const PLANEAMENTO_PADRAO: ConfigPlaneamento = { maxContas: 30, gracaMs: 10 * 60_000, pausaLimiteMs: 15 * 60_000 }

export interface Plano {
  ligar: string[]
  desligar: string[]
  recusadas: Array<{ conta: string; motivo: string }>
}

export function planear(
  pedidos: PedidoConta[],
  estados: Map<string, EstadoConta>,
  agora: number,
  cfg: ConfigPlaneamento,
  bloqueios: { pausaGlobalAte: number; bloqueada: (conta: string) => string | null },
): Plano {
  const plano: Plano = { ligar: [], desligar: [], recusadas: [] }
  const porConta = new Map<string, PedidoConta>()
  for (const p of pedidos) {
    const a = porConta.get(p.conta)
    if (!a || p.prioridade < a.prioridade) porConta.set(p.conta, { ...p, motivos: [...new Set([...(a?.motivos ?? []), ...p.motivos])], fixa: Boolean(p.fixa || a?.fixa) })
    else a.motivos = [...new Set([...a.motivos, ...p.motivos])]
  }
  const ordenados = [...porConta.values()].sort((a, b) => a.prioridade - b.prioridade || a.conta.localeCompare(b.conta))

  // Vagas: as ligadas que continuam pedidas ficam primeiro (não se derruba uma ligação viva por
  // uma nova de prioridade igual).
  const escolhidas = new Set<string>()
  for (const p of ordenados) {
    if (escolhidas.size >= cfg.maxContas) break
    if (estados.get(p.conta)?.ligada) escolhidas.add(p.conta)
  }
  for (const p of ordenados) {
    if (escolhidas.has(p.conta)) continue
    if (escolhidas.size >= cfg.maxContas) {
      plano.recusadas.push({ conta: p.conta, motivo: `tecto de ${cfg.maxContas} contas` })
      continue
    }
    const motivo = bloqueios.bloqueada(p.conta)
    if (motivo) { plano.recusadas.push({ conta: p.conta, motivo }); continue }
    const e = estados.get(p.conta)
    if (e && e.paradaAte > agora) { plano.recusadas.push({ conta: p.conta, motivo: `em recuo até ${new Date(e.paradaAte).toISOString()}` }); continue }
    if (bloqueios.pausaGlobalAte > agora) { plano.recusadas.push({ conta: p.conta, motivo: 'pausa por limite da MetaApi' }); continue }
    escolhidas.add(p.conta)
    plano.ligar.push(p.conta)
  }

  for (const [conta, e] of estados) {
    if (!e.ligada) continue
    const pedido = porConta.get(conta)
    if (pedido && escolhidas.has(conta)) continue
    if (pedido?.fixa) continue
    // Pedida mas sem vaga (tecto baixou) → desliga já; já não pedida → só depois da graça.
    if (pedido || agora - e.pedidaEm > cfg.gracaMs) plano.desligar.push(conta)
  }
  return plano
}

/** Actualiza o estado de uma conta depois de uma tentativa falhada de ligar. */
export function aposFalhaLigar(e: EstadoConta, limite: boolean, agora: number, cfg: ConfigPlaneamento): EstadoConta {
  const falhas = e.falhas + 1
  const recuo = limite ? cfg.pausaLimiteMs : Math.min(15 * 60_000, 60_000 * 2 ** (falhas - 1))
  return { ...e, ligada: false, falhas, paradaAte: agora + recuo }
}
