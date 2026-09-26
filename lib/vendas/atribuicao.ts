/**
 * A QUEM PERTENCE ESTE PAGAMENTO — escolher o negócio de quem acabou de pagar.
 *
 * PORQUE É QUE ISTO EXISTE
 * O livro (`lib/vendas/livro.ts`) e a exclusividade (`lib/vendas/exclusividade.ts`) procuravam o
 * negócio do comprador por `vendas_negocios.comprador_id` — e só por aí. Na base, a 26/09, essa
 * coluna estava a NULL em 97 negócios de 97, incluindo 80 que tinham o id do perfil escrito por
 * extenso na `chave_origem` (`perfil:<uuid>`). Ou seja: o pagamento entrava, o livro não achava
 * negócio nenhum, e quem trabalhou a venda não recebia. Não era uma regra mal calculada — era uma
 * ligação que nunca se fazia.
 *
 * As duas portas TÊM de decidir igual. Se o livro encontrasse equipa e a exclusividade não, o
 * mesmo euro pagava duas vezes (tabela de papéis + binário); ao contrário, não pagava a ninguém.
 * Por isso a decisão vive aqui, num sítio só, e este ficheiro é PURO: recebe os candidatos já
 * lidos e devolve a escolha. Quem lê a base é `lib/vendas/atribuicao-leitura.ts`.
 *
 * O QUE ISTO NUNCA FAZ: adivinhar. Um pagamento que bate em dois negócios diferentes sai marcado
 * `ambiguo` e sem escolha — porque escolher ao palpite paga à pessoa errada e tira a outra, e isso
 * não se desfaz com um deploy. Fica para um humano ver no admin.
 */

/** Um negócio candidato, com o mínimo que a decisão precisa de saber. */
export type NegocioCandidato = {
  id: string
  estado: string | null
  /** Ligação já feita antes — é a prova mais forte que existe. */
  comprador_id: string | null
  email: string | null
  /** Como o lead entrou. `perfil:<uuid>` traz o id do perfil por extenso. */
  chave_origem: string | null
  /** Serve só para desempatar entre candidatos igualmente válidos: fica o mais trabalhado. */
  atualizado_em?: string | null
}

/** Por onde é que se chegou ao negócio. Fica gravado para o admin poder discordar com fundamento. */
export type ViaDaAtribuicao = 'comprador' | 'chave_perfil' | 'email'

export type ResolucaoNegocio = {
  negocioId: string | null
  via: ViaDaAtribuicao | null
  /** Dois ou mais negócios diferentes com o mesmo direito. Não se escolhe — pergunta-se. */
  ambiguo: boolean
  /** Em palavras, para aparecer no admin em vez de um silêncio. */
  motivo: string
}

/**
 * O estado que desqualifica um negócio.
 *
 * Um negócio perdido não paga a ninguém, mesmo que a pessoa volte e compre: quem desistiu dela
 * não a trouxe de volta. É a mesma exclusão que as duas portas já faziam com `.neq('estado', …)`,
 * repetida aqui porque agora a escolha é desta função e não da consulta.
 */
const ESTADO_QUE_NAO_PAGA = 'perdido'

/** Prefixo da `chave_origem` dos leads que nasceram de um perfil do site (migração 135). */
const PREFIXO_PERFIL = 'perfil:'

/**
 * O id do perfil escondido na `chave_origem`.
 *
 * Não é uma heurística: quem escreveu a chave tinha o uuid do perfil na mão e escreveu-o. Lê-se de
 * volta e confirma-se o formato — um `perfil:` com lixo atrás não é ligação nenhuma.
 */
export function idDePerfilNaChaveOrigem(chave: string | null | undefined): string | null {
  if (typeof chave !== 'string' || !chave.startsWith(PREFIXO_PERFIL)) return null
  const resto = chave.slice(PREFIXO_PERFIL.length).trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(resto) ? resto : null
}

/**
 * Emails comparam-se sem maiúsculas e sem espaços — e nada mais.
 *
 * Deliberadamente não se mexe em pontos nem em `+alias`: normalizar à maneira do Gmail faria dois
 * emails diferentes parecerem a mesma pessoa, e é exactamente aí que uma comissão vai para a mão
 * errada.
 */
export function emailComparavel(email: string | null | undefined): string | null {
  const limpo = typeof email === 'string' ? email.trim().toLowerCase() : ''
  return limpo || null
}

/** Entre candidatos igualmente válidos fica o mais recentemente trabalhado. */
function maisRecente(candidatos: NegocioCandidato[]): NegocioCandidato {
  return [...candidatos].sort((a, b) => String(b.atualizado_em ?? '').localeCompare(String(a.atualizado_em ?? '')))[0]
}

/**
 * O negócio deste comprador, por ordem de força da prova.
 *
 * 1. `comprador_id` — alguém (ou este código) já ligou as duas coisas.
 * 2. `chave_origem = perfil:<id>` — o uuid está escrito na linha; não há nada a adivinhar.
 * 3. email igual — e só quando há UM único negócio com esse email. É identidade, não palpite: o
 *    lead deu este email e é com este email que a pessoa pagou. Com dois candidatos pára.
 *
 * O email é o degrau que fecha o buraco do dia-a-dia: um setter põe o lead no pipeline pelo email,
 * a pessoa registou-se e pagou uma semana depois, e até hoje nada ligava as duas pontas.
 */
export function escolherNegocio(
  candidatos: NegocioCandidato[],
  compradorId: string | null | undefined,
  /**
   * Os emails por que esta pessoa é conhecida. São mais do que um porque o email com que se paga no
   * Stripe não é sempre o email da conta do site — e era pelo email do lead que o negócio tinha de
   * ser encontrado. Basta um deles bater.
   */
  emailsDoComprador: string | string[] | null | undefined,
): ResolucaoNegocio {
  const vivos = candidatos.filter((c) => c.estado !== ESTADO_QUE_NAO_PAGA)
  if (vivos.length === 0) {
    return { negocioId: null, via: null, ambiguo: false, motivo: 'Não há negócio aberto para esta pessoa.' }
  }

  const comprador = typeof compradorId === 'string' && compradorId ? compradorId.toLowerCase() : null

  if (comprador) {
    const porComprador = vivos.filter((c) => (c.comprador_id ?? '').toLowerCase() === comprador)
    if (porComprador.length > 0) {
      return {
        negocioId: maisRecente(porComprador).id,
        via: 'comprador',
        ambiguo: false,
        motivo: 'Negócio já ligado a este comprador.',
      }
    }

    const porChave = vivos.filter((c) => idDePerfilNaChaveOrigem(c.chave_origem) === comprador)
    if (porChave.length > 0) {
      return {
        negocioId: maisRecente(porChave).id,
        via: 'chave_perfil',
        ambiguo: false,
        motivo: 'Negócio criado a partir do perfil deste comprador (chave de origem).',
      }
    }
  }

  const emails = new Set(
    (Array.isArray(emailsDoComprador) ? emailsDoComprador : [emailsDoComprador])
      .map(emailComparavel)
      .filter((e): e is string => !!e),
  )
  if (emails.size > 0) {
    const porEmail = vivos.filter((c) => {
      const e = emailComparavel(c.email)
      return e !== null && emails.has(e)
    })
    const distintos = new Set(porEmail.map((c) => c.id))
    if (distintos.size === 1) {
      return {
        negocioId: porEmail[0].id,
        via: 'email',
        ambiguo: false,
        motivo: 'Negócio com o mesmo email do comprador.',
      }
    }
    if (distintos.size > 1) {
      return {
        negocioId: null,
        via: null,
        ambiguo: true,
        motivo: `Há ${distintos.size} negócios abertos com o email deste comprador: quem recebe tem de ser decidido por uma pessoa.`,
      }
    }
  }

  return { negocioId: null, via: null, ambiguo: false, motivo: 'Não há negócio que corresponda a este comprador.' }
}
