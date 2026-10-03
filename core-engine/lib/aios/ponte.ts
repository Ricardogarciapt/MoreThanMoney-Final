/**
 * A PONTE DO AIOS PARA O CLAUDE CODE LOCAL — as decisões, sem rede e sem processos.
 *
 * ═══ O QUE ESTA PONTE É, E PORQUE É QUE ISTO TEM DE SER LEVADO A SÉRIO ═════════════════════
 *
 * O AIOS corre na Vercel. As 25 skills (graphify, ui-ux-pro-max, design-system, mtm-executive-os…)
 * vivem no computador do dono, instaladas no Claude Code. Para o AIOS as poder usar, alguma coisa
 * tem de correr o `claude` nessa máquina — e **um servidor que corre o `claude` é um servidor que
 * executa código arbitrário no computador de alguém**.
 *
 * Por isso as regras de quem pode falar com ela não são configuração: são a própria ponte. E erram
 * em silêncio — uma origem a mais na lista não dá erro nenhum, só abre a porta a qualquer página
 * que o dono visite enquanto a ponte está de pé. É o tipo de defeito que se descobre tarde e mal.
 *
 * Três camadas, e todas têm de passar:
 *
 *  1. **Escuta só em 127.0.0.1.** Nunca 0.0.0.0. Isto não se decide aqui (é do servidor), mas está
 *     escrito aqui porque é a primeira coisa que alguém vai querer mudar para «testar do telemóvel»
 *     — e nesse momento a ponte passa a aceitar a rede local inteira.
 *  2. **Origem na lista.** Um `Origin` que não esteja na lista é recusado antes de se ler o corpo.
 *  3. **Segredo partilhado.** Comparado em tempo constante, porque comparar strings com `===` conta
 *     o tempo e deixa adivinhar o segredo carácter a carácter.
 *
 * Puro para `ponte.check.ts` poder atirar-lhe origens falsas e segredos quase certos sem levantar
 * servidor nenhum.
 */

/** As origens que podem falar com a ponte. Qualquer outra é recusada. */
export const ORIGENS_PERMITIDAS = [
  'https://www.morethanmoney.pt',
  'https://morethanmoney.pt',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]

/** Quanto tempo um pedido pode demorar. O Claude Code pensa; não pensa meia hora. */
export const TEMPO_LIMITE_MS = 10 * 60 * 1000

/** O tamanho máximo de um pedido. Um prompt não tem megabytes. */
export const PEDIDO_MAX = 32_000

export interface Veredicto {
  pode: boolean
  /** Código curto para os registos. */
  codigo: string
  /** A frase que aparece no ecrã, em português. */
  porque: string
}

/**
 * Comparação em tempo constante.
 *
 * `a === b` pára no primeiro carácter diferente, e a diferença de tempo entre «errou no primeiro»
 * e «errou no último» é mensurável. Com paciência, isso adivinha-se. Aqui percorre-se sempre tudo.
 */
export function segredosIguais(a: string, b: string): boolean {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x.length === 0 || y.length === 0) return false
  // Comprimentos diferentes já falham, mas percorre-se na mesma para o tempo não os distinguir.
  let diferenca = x.length === y.length ? 0 : 1
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) {
    diferenca |= (x.charCodeAt(i % x.length) ?? 0) ^ (y.charCodeAt(i % y.length) ?? 0)
  }
  return diferenca === 0
}

export function origemPermitida(origem: string | null | undefined): boolean {
  if (!origem) return false
  return ORIGENS_PERMITIDAS.includes(String(origem).trim().replace(/\/$/, ''))
}

/**
 * PODE ESTE PEDIDO CORRER?
 *
 * A ordem importa: recusa-se pela origem ANTES de olhar para o segredo, e pelo segredo antes de
 * olhar para o conteúdo. Quem não devia estar a falar connosco não chega a ver o que validamos a
 * seguir.
 */
export function podeCorrer(p: {
  origem?: string | null
  segredoRecebido?: string | null
  segredoEsperado?: string | null
  pedido?: string | null
}): Veredicto {
  if (!origemPermitida(p.origem)) {
    return {
      pode: false,
      codigo: 'origem_recusada',
      porque: `A origem «${p.origem ?? 'nenhuma'}» não está na lista da ponte.`,
    }
  }
  if (!p.segredoEsperado) {
    return {
      pode: false,
      codigo: 'ponte_sem_segredo',
      porque: 'A ponte arrancou sem segredo. Sem ele, qualquer página aberta no browser podia mandá-la correr comandos.',
    }
  }
  if (!segredosIguais(String(p.segredoRecebido ?? ''), String(p.segredoEsperado))) {
    return { pode: false, codigo: 'segredo_errado', porque: 'Segredo inválido.' }
  }
  const pedido = String(p.pedido ?? '').trim()
  if (!pedido) return { pode: false, codigo: 'pedido_vazio', porque: 'Não veio pedido nenhum.' }
  if (pedido.length > PEDIDO_MAX) {
    return { pode: false, codigo: 'pedido_grande', porque: `O pedido tem ${pedido.length} caracteres; o máximo é ${PEDIDO_MAX}.` }
  }
  return { pode: true, codigo: 'ok', porque: 'Pedido aceite.' }
}

/**
 * Os argumentos com que a ponte chama o `claude`.
 *
 * **O pedido NUNCA entra na linha de comandos.** Vai pelo stdin. Uma string de utilizador numa
 * linha de comandos é uma injeção à espera de acontecer, e aqui a injeção dava execução na máquina
 * do dono — a pior consequência possível. Este array nunca contém texto vindo de fora, só
 * constantes e um identificador de sessão que esta função valida.
 *
 * `--permission-mode acceptEdits` e não `--dangerously-skip-permissions`: a ponte pode escrever no
 * repositório, que é o ponto todo de a ter, mas não leva o Claude a correr comandos destrutivos sem
 * ninguém ver. Quem quiser mais dá-o explicitamente no terminal, com a sessão à frente.
 *
 * ═══ A LISTA DE FERRAMENTAS NÃO É BUROCRACIA ═══════════════════════════════════════════════
 *
 * Do lado do AIOS **não há ninguém ao teclado para aprovar nada**. Sem lista, o Claude Code pede
 * autorização para correr um `git status`, ninguém responde, e ele acaba por responder de memória —
 * foi o que aconteceu no primeiro teste real: deu o ramo e o commit certos a partir do retrato do
 * arranque da sessão, e disse-o. Uma ferramenta que responde de cor quando devia ler é pior do que
 * uma que falha, porque parece que funcionou.
 *
 * A lista dá-lhe o que precisa para LER (ficheiros, procura, git de leitura, typecheck, guardas) e
 * deixa de fora tudo o que muda o mundo lá fora: `git push`, `git commit`, `rm`, `curl`, deploys.
 * Isso continua a precisar de alguém ao teclado — e é no terminal que esse alguém está.
 */
export const FERRAMENTAS_PERMITIDAS = [
  'Read', 'Grep', 'Glob', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite', 'Task', 'WebFetch', 'WebSearch',
  'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git branch:*)', 'Bash(git show:*)',
  'Bash(npx tsc:*)', 'Bash(npx tsx:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)',
  'Bash(wc:*)', 'Bash(find:*)', 'Bash(grep:*)',
]

export function argumentosDoClaude(p: { continuar?: boolean; sessao?: string | null }): string[] {
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', FERRAMENTAS_PERMITIDAS.join(','),
  ]
  // Continuar a conversa anterior em vez de começar do zero a cada pergunta — é o que faz o AIOS
  // parecer uma conversa e não uma máquina de pedidos soltos.
  const sessao = String(p.sessao ?? '').trim()
  if (sessao && /^[a-zA-Z0-9-]{8,64}$/.test(sessao)) {
    args.push('--resume', sessao)
  } else if (p.continuar) {
    args.push('--continue')
  }
  return args
}

/**
 * O que se extrai de cada linha do `stream-json` do Claude Code.
 *
 * Devolve `null` para tudo o que não seja texto para mostrar. O formato traz linhas de sistema, de
 * uso de ferramentas e de resultado; mandar isso para o ecrã do AIOS enchia-o de ruído.
 */
export function textoDaLinha(linha: string): { texto?: string; sessao?: string; fim?: boolean } | null {
  const bruto = linha.trim()
  if (!bruto) return null
  let o: Record<string, unknown>
  try { o = JSON.parse(bruto) } catch { return null }

  const tipo = String(o.type ?? '')
  /**
   * SÓ o `init` traz a sessão. O Claude Code emite dezenas de linhas `system` por pedido —
   * `hook_started`, `hook_response`, e um `commands_changed` com as 25 skills inteiras de cada vez
   * que o catálogo muda. Devolver a sessão em todas enchia o stream do AIOS com o mesmo valor
   * repetido vinte vezes, e escondia o texto no meio do ruído. Foi o que aconteceu no primeiro
   * teste real desta ponte.
   */
  if (tipo === 'system') {
    return o.subtype === 'init' && o.session_id ? { sessao: String(o.session_id) } : null
  }
  if (tipo === 'result') {
    return { fim: true, ...(o.session_id ? { sessao: String(o.session_id) } : {}) }
  }
  if (tipo === 'assistant') {
    const msg = o.message as { content?: Array<{ type?: string; text?: string }> } | undefined
    const texto = (msg?.content ?? [])
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('')
    return texto ? { texto } : null
  }
  return null
}
