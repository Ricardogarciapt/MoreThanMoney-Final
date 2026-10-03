/**
 * A PLATAFORMA que o cliente escolhe no checkout — e o motor em que a conta nasce.
 *
 *  · `mtmfunded` — o nosso servidor simulado («MTM Funded»): conta criada na hora, WebTrader,
 *    credenciais por link seguro. Motor `sim`.
 *  · `mt5` — conta demo na corretora, criada pela fila do agente MT5 no VPS e lida pela MetaApi.
 *    Motor `mt5`.
 *
 * Funções PURAS (sem base de dados, sem rede): é aqui que se decide, e é isto que os testes
 * verificam. Quem grava e quem cria contas só chama estas funções.
 *
 * Regras:
 *  1. A escolha viaja pelos metadados do Stripe (`plataforma`) e manda na criação da conta.
 *     Uma compra paga como `mtmfunded` nasce simulada — o cliente pagou por isso.
 *  2. O checkout só OFERECE `mtmfunded` depois do lançamento (`sim_lancado_em`) e só oferece
 *     `mt5` enquanto `mt5_a_venda` estiver ligado.
 *  3. Sessões antigas, sem `plataforma` nos metadados, seguem a regra de antes (lançamento).
 *  4. Continuações (fase 2, financiada, renovação) HERDAM o motor da conta anterior.
 */

export type Plataforma = 'mtmfunded' | 'mt5'
type Motor = 'mt5' | 'sim'

export const PLATAFORMAS: readonly Plataforma[] = ['mtmfunded', 'mt5']

/**
 * Prazo da conta MT5, tirado do agente (services/mt5-agent/vps/agente.py): a fila é lida a cada
 * 60 s e uma criação demora até ~7 min, MAS o agente não trabalha durante transmissões ao vivo
 * (2 vCPU partilhados com o streaming). Por isso: normalmente menos de 1 hora; prometem-se 24 h.
 */
export const PRAZO_MT5_HORAS = 24

export function lerPlataforma(v: unknown): Plataforma | null {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'mtmfunded' || s === 'mt5' ? s : null
}

export interface ConfigPlataformas {
  sim_lancado_em: string | null
  /** Vender contas MT5 (corretora)? Por omissão sim. */
  mt5_a_venda?: boolean
}

/** O que o checkout pode oferecer agora, pela ordem em que se mostra (recomendada primeiro). */
export function plataformasAVenda(cfg: ConfigPlataformas): Plataforma[] {
  const out: Plataforma[] = []
  if (cfg.sim_lancado_em) out.push('mtmfunded')
  if (cfg.mt5_a_venda !== false) out.push('mt5')
  return out
}

export type ValidacaoPlataforma = { ok: true; plataforma: Plataforma } | { ok: false; erro: string }

/**
 * Valida a escolha do checkout NO SERVIDOR. Sem escolha, fica a primeira disponível
 * (a recomendada). Uma plataforma que não está à venda é recusada — nunca trocada em silêncio.
 */
export function validarPlataformaDoCheckout(pedida: unknown, cfg: ConfigPlataformas): ValidacaoPlataforma {
  const disponiveis = plataformasAVenda(cfg)
  if (!disponiveis.length) return { ok: false, erro: 'Não há plataformas disponíveis neste momento' }
  const vazia = pedida == null || String(pedida).trim() === ''
  if (vazia) return { ok: true, plataforma: disponiveis[0] }
  const p = lerPlataforma(pedida)
  if (!p) return { ok: false, erro: 'Plataforma desconhecida' }
  if (!disponiveis.includes(p)) {
    return {
      ok: false,
      erro: p === 'mtmfunded'
        ? 'A plataforma MTM Funded ainda não está disponível'
        : 'As contas MT5 não estão disponíveis neste momento',
    }
  }
  return { ok: true, plataforma: p }
}

/**
 * O motor da conta de uma compra PAGA. `plataformaMeta` vem dos metadados do Stripe.
 * Sem plataforma (sessões anteriores a esta escolha) → regra antiga: lançado = sim.
 */
export function motorDaCompra(plataformaMeta: unknown, simLancado: boolean): Motor {
  const p = lerPlataforma(plataformaMeta)
  if (p === 'mtmfunded') return 'sim'
  if (p === 'mt5') return 'mt5'
  return simLancado ? 'sim' : 'mt5'
}

export function plataformaDoMotor(motor: unknown): Plataforma {
  return motor === 'sim' ? 'mtmfunded' : 'mt5'
}

/** Continuação (fase 2, financiada, renovação): herda o motor da conta anterior. */
export function motorDaContinuacao(anterior: { motor?: unknown } | null | undefined): Motor {
  return anterior?.motor === 'sim' ? 'sim' : 'mt5'
}

/**
 * O plano da emissão de uma compra paga: onde nasce a conta e o que acontece a seguir.
 * `sim` → activa já + credenciais por link seguro; `mt5` → pedido na fila do agente.
 */
export interface PlanoEmissao {
  motor: Motor
  plataforma: Plataforma
  /** Escreve pedido em `mtm_account_requests` (agente MT5 do VPS). */
  pedidoNaFila: boolean
  /** Envia o email de credenciais (login + link seguro, nunca a password). */
  enviarCredenciais: boolean
  /** Estado com que a conta nasce. */
  estadoInicial: 'ativa' | 'pedida'
}

export function planoDaEmissao(plataformaMeta: unknown, simLancado: boolean): PlanoEmissao {
  const motor = motorDaCompra(plataformaMeta, simLancado)
  return {
    motor,
    plataforma: plataformaDoMotor(motor),
    pedidoNaFila: motor === 'mt5',
    enviarCredenciais: motor === 'sim',
    estadoInicial: motor === 'sim' ? 'ativa' : 'pedida',
  }
}
