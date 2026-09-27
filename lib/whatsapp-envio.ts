/**
 * ENVIAR PELO WHATSAPP — a decisão, antes de haver rede.
 *
 * O QUE EXISTIA ANTES DESTE FICHEIRO
 * `app/api/whatsapp/webhook/route.ts` recebia mensagens e tinha um `sendWhatsApp()` de sete linhas
 * que fazia `fetch(...).catch(() => {})`. Três coisas erradas nessas sete linhas, e nenhuma delas
 * dava erro visível:
 *   1. Sem token configurado, escrevia um `console.warn` e devolvia `void`. Quem chamava não tinha
 *      como saber que a resposta ao lead nunca saiu.
 *   2. Mandava sempre `type: 'text'`. Fora da janela de 24 horas a Meta RECUSA texto livre — o
 *      pedido levava erro, o `.catch(() => {})` engolia-o, e a conversa ficava morta de um lado só.
 *   3. Não olhava para consentimento nenhum. O único travão era `isNewWhatsAppLead`, que serve para
 *      não atropelar clientes existentes — não para provar que alguém nos deu o número.
 *
 * PORQUE É QUE ISTO É UM FICHEIRO PURO
 * A regra que decide «texto livre ou template?» e «pode-se falar com esta pessoa?» não precisa de
 * rede nem de base de dados para estar certa — precisa de estar PRESA. Tudo o que aqui está é
 * função pura, e por isso `whatsapp-envio.check.ts` consegue tentar passar-lhe por cima sem
 * credenciais e sem mandar uma única mensagem real. O envio em si vive em `whatsapp-mensageiro.ts`.
 *
 * AS DUAS PAREDES DA META, DITAS UMA VEZ
 *
 * 1. JANELA DE ATENDIMENTO (24 HORAS). Cada mensagem que a PESSOA nos manda abre 24 horas. Dentro
 *    delas pode-se responder com texto livre. Fora delas, só passa um *template* aprovado. Isto não
 *    é uma recomendação de estilo: fora da janela o texto livre devolve erro, e um número que
 *    acumula tentativas falhadas e mensagens a quem não as espera é um número que a Meta marca como
 *    spam. Perder o número é perder o canal — e um número de WhatsApp Business não se recupera com
 *    um deploy.
 *
 * 2. QUEM NOS DEU O NÚMERO. Ter um número não é ter permissão para o usar. A pessoa que nos escreve
 *    primeiro dá-nos origem por acção dela — é a origem mais limpa que existe e vale enquanto a
 *    conversa estiver viva. Fora disso, é preciso uma linha no livro (`captacao_consentimento`).
 *    Ausência de registo é NÃO, exactamente como nos emails (`captacao-consentimento.ts`).
 *
 * A REGRA QUE ESTE FICHEIRO EXISTE PARA IMPOR
 * Recusar em voz alta. Uma recusa que diz o código e a razão é uma linha de registo que se lê no
 * dia seguinte; um `.catch(() => {})` é uma mensagem que ninguém sabe que não saiu.
 */
import type { BaseLegal } from '@/lib/captacao-consentimento'

/**
 * PARA QUE SERVE A MENSAGEM. É o parâmetro que mais decide, e por isso é obrigatório e sem valor por
 * omissão — um valor por omissão aqui seria a porta por onde uma campanha sai disfarçada de resposta.
 *
 * Os emails têm dois casos (`FinalidadeEmail`: 'servico' | 'campanha'). O WhatsApp tem três, porque
 * aqui existe um caso que no email não existe: a pessoa escreveu-nos AGORA e está à espera de
 * resposta. Tratar isso como 'servico' obrigava a que ela fosse cliente; tratá-lo como 'campanha'
 * obrigava a um consentimento que ninguém pede a meio de uma conversa que a própria pessoa começou.
 * Qualquer das duas deixava o funil mudo — e um lead que escreve e não recebe resposta é um lead
 * perdido por zelo mal aplicado.
 *
 * · 'resposta' — responder a quem nos escreveu, dentro da janela. A origem é o acto dela.
 * · 'servico'  — sobre o que ela já tem: renovação, acesso, incidente. Fora da janela exige que haja
 *                relação registada no livro; não chega ter o número.
 * · 'campanha' — venda, conteúdo, reactivação. Exige consentimento. Sem excepções, e em particular
 *                sem a excepção de «mas a janela está aberta»: ela escreveu uma dúvida, não se
 *                inscreveu numa lista.
 */
export type Finalidade = 'resposta' | 'servico' | 'campanha'

/** Duração da janela de atendimento da Meta. Não é configurável porque não é nossa. */
export const JANELA_MS = 24 * 60 * 60 * 1000

/**
 * A origem conhecida deixa de valer quando a conversa esfria.
 *
 * Uma mensagem que a pessoa nos mandou há oito meses não é permissão para lhe escrever hoje: é uma
 * conversa antiga. Sem este limite, «ela já falou comigo uma vez» tornava-se licença permanente, que
 * é precisamente o raciocínio com que se constroem listas que ninguém pediu.
 */
export const ORIGEM_POR_CONVERSA_VALE_MS = 90 * 24 * 60 * 60 * 1000

// ── Números ──────────────────────────────────────────────────────────────────────────────────────

/**
 * O MESMO NÚMERO ESCRITO DE SEIS MANEIRAS É A MESMA PESSOA.
 *
 * `+351 912 345 678`, `912345678`, `00351912345678` e o `351912345678` que a Meta manda no webhook
 * são um só ser humano. Guardar cada forma como se fosse um contacto diferente tem duas consequências
 * práticas, e as duas custam dinheiro: a mesma pessoa recebe a mesma mensagem duas vezes (o caminho
 * mais curto para ser denunciada como spam), e o consentimento que ela deu numa forma não é
 * encontrado quando se procura pela outra — logo é tratada como quem nunca deu nada.
 *
 * Devolve E.164 (`+` e só dígitos) ou `null` com a razão. Nunca adivinha um país para um número que
 * não cabe nas regras: um número inventado é pior do que um número em falta.
 */
export interface NumeroNormalizado {
  e164: string | null
  porque: string
}

export function normalizarE164(bruto: string | null | undefined, indicativoPorOmissao = '351'): NumeroNormalizado {
  const cru = (bruto ?? '').trim()
  if (!cru) return { e164: null, porque: 'sem número' }

  // Só dígitos. Parênteses, espaços, pontos e barras vêm de listas escritas à mão e não significam
  // nada; um `+` só conta se estiver à cabeça.
  const tinhaMais = cru.startsWith('+')
  let d = cru.replace(/\D/g, '')
  if (!d) return { e164: null, porque: 'sem dígitos' }

  // `00` à cabeça é o prefixo internacional europeu — equivale ao `+`.
  if (!tinhaMais && d.startsWith('00')) d = d.slice(2)

  // Nove dígitos e nada mais: é um número nacional do país por omissão. É o caso das listas
  // portuguesas escritas à mão, onde ninguém põe o indicativo.
  if (!tinhaMais && d.length === 9) d = indicativoPorOmissao + d

  if (d.length < 8) return { e164: null, porque: `curto demais para ser um número (${d.length} dígitos)` }
  if (d.length > 15) return { e164: null, porque: `longo demais para E.164 (${d.length} dígitos, o máximo é 15)` }
  // Nenhum indicativo de país começa por zero. Um número que aqui chega a começar por 0 é um
  // nacional com prefixo de operadora de outro país, e adivinhar qual seria inventar.
  if (d.startsWith('0')) return { e164: null, porque: 'começa por 0 — falta o indicativo do país e não se adivinha' }

  return { e164: `+${d}`, porque: 'normalizado' }
}

/** Duas escritas do mesmo número são a mesma pessoa. Usar SEMPRE isto em vez de comparar texto. */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarE164(a).e164
  const nb = normalizarE164(b).e164
  return !!na && na === nb
}

/**
 * As formas por que o mesmo número pode estar escrito na base.
 *
 * O livro do consentimento (`captacao_consentimento.telefone`) aceita texto livre: nasceu antes
 * desta normalização e tem lá dentro o que os formulários escreveram. Procurar só pelo E.164 era
 * declarar «não deu consentimento» a quem deu — e isso não é prudência, é apagar o registo dela.
 */
export function variantesDoNumero(e164: string): string[] {
  const d = e164.replace(/\D/g, '')
  const v = new Set<string>([e164, d, `00${d}`])
  // Sem indicativo: é assim que a maioria dos formulários portugueses guarda.
  if (d.startsWith('351') && d.length > 9) v.add(d.slice(3))
  return [...v]
}

// ── A janela ─────────────────────────────────────────────────────────────────────────────────────

export interface Janela {
  aberta: boolean
  /** Milissegundos até fechar. Zero ou negativo quando já fechou. */
  faltaMs: number
  porque: string
}

/**
 * A janela mede-se pela ÚLTIMA MENSAGEM DELA, nunca pela nossa.
 *
 * Responder a uma pessoa não prolonga a janela — se prolongasse, bastava mandar mensagens a nós
 * mesmos para ter licença eterna. O relógio é o dela.
 */
export function estadoDaJanela(ultimaEntradaIso: string | null | undefined, agoraMs: number): Janela {
  if (!ultimaEntradaIso) {
    return { aberta: false, faltaMs: 0, porque: 'esta pessoa nunca nos escreveu — não há janela para abrir' }
  }
  const t = Date.parse(ultimaEntradaIso)
  if (Number.isNaN(t)) {
    // Uma data que não se lê trata-se como janela fechada. O erro conservador manda um template
    // aprovado; o erro optimista manda texto livre que a Meta recusa.
    return { aberta: false, faltaMs: 0, porque: 'data da última mensagem dela ilegível — trata-se como fechada' }
  }
  const faltaMs = t + JANELA_MS - agoraMs
  if (faltaMs > 0) {
    return { aberta: true, faltaMs, porque: `ela escreveu há menos de 24h (faltam ${Math.round(faltaMs / 60000)} min)` }
  }
  const horas = Math.floor((agoraMs - t) / 3_600_000)
  return { aberta: false, faltaMs, porque: `a última mensagem dela foi há ${horas}h — a janela fechou` }
}

// ── O consentimento ──────────────────────────────────────────────────────────────────────────────

/** O que se sabe desta pessoa no momento de decidir. Tudo o que é preciso, e nada mais. */
export interface EstadoDoContacto {
  /** A última palavra dela no livro, resolvida por telefone. `null` = não há linha nenhuma. */
  baseLegal: BaseLegal | null
  /** Retirou em algum momento. Ganha a tudo o resto, sempre. */
  retirou: boolean
  /** Canal por onde deu, para aparecer no registo e na resposta a «onde é que eu vos dei isto?». */
  canal: string | null
  /** ISO da última mensagem que ELA nos mandou, ou `null` se nunca nos escreveu. */
  ultimaEntradaIso: string | null
}

export type CodigoRecusa =
  | 'retirou'
  | 'numero_invalido'
  | 'sem_origem'
  | 'fora_da_janela_exige_template'
  | 'template_sem_nome'
  | 'resposta_fora_da_janela'
  | 'servico_sem_relacao'
  | 'campanha_sem_consentimento'

export interface Pedido {
  para: string | null
  /** `texto` = texto livre. `template` = template aprovado pela Meta, com parâmetros. */
  tipo: 'texto' | 'template'
  templateNome?: string | null
  finalidade: Finalidade
}

export interface Decisao {
  pode: boolean
  /** Em português, porque isto vai para o registo que o Ricardo lê. */
  porque: string
  codigo: CodigoRecusa | 'ok'
  /** O número já normalizado. `null` quando não se conseguiu normalizar. */
  para: string | null
  janela: Janela
  /** Verdadeiro quando a Meta só aceita template. Quem chama usa isto para escolher o corpo. */
  exigeTemplate: boolean
}

/**
 * A decisão, e a ordem dela.
 *
 * A ordem não é arbitrária. O «retirou» vem antes de tudo, antes mesmo de se olhar para o número:
 * mandar outra vez a quem pediu para não receber mais é a única falha desta lista que não se
 * corrige com um pedido de desculpa. Depois vem a origem, e só no fim a mecânica da janela — porque
 * não faz sentido discutir se é texto ou template a quem nem se devia escrever.
 */
export function decidirEnvio(p: Pedido, estado: EstadoDoContacto, agoraMs: number): Decisao {
  const janela = estadoDaJanela(estado.ultimaEntradaIso, agoraMs)
  const { e164 } = normalizarE164(p.para)
  const base = { janela, para: e164, exigeTemplate: !janela.aberta }

  if (estado.retirou) {
    return { ...base, pode: false, codigo: 'retirou', porque: 'pediu para não receber mais — não se volta atrás disto' }
  }
  if (!e164) {
    return {
      ...base,
      pode: false,
      codigo: 'numero_invalido',
      porque: `número não utilizável: ${normalizarE164(p.para).porque}`,
    }
  }

  /**
   * ORIGEM. Ou ela nos escreveu (e a conversa ainda é recente), ou há uma linha no livro. Nada mais
   * conta — e em particular não conta «o número está na base». Estar na base é de onde vem o
   * número, não é permissão para o usar.
   */
  const conversaRecente =
    !!estado.ultimaEntradaIso &&
    !Number.isNaN(Date.parse(estado.ultimaEntradaIso)) &&
    agoraMs - Date.parse(estado.ultimaEntradaIso) <= ORIGEM_POR_CONVERSA_VALE_MS
  const temLivro = estado.baseLegal === 'consentimento' || estado.baseLegal === 'relacao_contratual'
  if (!conversaRecente && !temLivro) {
    return {
      ...base,
      pode: false,
      codigo: 'sem_origem',
      porque:
        'não se sabe de onde veio este número: ela nunca nos escreveu (ou foi há demasiado tempo) e não há ' +
        'linha no livro do consentimento. O silêncio é não.',
    }
  }

  // Texto livre fora da janela: a Meta recusa. Recusar aqui, com o motivo escrito, em vez de mandar
  // e deixar o erro dela desaparecer dentro de um `catch` vazio.
  if (p.tipo === 'texto' && !janela.aberta) {
    return {
      ...base,
      pode: false,
      codigo: 'fora_da_janela_exige_template',
      porque: `${janela.porque} — fora da janela a Meta só aceita template aprovado, não texto livre`,
    }
  }

  if (p.tipo === 'template' && !(p.templateNome ?? '').trim()) {
    return { ...base, pode: false, codigo: 'template_sem_nome', porque: 'template sem nome não existe do lado da Meta' }
  }

  /**
   * RESPOSTA. Só existe dentro da janela, por definição: responder a alguém 30 horas depois de ela
   * ter escrito não é responder, é abordar. Fora da janela isto tem de ser uma decisão consciente
   * de quem chama — 'servico' ou 'campanha', com a base que cada um exige.
   */
  if (p.finalidade === 'resposta' && !janela.aberta) {
    return {
      ...base,
      pode: false,
      codigo: 'resposta_fora_da_janela',
      porque: `${janela.porque} — uma "resposta" fora da janela já não é uma resposta; escolhe 'servico' ou 'campanha'`,
    }
  }

  /**
   * SERVIÇO FORA DA JANELA. Mandar um template a quem não tem relação registada nesta casa é uma
   * abordagem a frio com o nome trocado — é por aqui que a `type: 'transactional'` do caminho antigo
   * dos emails deixava passar tudo, e é aqui que deixa de passar.
   */
  if (p.finalidade === 'servico' && !janela.aberta && !temLivro) {
    return {
      ...base,
      pode: false,
      codigo: 'servico_sem_relacao',
      porque: 'fora da janela e sem relação registada no livro — um "serviço" a quem não é nada nosso é abordagem a frio',
    }
  }

  /**
   * CAMPANHA. Dentro ou fora da janela, vender a quem não pediu campanhas exige consentimento. A
   * janela aberta é licença para RESPONDER, não para promover: a pessoa escreveu-nos uma dúvida, não
   * se inscreveu numa lista. Ser cliente («relacao_contratual») também não basta — é a mesma
   * fronteira que `podeReceber` impõe nos emails, e falha-se aqui pela mesma razão.
   */
  if (p.finalidade === 'campanha' && estado.baseLegal !== 'consentimento') {
    return {
      ...base,
      pode: false,
      codigo: 'campanha_sem_consentimento',
      porque:
        estado.baseLegal === 'relacao_contratual'
          ? 'é cliente, mas ser cliente não é ter pedido campanhas — falta o consentimento'
          : 'campanha exige consentimento registado, e não há nenhum',
    }
  }

  const origem = conversaRecente ? 'ela escreveu-nos' : `consentimento registado (${estado.canal ?? 'canal não dito'})`
  return {
    ...base,
    pode: true,
    codigo: 'ok',
    porque: janela.aberta ? `janela aberta e origem conhecida: ${origem}` : `template fora da janela, origem: ${origem}`,
  }
}

// ── O corpo do pedido à Cloud API ────────────────────────────────────────────────────────────────

/**
 * O JSON que vai para a Graph API. Também puro, para que a forma do template — a parte que ninguém
 * consegue ler de cabeça e todos escrevem mal à primeira — fique presa por uma guarda.
 */
export interface CorpoTemplate {
  nome: string
  /** Código de idioma do template, como está aprovado na Meta (ex.: `pt_PT`). */
  idioma: string
  /** Parâmetros do corpo, na ordem em que aparecem no template ({{1}}, {{2}}, ...). */
  parametros?: string[]
}

export function corpoParaCloudApi(
  paraE164: string,
  msg: { tipo: 'texto'; texto: string } | { tipo: 'template'; template: CorpoTemplate },
): Record<string, unknown> {
  // A Meta quer o número SEM `+` no campo `to`.
  const to = paraE164.replace(/^\+/, '')
  if (msg.tipo === 'texto') {
    // `preview_url: false` de propósito: uma pré-visualização de link numa primeira resposta faz a
    // mensagem parecer publicidade, e é isso que se está a evitar.
    return { messaging_product: 'whatsapp', to, type: 'text', text: { body: msg.texto, preview_url: false } }
  }
  const t = msg.template
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: t.nome,
      language: { code: t.idioma },
      ...(t.parametros?.length
        ? { components: [{ type: 'body', parameters: t.parametros.map((v) => ({ type: 'text', text: v })) }] }
        : {}),
    },
  }
}
