import type { ContaCentro } from './servidor/contas'

/**
 * Uma conta de corretora, uma linha.
 *
 * A mesma conta MT5 chega ao centro por até quatro caminhos: a ligação do site (T2T), a do MTM Auto,
 * a do WebTrader e — se for MTM Funded — a própria conta do motor. Eram quatro linhas iguais na
 * lista, e o dono lia «4 contas» onde havia uma. Agora junta-se pela conta (plataforma + login + dono)
 * e as ligações ficam penduradas na linha, cada uma com a sua gaveta e as suas acções.
 *
 * O dono entra na chave de propósito: logins MT5 repetem-se entre corretoras, e o mesmo número em
 * duas pessoas são duas contas. Sem login (TradeLocker por emitir, Funded por emitir) a linha fica só.
 */
export type ContaAgrupada = ContaCentro & { ligacoes: ContaCentro[] }

/** Qual das ligações representa a conta: a Funded tem o saldo do motor; a do site tem o T2T. */
const PESO: Record<ContaCentro['origem'], number> = { funded: 4, site: 3, auto: 2, wt: 1 }

export function chaveDaConta(c: ContaCentro): string {
  // Uma ligação T2T/MTM Auto a uma Funded é a Funded — muitas não guardam login, e ficavam soltas,
  // numa linha sem gestão (a gestão da conta é a ficha Funded).
  if (c.fundedId) return `funded:${c.fundedId}`
  if (!c.login) return c.ref
  return `${c.plataforma}:${c.login.trim()}:${c.userId ?? (c.servidor ?? '').trim().toLowerCase()}`
}

const unir = (a: string[], b: string[]) => [...new Set([...a, ...b])]
const maisRecente = (a: string | null | undefined, b: string | null | undefined) => (!a ? b ?? null : !b ? a : a > b ? a : b)

export function agruparContas(contas: ContaCentro[]): ContaAgrupada[] {
  const grupos = new Map<string, ContaCentro[]>()
  for (const c of contas) {
    const k = chaveDaConta(c)
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }
  const saida: ContaAgrupada[] = []
  for (const lista of grupos.values()) {
    const ordenadas = [...lista].sort((a, b) => PESO[b.origem] - PESO[a.origem])
    const [principal, ...resto] = ordenadas
    let usos = principal.usos
    let estrategias = principal.estrategias
    let ultima = principal.ultimaActividade ?? null
    for (const o of resto) {
      usos = unir(usos, o.usos)
      estrategias = unir(estrategias, o.estrategias)
      ultima = maisRecente(ultima, o.ultimaActividade)
    }
    // O saldo fica o da principal; só se ela não tiver nenhum é que vem o de outra ligação — e vem
    // inteiro (fonte, partida, linha de água, proveniência), para nunca juntar o número de uma com a
    // percentagem de outra.
    const s = principal.saldo != null ? principal : ordenadas.find((o) => o.saldo != null) ?? principal
    saida.push({
      ...principal,
      usos,
      estrategias,
      ultimaActividade: ultima,
      ativa: ordenadas.some((o) => o.ativa),
      saldo: s.saldo,
      saldoFonte: s.saldoFonte,
      saldoLidoEm: s.saldoLidoEm ?? null,
      saldoInicial: s.saldoInicial,
      linhaDeAgua: s.linhaDeAgua,
      proveniencia: s.proveniencia,
      equity: s.equity,
      ligacoes: ordenadas,
    })
  }
  return saida
}
