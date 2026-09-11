import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * AS FONTES DE SINAL — uma lista só, derivada de quem as produz.
 *
 * Havia duas listas escritas à mão e não coincidiam: `lib/pips-proof.ts` conhecia
 * `goldkiller, mtmscanner, goldenmoves, golddid`, e a validação do Tap to Trade conhecia
 * `james, primeverse, aurum`. Um cliente podia escolher uma fonte que as provas ignoravam, e
 * as provas contavam fontes que ninguém podia escolher.
 *
 * A lista passa a sair de `mtmauto_providers` — a tabela onde as estratégias existem. Uma
 * estratégia nova aparece sozinha em todo o lado; uma desligada desaparece de todo o lado. É
 * isso que faz o T2T da app, o MTM System e o MTM Auto mostrarem o mesmo.
 *
 * As fontes que NÃO são providers (perps, james, primeverse) continuam válidas e estão aqui
 * marcadas: vêm de fora e não têm conta mestre, mas produzem sinais que o T2T entrega.
 */

export interface FonteSinal {
  /** A chave com que aparece nos sinais e nas escolhas do cliente. */
  chave: string
  nome: string
  /** Tem conta mestre e estratégia CopyFactory própria. */
  temEstrategia: boolean
  slugProvider: string | null
  ativa: boolean
  /** Entregue pelo Tap to Trade. */
  t2t: boolean
}

/**
 * Fontes sem provider próprio — externas, mas que produzem sinais medidos.
 *
 * Os nomes vêm de `lib/pips-proof`, que é quem os escreve nos flyers semanais e nas provas.
 * Repeti-los aqui faria a mesma fonte chamar-se «Aurum Flow» num sítio e «Golden Moves»
 * noutro — que é exactamente o que acontecia antes de esta lista existir.
 */
const EXTERNAS: Array<Omit<FonteSinal, 'temEstrategia' | 'slugProvider'>> = [
  { chave: 'primeverse', nome: 'PrimeVerse', ativa: true, t2t: true },
  { chave: 'james', nome: 'Forex Swings', ativa: true, t2t: false },
  { chave: 'perps', nome: 'Perpétuos Cripto', ativa: true, t2t: true },
]

/** A chave de sinal de um provider — `fonte_mtm` quando existe, senão derivada do slug. */
export function chaveDoProvider(slug: string, fonteMtm: string | null): string {
  if (fonteMtm) return fonteMtm
  const mapa: Record<string, string> = {
    'premium-ouro': 'premium',
    sensei: 'sensei',
    Goldkiller: 'goldkiller',
    'mtm-scanner': 'mtmscanner',
    'golden-moves': 'aurum',
    'golden-moves-fonte': 'goldenmoves',
    'gold-did-premium': 'golddid',
    'mtm-auto-golden-astro': 'goldenastro',
  }
  return mapa[slug] ?? slug
}

export async function fontesDeSinal(): Promise<FonteSinal[]> {
  const db = getSupabaseAdmin()
  const { data: providers } = await db
    .from('mtmauto_providers')
    .select('slug, nome, ativo, fonte_mtm, tipo')
    .order('nome')

  const dosProviders: FonteSinal[] = (providers ?? []).map((p) => ({
    chave: chaveDoProvider(p.slug as string, p.fonte_mtm as string | null),
    nome: (p.nome as string) ?? (p.slug as string),
    temEstrategia: true,
    slugProvider: p.slug as string,
    ativa: Boolean(p.ativo),
    // `mtm_t2t` é o tipo que marca as fontes entregues pelo Tap to Trade.
    t2t: p.tipo === 'mtm_t2t',
  }))

  const externas: FonteSinal[] = EXTERNAS.map((e) => ({ ...e, temEstrategia: false, slugProvider: null }))

  /**
   * E as fontes que os FLYERS já medem.
   *
   * `lib/pips-proof` conhece as chaves que aparecem nos sinais medidos e nos flyers semanais.
   * Uma fonte que produz pips contados numa peça publicada e não existe nesta lista é uma
   * fonte que o cliente não pode escolher e que as provas contam à mesma — a assimetria que
   * havia entre as duas listas escritas à mão.
   */
  const { NOME_FONTE } = await import('@/lib/pips-proof')
  const dosFlyers: FonteSinal[] = Object.entries(NOME_FONTE).map(([chave, nome]) => ({
    chave,
    nome: String(nome),
    temEstrategia: false,
    slugProvider: null,
    ativa: true,
    t2t: false,
  }))

  // Uma chave só aparece uma vez, e manda a fonte mais informada: o provider (que tem conta e
  // estratégia) ganha à externa, e a externa ganha à entrada só-de-nome dos flyers.
  const vistas = new Set<string>()
  const saida: FonteSinal[] = []
  for (const f of [...dosProviders, ...externas, ...dosFlyers]) {
    if (vistas.has(f.chave)) continue
    vistas.add(f.chave)
    saida.push(f)
  }
  return saida
}

/** As chaves que um cliente pode escolher no Tap to Trade. */
export async function chavesT2TValidas(): Promise<string[]> {
  const fontes = await fontesDeSinal()
  return fontes.filter((f) => f.t2t || !f.temEstrategia).map((f) => f.chave)
}
