/**
 * O CONSENTIMENTO PEDIDO DENTRO DA CONVERSA — e a saída, que é a parte que a lei protege.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ═══════════════════════════════════════════════════════════════
 *
 * Sem isto, o WhatsApp é um canal de uma mensagem só: a Meta deixa responder dentro das 24 horas
 * em que a pessoa escreveu, e mais nada. Ou seja, fala-se com ela uma vez e nunca mais — o número
 * fica na base a não servir para nada. O texto do pedido e a tabela (`captacao_consentimento`) já
 * existiam; o que faltava era o funil FAZER a pergunta e LER a resposta.
 *
 * ═══ AS TRÊS REGRAS, E A RAZÃO DE CADA UMA ══════════════════════════════════════════════════
 *
 * 1. NÃO SE PEDE À PRIMEIRA. Quem chega com uma dúvida quer a resposta, não um formulário. Pedir
 *    autorização antes de ter dado valor nenhum é a forma mais rápida de ouvir «não» — e um «não»
 *    fecha a porta para sempre, enquanto o silêncio a deixa entreaberta.
 *
 * 2. PERGUNTA-SE UMA VEZ. Insistir depois de um «não» não é persistência comercial: é a mesma
 *    pessoa a ser incomodada por uma máquina que não a ouviu. E depois de um «sim» também não se
 *    repete, porque pergunta repetida faz duvidar do que já foi dado.
 *
 * 3. A SAÍDA FUNCIONA SEMPRE, e esta é a que não se negoceia. O próprio pedido promete «sais
 *    quando quiseres, basta dizeres para parar». Uma promessa dessas tem de valer em qualquer
 *    momento da conversa — antes de a pergunta ser feita, anos depois, a meio de outra coisa. Por
 *    isso a leitura da saída NÃO depende de haver uma pergunta pendente, ao contrário do «sim».
 *
 * PURO: sem base de dados e sem rede, para a decisão de escrever a alguém poder ser testada num
 * `npx tsx` de dois segundos.
 */

/**
 * Quantas mensagens da pessoa antes de se pedir.
 *
 * Três: tempo de ela perguntar, nós respondermos, e ela voltar — a essa altura já houve troca que
 * justifica o pedido. Menos do que isto é pedir antes de ter dado; muito mais é perder a janela
 * das 24 horas, que é quando a pergunta ainda pode ser feita de graça.
 */
export const MENSAGENS_ANTES_DE_PEDIR = 3

/** A etiqueta que marca que já se perguntou. Fica no lead, e é o que impede a segunda pergunta. */
export const ETIQUETA_PERGUNTADO = 'consentimento:perguntado'

export type Resposta = 'sim' | 'nao' | 'sair' | 'nada'

export interface EstadoDoPedido {
  /** Quantas mensagens a PESSOA já mandou nesta conversa. */
  mensagensDela: number
  /** Já se lhe perguntou alguma vez? */
  jaPerguntado: boolean
  /** Já existe consentimento registado para este contacto? */
  jaConsentiu: boolean
  /** Já se recusou, ou já saiu? */
  jaRecusouOuSaiu: boolean
}

/** Pede-se agora? */
export function devePerguntar(e: EstadoDoPedido): boolean {
  if (e.jaConsentiu || e.jaRecusouOuSaiu || e.jaPerguntado) return false
  return e.mensagensDela >= MENSAGENS_ANTES_DE_PEDIR
}

// ── Ler o que a pessoa respondeu ────────────────────────────────────────────

/**
 * A SAÍDA. Reconhece-se sempre, haja ou não pergunta pendente — ver a regra 3.
 *
 * A lista é generosa de propósito: quem quer sair escreve como lhe apetece, e o custo de não
 * perceber é muito maior do que o de perceber a mais. Uma pessoa que pede para parar e continua a
 * receber deixa de ser um lead e passa a ser uma queixa.
 */
const SAIR = /\b(p[aá]ra|parar|pare|stop|unsubscribe|cancelar|remove[r]?|descad|sai[r]?\s+(da|do)\s+lista|n[aã]o\s+(me\s+)?(mandes?|envies?|escrevas?)\s+mais|deixa[- ]me\s+em\s+paz|tira[- ]me)\b/i

/**
 * O «sim» — curto e sem ambiguidade. Só conta quando há pergunta pendente.
 *
 * Os emojis estão SEPARADOS das palavras por uma razão que a guarda apanhou: `\b` é uma fronteira
 * entre caracteres de palavra e o resto, e um emoji não é caractere de palavra — logo `👍\b` nunca
 * casa. Com as palavras juntas aos emojis num só grupo, um polegar para cima era lido como
 * silêncio, e a pessoa que respondeu ficava por registar.
 */
const SIM = /^(sim|claro|pode|podes|ok|okay|certo|quero|aceito|autorizo|s|yes|y)\b/i
const SIM_EMOJI = /^\s*(👍|✅|👌|🙌)/u

/** O «não» — idem. `não sei` NÃO é um «não»: é uma dúvida, e fechar a porta a uma dúvida é errado. */
const NAO = /^(n[aã]o|nao|nop|negativo|n|no|dispenso|prefiro\s+que\s+n[aã]o)\b/i
const DUVIDA = /^n[aã]o\s+(sei|percebi|entendi|compreendo)\b/i

/**
 * Que resposta é esta?
 *
 * `pendente` diz se a pergunta chegou a ser feita. Sem ela, um «sim» solto no meio de uma conversa
 * («sim, é isso mesmo») NÃO pode valer como consentimento — seria registar uma permissão que
 * ninguém deu, que é exactamente o que a tabela existe para impedir.
 */
export function lerResposta(texto: string | null | undefined, pendente: boolean): Resposta {
  const t = String(texto ?? '').trim()
  if (!t) return 'nada'
  if (SAIR.test(t)) return 'sair'
  if (!pendente) return 'nada'
  if (DUVIDA.test(t)) return 'nada'
  if (SIM.test(t) || SIM_EMOJI.test(t)) return 'sim'
  if (NAO.test(t)) return 'nao'
  return 'nada'
}

/**
 * O que se diz depois da resposta. Em português de Portugal e curto — isto entra a seguir a uma
 * conversa a sério, não é uma landing page.
 */
export function confirmacao(r: Exclude<Resposta, 'nada'>): string {
  if (r === 'sim') {
    return 'Ficou registado, obrigado. Vais receber as sessões e as novidades — e sais quando quiseres, basta dizeres «parar».'
  }
  if (r === 'nao') {
    return 'Sem problema, não te mando nada. Continuo por aqui se precisares de alguma coisa.'
  }
  return 'Feito: não voltas a receber mensagens nossas. Se um dia mudares de ideias, é só dizeres.'
}
