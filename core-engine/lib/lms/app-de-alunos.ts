/**
 * A APP DE ALUNOS DE UM CANAL — o que se mostra a quem chega, e porquê.
 *
 * ═══ O PROBLEMA ════════════════════════════════════════════════════════════════════════════
 *
 * Alguns canais têm uma aplicação à parte onde vivem as aulas do curso. O primeiro é o "She Is
 * Faceless", cujas aulas estão em alunosfa.lovable.app. Quem entra no canal e vê o link clica —
 * e, se não for aluna, cai num ecrã de entrada que nunca vai passar. Não há erro nenhum; a pessoa
 * conclui que o site está partido, e desiste.
 *
 * ═══ A PARTE QUE SE PERCEBE TARDE DEMAIS ═══════════════════════════════════════════════════
 *
 * O reflexo era pôr um cadeado: deixa entrar quem comprou, manda comprar quem não comprou. Não dá,
 * e é melhor dizer porquê do que deixar alguém tentar outra vez:
 *
 * **este curso cobra-se FORA.** O checkout é a loja da própria academia, o dinheiro nunca passa
 * pela MTM, e `marketplace_compras` nunca vê a venda. Ou seja: `jaComprou` é FALSO para toda a
 * gente, inclusive para quem pagou ontem. Um cadeado construído sobre esse campo mandava comprar
 * outra vez quem já era aluna — que é pior do que não ter cadeado nenhum.
 *
 * Por isso a resposta, quando a compra é lá fora, são sempre DUAS PORTAS e nenhuma afirmação sobre
 * quem a pessoa é: «já sou aluna, entrar» e «quero o curso». O ecrã diz o que sabe — que o acesso
 * vem com a compra — e não finge saber o resto.
 *
 * Quando um dia um curso destes se vender AQUI, aí sabemos, e aí a porta é uma só. É esse o ramo
 * `jaComprou === true`, que hoje não acontece a ninguém e existe para quando acontecer.
 */

export interface CanalComApp {
  /** O endereço da aplicação dos alunos. Sem ele, não há nada a mostrar. */
  app_alunos_url?: string | null
  /** O produto do marketplace que dá o acesso. Sem ele, não se sabe para onde mandar comprar. */
  app_alunos_produto_slug?: string | null
}

export interface ProdutoDoAcesso {
  slug: string
  titulo: string
  preco_cents: number
  moeda?: string | null
  /** Vendido fora de portas: se tiver endereço externo, a venda não passa por nós. */
  checkout_externo_url?: string | null
  /** Só é de confiar quando a venda passa por nós. Ver o cabeçalho. */
  jaComprou?: boolean | null
}

export type Porta =
  /** Este canal não tem app — não se mostra nada. */
  | { mostrar: false }
  /** Sabemos que tem acesso: uma porta só. */
  | { mostrar: true; modo: 'entra'; appUrl: string }
  /** Não sabemos (ou não tem): duas portas, sem afirmar nada sobre a pessoa. */
  | { mostrar: true; modo: 'duas_portas'; appUrl: string; produtoHref: string | null; sabemosQuemEAluna: boolean }

function endereco(url: unknown): string | null {
  const s = String(url ?? '').trim()
  // Só absolutos: um caminho relativo aqui seria uma página nossa, e isto é por definição fora.
  return /^https?:\/\//i.test(s) ? s : null
}

/** A venda deste produto passa por nós? Se não passa, não temos como saber quem comprou. */
export function vendaPassaPorNos(produto: ProdutoDoAcesso | null | undefined): boolean {
  if (!produto) return false
  return !endereco(produto.checkout_externo_url)
}

export function portaDaApp(
  canal: CanalComApp | null | undefined,
  produto: ProdutoDoAcesso | null | undefined,
): Porta {
  const appUrl = endereco(canal?.app_alunos_url)
  if (!appUrl) return { mostrar: false }

  /**
   * `jaComprou` só vale quando a venda passou por nós. Ler este campo num produto de checkout
   * externo é lê-lo sempre a falso — e era assim que se mandava comprar outra vez quem já pagou.
   */
  const sabemos = vendaPassaPorNos(produto)
  if (sabemos && produto?.jaComprou === true) {
    return { mostrar: true, modo: 'entra', appUrl }
  }

  const slug = String(canal?.app_alunos_produto_slug ?? '').trim()
  return {
    mostrar: true,
    modo: 'duas_portas',
    appUrl,
    produtoHref: slug ? `/marketplace/${slug}` : null,
    sabemosQuemEAluna: sabemos,
  }
}

/**
 * A frase que explica o acesso. Muda com o que sabemos, porque dizer sempre o mesmo era mentir
 * numa das duas situações.
 */
export function textoDoAcesso(porta: Porta, tituloDoCurso?: string | null): string {
  if (!porta.mostrar) return ''
  if (porta.modo === 'entra') return 'Já tens acesso a esta app.'
  const curso = String(tituloDoCurso ?? '').trim() || 'o curso'
  return porta.sabemosQuemEAluna
    ? `O acesso a esta app vem com ${curso}.`
    : `O acesso a esta app vem com ${curso}, e a compra faz-se na loja da academia — por isso o site não consegue saber se já és aluna. Se já compraste, entra; se ainda não, o curso está aqui.`
}
