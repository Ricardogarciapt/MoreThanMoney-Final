/**
 * QUEM PODE RECEBER UMA CAMPANHA — e a razão de isto ser um ficheiro e não um `if`.
 *
 * O QUE ESTAVA MAL A 26/09
 * A base tem 187 emails distintos e a tabela `email_preferences` — o único sítio onde consentimento
 * de marketing podia estar registado — tem ZERO linhas. Ou seja: não há uma única pessoa nesta casa
 * de quem se consiga provar que pediu para receber campanhas.
 *
 * O caminho de envio que já existe (`app/api/email-marketing/campaigns`) resolve isso da pior
 * maneira possível: filtra pelas preferências EXCEPTO quando a campanha é marcada
 * `type: 'transactional'`, e nesse caso manda a todos sem olhar. Uma campanha de vendas marcada
 * como transacional passa por ali sem travão nenhum.
 *
 * Este ficheiro é o travão, e é PURO de propósito — recebe o que se sabe de uma pessoa e devolve
 * uma decisão, sem tocar na base nem em rede. É isso que permite prendê-lo com guardas
 * (`captacao-consentimento.check.ts`) em vez de o descobrir errado depois de 187 emails terem
 * saído.
 *
 * A REGRA, EM UMA LINHA
 * O silêncio é NÃO. Ausência de registo nunca é permissão. Não é zelo: uma lista «engordada» com
 * endereços que nunca pediram nada dá queixas de spam, e as queixas queimam o domínio que a MTM usa
 * para falar com os clientes que PAGAM. O custo de mandar a mais não é um email a mais — é perder
 * o canal.
 */

/** As bases pelas quais se pode ter o contacto de alguém. Ver a tabela `captacao_consentimento`. */
export type BaseLegal = 'consentimento' | 'relacao_contratual' | 'sem_base'

/**
 * Para que serve o email que se quer mandar.
 *
 * Esta distinção é a única coisa que separa um sistema legal de um ilegal, e por isso é um
 * parâmetro obrigatório em vez de um valor por omissão:
 *
 * · 'servico'   — é sobre o que a pessoa já tem: a renovação que lhe vai ser debitada, o acesso que
 *                 expira, um incidente na conta dela. Vai a quem é cliente, tenha pedido ou não,
 *                 porque não lhe mandar isto era pior do que mandar.
 * · 'campanha'  — é venda, é conteúdo, é reactivação. Exige consentimento. Sem excepções, e em
 *                 particular sem a excepção de «mas este é um cliente antigo».
 */
export type FinalidadeEmail = 'servico' | 'campanha'

/** O que se sabe de uma pessoa no momento de decidir. */
export interface PessoaParaDecidir {
  email: string | null
  /** A última palavra dela no livro do consentimento, se houver alguma. */
  baseLegal: BaseLegal | null
  /** Retirou o consentimento em algum momento. Ganha sempre a tudo o resto. */
  retirou: boolean
  /** É cliente pagante desta casa, agora. Só releva para emails de serviço. */
  ehCliente: boolean
}

export interface Decisao {
  pode: boolean
  /** Em português, porque isto aparece ao lado do nome na lista que o Ricardo revê. */
  porque: string
}

/**
 * Um email só é utilizável se for plausivelmente um email.
 *
 * Não se valida a existência da caixa (isso não se faz com uma expressão regular), valida-se que
 * não é lixo. Um endereço malformado numa lista de envio não é uma linha inofensiva: é um bounce, e
 * bounces a mais são exactamente o que faz um domínio começar a cair em spam.
 */
export function emailUtilizavel(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase()
  if (!e || e.length > 254) return false
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(e)) return false
  return true
}

/** Domínios que não são de ninguém. A mesma lista da ingestão, e pela mesma razão. */
const DOMINIOS_DE_MENTIRA = ['test.com', 'example.com', 'example.org', 'example.net', 'teste.com', 'mailinator.com']

export function ehEmailDeMentira(email: string): boolean {
  return DOMINIOS_DE_MENTIRA.includes(email.trim().toLowerCase().split('@')[1] ?? '')
}

/** Normaliza como a base compara: minúsculas, sem espaços. Usar SEMPRE antes de comparar. */
export function normalizarEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * A decisão.
 *
 * A ordem dos testes não é arbitrária: o «retirou» vem primeiro de todos, antes mesmo de se olhar
 * para o que a pessoa é. Alguém que pediu para não receber mais nada e recebe outra vez não é um
 * erro técnico — é a única falha desta lista que não se corrige com um pedido de desculpa.
 */
export function podeReceber(p: PessoaParaDecidir, finalidade: FinalidadeEmail): Decisao {
  if (p.retirou) {
    return { pode: false, porque: 'pediu para não receber mais — não se volta atrás disto' }
  }
  if (!emailUtilizavel(p.email)) {
    return { pode: false, porque: 'sem email utilizável' }
  }
  if (ehEmailDeMentira(normalizarEmail(p.email))) {
    return { pode: false, porque: 'email de teste, não é de ninguém' }
  }

  if (finalidade === 'servico') {
    // Um email de serviço a quem não é cliente não é um email de serviço: é uma campanha com outro
    // nome. É precisamente por aqui que a `type: 'transactional'` do caminho antigo deixava passar
    // tudo, e é aqui que deixa de passar.
    if (!p.ehCliente) {
      return { pode: false, porque: 'não é cliente — um email de serviço a um não-cliente é uma campanha disfarçada' }
    }
    return { pode: true, porque: 'cliente, e o email é sobre o serviço que paga' }
  }

  if (p.baseLegal === 'consentimento') {
    return { pode: true, porque: 'pediu para receber' }
  }
  if (p.baseLegal === 'relacao_contratual') {
    return {
      pode: false,
      porque: 'é cliente, mas ser cliente não é ter pedido campanhas — falta o consentimento',
    }
  }
  return { pode: false, porque: 'não há registo de ter pedido nada (o silêncio é não)' }
}

/**
 * As duas listas, e a razão de nunca se juntarem.
 *
 * 'pediu'   — deu consentimento. É a lista com que se faz campanhas.
 * 'existe'  — está na base e nunca pediu nada. NÃO se lhe manda campanhas; trabalha-se um a um, à
 *             mão, por quem tem uma razão concreta para falar com aquela pessoa, ou convida-se a
 *             pedir (que é o que os ímanes de leads fazem).
 *
 * Misturar as duas é o erro que parece de nada e custa o domínio. Existem como tipo e não como
 * convenção para que ninguém as some por distracção numa query.
 */
export type Lista = 'pediu' | 'existe'

export function listaDe(p: PessoaParaDecidir): Lista {
  return !p.retirou && p.baseLegal === 'consentimento' ? 'pediu' : 'existe'
}

/**
 * Onde é que o consentimento se captura.
 *
 * Isto está em código, e não numa recomendação de relatório, porque é a lista de sítios onde o
 * pedido tem de existir para a lista crescer de forma limpa. Cada entrada é um sítio onde a pessoa
 * age por vontade própria — nenhuma é uma importação.
 */
/**
 * O texto da caixa no checkout e no marketplace (06/10, F4). Curto, diz o que se recebe (lembretes
 * e novidades), por onde (email), que é opcional e que se sai quando se quiser. É ESTE texto que
 * fica gravado como prova na linha do livro — o ecrã e a prova têm de ser a mesma frase.
 */
export const TEXTO_CAIXA_CHECKOUT =
  'Quero receber lembretes e novidades da MoreThanMoney por email (opcional). ' +
  'Cancelo quando quiser, sem perder o acesso ao que comprei.'

export interface PontoDeCaptura {
  canal: string
  onde: string
  /** O texto que a pessoa tem de ter à frente dos olhos. É isto que se guarda como prova. */
  pedido: string
}

/**
 * O texto do pedido é curto e diz a verdade toda: quem manda, sobre o quê, e que se sai quando se
 * quiser. Uma caixa de consentimento escrita para ser aceite sem se ler não vale nada quando for
 * preciso mostrá-la.
 */
export const PONTOS_DE_CAPTURA: readonly PontoDeCaptura[] = [
  {
    canal: 'iman_leads',
    onde: 'Página do ímane de leads (os 3 freebies já escritos em docs/freebies)',
    pedido:
      'Quero receber o material por email e as novidades da MoreThanMoney. Posso cancelar em qualquer email que receber.',
  },
  {
    canal: 'bot_telegram',
    onde: 'Funil do bot, depois de a pessoa dizer o que quer (lib/telegram-lead-funnel.ts)',
    pedido:
      'Deixas-me o teu email para te enviar isto e avisar quando houver sessões? Só isso — sais quando quiseres.',
  },
  {
    canal: 'formulario_site',
    onde: 'Formulários do site (form_submissions), com a caixa POR MARCAR',
    pedido:
      'Quero receber emails da MoreThanMoney sobre formação, sessões e novidades. Cancelo quando quiser.',
  },
  {
    canal: 'checkout',
    onde: 'Checkout do site (/upgrade e /register), separado da compra — comprar não é subscrever',
    pedido: TEXTO_CAIXA_CHECKOUT,
  },
  {
    canal: 'marketplace',
    onde: 'Ficha do produto no marketplace, ao lado do botão de compra (components/marketplace/ficha-produto.tsx)',
    pedido: TEXTO_CAIXA_CHECKOUT,
  },
  {
    /**
     * WhatsApp. Acrescentado a 27/09, quando se construiu o envio (`lib/whatsapp-mensageiro.ts`).
     *
     * Sem este canal, o livro não tinha onde aterrar uma permissão dada por WhatsApp — e sem linha no
     * livro, o único envio que o sistema autoriza para um número é a resposta dentro das 24 horas em
     * que a pessoa nos escreveu. Ou seja: falava-se com ela uma vez e nunca mais. Isto pede-se DENTRO
     * dessa conversa, com ela a responder, e nunca a um número que apareceu numa exportação.
     */
    canal: 'whatsapp',
    onde: 'Dentro da conversa de WhatsApp, depois de a pessoa perguntar algo (app/api/whatsapp/webhook)',
    pedido:
      'Queres que te avise por WhatsApp das sessões e das novidades da MoreThanMoney? Responde "sim" — ' +
      'e sais quando quiseres, basta dizeres para parar.',
  },
  {
    canal: 'comentario_instagram',
    onde: 'Resposta ao comentário no Instagram que pede o contacto (funil nativo do Instagram)',
    pedido:
      'Manda-me o teu email em mensagem e envio-te o acesso — e aviso-te das próximas sessões, se quiseres. ' +
      'Sais quando quiseres.',
  },
] as const

/**
 * A caixa de consentimento NUNCA nasce marcada.
 *
 * Fica escrito aqui, e preso por uma guarda, porque é a primeira coisa que alguém «optimiza» para
 * subir a conversão da página — e um sim que a pessoa não deu é pior do que um não.
 */
export const CAIXA_PRE_MARCADA = false


// ── A caixa do checkout e do marketplace (06/10, F4) ─────────────────────────────────────────────

/** Os canais onde a caixa vive ao lado de uma compra. */
export type CanalDeCompra = 'checkout' | 'marketplace'

export interface LinhaDeConsentimento {
  email: string
  canal: CanalDeCompra
  base_legal: 'consentimento'
  prova: string
  origem_url: string | null
}

/**
 * O que gravar no livro (`captacao_consentimento`, que a vista `captacao_permissao_email` lê) a
 * partir de uma compra. SÓ com a caixa marcada pela pessoa: `aceitou` tem de ser exactamente
 * `true`. Um `'on'`, um `1`, um `undefined` ou a ausência do campo não são consentimento — e
 * comprar não é subscrever. Devolve `null` quando não há nada a gravar.
 */
export function consentimentoDaCompra(p: {
  aceitou: unknown
  email: string | null | undefined
  canal: CanalDeCompra
  origemUrl?: string | null
}): LinhaDeConsentimento | null {
  if (p.aceitou !== true) return null
  const email = normalizarEmail(p.email)
  if (!emailUtilizavel(email) || ehEmailDeMentira(email)) return null
  return {
    email,
    canal: p.canal,
    base_legal: 'consentimento',
    prova: TEXTO_CAIXA_CHECKOUT,
    origem_url: p.origemUrl ? String(p.origemUrl).slice(0, 500) : null,
  }
}
