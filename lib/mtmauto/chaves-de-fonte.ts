/**
 * A CHAVE com que uma estratégia aparece no registo de sinais.
 *
 * `mtmcopy_signal_tracking` tem duas colunas que parecem a mesma coisa e não são:
 *
 *   · `source_key`   — QUEM produziu o sinal: `premium`, `sensei`, `goldkiller`, `mtmscanner`…
 *   · `channel_slug` — ONDE ele foi publicado: `premium-ideas`, `sensei-scanner`, `cripto-perps`…
 *
 * São vocabulários diferentes e nenhum valor de um existe no outro. Medir desempenho é uma
 * pergunta sobre QUEM produziu, por isso a chave certa é sempre a `source_key` — e foi
 * confundi-las que pôs o retrato de todas as fontes T2T a zeros: o ecrã pedia `premium` e a
 * consulta procurava-o em `channel_slug`, onde está escrito `premium-ideas`.
 *
 * O mapa vive aqui e só aqui. Existia copiado em dois módulos, e as cópias já tinham divergido:
 * uma conhecia os dois nomes da Gold Did, a outra só um — a mesma estratégia media-se diferente
 * conforme o ecrã que a perguntava.
 *
 * Cada slug pode ter MAIS DO QUE UMA chave. Não é indecisão: são nomes que a mesma fonte teve
 * ao longo do tempo, e as linhas antigas ficaram gravadas com o nome antigo. Descartá-las era
 * apagar o passado da estratégia de cada vez que ela muda de nome.
 */

const ALIASES: Record<string, string[]> = {
  'premium-ouro': ['premium'],
  sensei: ['sensei'],
  Goldkiller: ['goldkiller'],
  'mtm-scanner': ['mtmscanner'],
  // A Aurum Flow publica nos perpétuos de cripto; `golden-moves` é o slug herdado do nome antigo.
  'golden-moves': ['aurum'],
  'golden-moves-fonte': ['goldenmoves'],
  'gold-did-premium': ['golddid', 'gold-did'],
  'mtm-auto-golden-astro': ['goldenastro', 'golden-astro'],
}

/**
 * Todas as chaves por que uma estratégia pode ter sido gravada.
 *
 * `fonte_mtm` ganha ao mapa quando existe: é o campo que o admin preenche à mão e é ele que
 * manda quando alguém decidiu explicitamente por onde a estratégia se mede.
 */
export function chavesDaFonte(slug: string, fonteMtm?: string | null): string[] {
  if (fonteMtm) return [fonteMtm]
  return ALIASES[slug] ?? [slug]
}

/** A chave PRINCIPAL — a que se mostra e se escreve. As outras só servem para ler o passado. */
export function chaveDaFonte(slug: string, fonteMtm?: string | null): string {
  return chavesDaFonte(slug, fonteMtm)[0]
}
