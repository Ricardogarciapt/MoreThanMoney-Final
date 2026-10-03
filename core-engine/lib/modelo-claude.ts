/**
 * QUE MODELO USAR — num sítio só.
 *
 * Estava escrito à mão em oito ficheiros, com `claude-sonnet-4-5` como recurso. Esse id deixou
 * de existir, e o sintoma foi o pior possível: um 404 da API traduzido em «não consegui escrever
 * os textos», sem nada a dizer que o problema era o nome do modelo.
 *
 * E o valor na configuração estava `"claude-sonnet-4-5\n"` — com a barra e o `n` LITERAIS, não
 * uma quebra de linha. O `.trim()` não os apanha, porque não são espaço nenhum: são dois
 * caracteres que fazem parte do nome do modelo que se está a pedir.
 *
 * Por isso esta função faz duas coisas que ninguém se lembra de fazer à mão: limpa o valor a
 * sério, e tem um recurso que existe.
 */

/** O que se usa quando nada está configurado. */
const OMISSAO = 'claude-sonnet-5'

/** Ids que já não existem. Configurados, são ignorados em vez de darem 404. */
const MORTOS = new Set([
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
])

function limpar(v: string | undefined): string | null {
  if (!v) return null
  // Tira aspas, espaços e as sequências `\n`/`\r` ESCRITAS à mão — que é como elas chegam de
  // um painel de configuração onde alguém colou uma linha inteira.
  const s = v.replace(/\\[rn]/g, '').replace(/["']/g, '').trim()
  if (!s || MORTOS.has(s)) return null
  return s
}

/**
 * O modelo para uma tarefa. `especifico` é a variável dedicada dessa tarefa, quando existe —
 * assim uma delas pode usar um modelo mais barato sem arrastar as outras.
 */
export function modeloClaude(especifico?: string): string {
  return limpar(especifico) ?? limpar(process.env.ANTHROPIC_MODEL) ?? OMISSAO
}
