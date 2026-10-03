/**
 * AS LIGAÇÕES DO CENTRO — a mesma regra, lida nos dois sentidos.
 *
 * De uma conta chega-se ao utilizador, às cópias dela, à ESTRATÉGIA que segue e à APP onde está
 * ligada, sem voltar ao início. Faltavam as duas últimas: a ficha da estratégia sabia quais eram as
 * «contas a seguir» (com um filtro escrito à mão lá dentro), mas a ficha da conta mostrava as
 * estratégias como pastilhas mortas — os dados estavam lá, o caminho é que não.
 *
 * A regra de correspondência vive agora aqui, uma só vez, porque cada origem escreve a estratégia à
 * sua maneira:
 *   · conta do site    → o id da estratégia CopyFactory (copyfactory_strategy_pick);
 *   · conta MTM Auto   → «<nome do provider>» ou «<nome do provider> · auto» (a subscrição);
 *   · conta MTM Funded → o slug (segue_estrategia);
 *   · conta WebTrader  → nenhuma (é uma conta da corretora, não segue estratégia).
 *
 * Puro (sem React, sem base): testado em lib/admin-centro/__tests__/ligacoes.check.ts.
 */

export type OrigemConta = 'site' | 'auto' | 'wt' | 'funded'

/** O bocadinho de uma conta que chega para a ligar. */
export interface ContaLigavel {
  ref: string
  origem: OrigemConta
  estrategias: string[]
}

/** O bocadinho de uma estratégia que chega para a ligar. */
export interface EstrategiaLigavel {
  id: string
  slug: string
  nome: string
  estrategiaCf: string | null
}

const limpo = (s: string | null | undefined) => (s ?? '').trim()

/**
 * Esta conta segue esta estratégia? Nomes/slugs/ids vazios NUNCA ligam: um `nome` em branco fazia
 * `startsWith('')` dizer que sim a toda a gente.
 */
export function ligaContaAEstrategia(c: ContaLigavel, e: EstrategiaLigavel): boolean {
  const nome = limpo(e.nome)
  const slug = limpo(e.slug).toLowerCase()
  const cf = limpo(e.estrategiaCf)
  return c.estrategias.some((bruto) => {
    const s = limpo(bruto)
    if (!s) return false
    if (nome && s.startsWith(nome)) return true
    if (cf && s === cf) return true
    if (slug && s.toLowerCase() === slug) return true
    return false
  })
}

/** As estratégias que esta conta segue (para as pastilhas clicáveis da ficha da conta). */
export function estrategiasDaConta<E extends EstrategiaLigavel>(c: ContaLigavel, estrategias: E[]): E[] {
  return estrategias.filter((e) => ligaContaAEstrategia(c, e))
}

/** As contas que seguem esta estratégia (o que a ficha da estratégia já mostrava). */
export function contasDaEstrategia<C extends ContaLigavel>(e: EstrategiaLigavel, contas: C[]): C[] {
  return contas.filter((c) => ligaContaAEstrategia(c, e))
}

/**
 * O que a conta escreveu e não deu estratégia nenhuma — mostra-se como pastilha morta, mas agora
 * sabe-se que é morta de propósito (um provider apagado, uma estratégia CopyFactory antiga).
 */
export function estrategiasSemFicha(c: ContaLigavel, estrategias: EstrategiaLigavel[]): string[] {
  return c.estrategias.filter((bruto) => {
    const s = limpo(bruto)
    return Boolean(s) && !estrategias.some((e) => ligaContaAEstrategia({ ...c, estrategias: [s] }, e))
  })
}

export interface AppDaConta {
  chave: OrigemConta
  /** Como o dono lhe chama. */
  nome: string
  /** Onde a pessoa mexe nesta conta. */
  url: string
  nota: string
}

/** Onde é que esta conta vive para quem a ligou — a aresta que faltava no grafo do Centro. */
const APPS: Record<OrigemConta, AppDaConta> = {
  site: { chave: 'site', nome: 'MTM Copy (site)', url: '/mtmcopy', nota: 'Ligada no site para cópia e Tap to Trade.' },
  auto: { chave: 'auto', nome: 'MTM Auto', url: '/mtmauto', nota: 'Ligada na app MTM Auto (iOS, Android ou web).' },
  wt: { chave: 'wt', nome: 'WebTrader', url: '/webtrader', nota: 'Conta da corretora ligada no WebTrader — não segue estratégias.' },
  funded: { chave: 'funded', nome: 'MTM Funded', url: '/mtmfunded', nota: 'Conta MTM Funded (motor simulado ou MT5 da casa).' },
}

export const appDaConta = (origem: OrigemConta): AppDaConta => APPS[origem]
