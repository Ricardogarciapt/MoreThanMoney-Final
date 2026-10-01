/**
 * A AUTONOMIA DO CEO — o que ele fecha sozinho, e quem decide o resto.
 *
 * ═══ POR LISTA EXPLÍCITA, E NUNCA PELA NEGATIVA ════════════════════════════════════════════
 *
 * O dono foi específico, e a razão dele é a razão deste ficheiro inteiro: **uma autonomia definida
 * pela negativa cresce sozinha.** Se a regra fosse «o CEO pode tudo o que não estiver proibido»,
 * cada poder novo que aparecesse no sistema — uma rota nova, uma tabela nova, um botão novo —
 * passava a ser dele no dia em que fosse escrito, sem ninguém decidir nada. E o momento em que
 * isso acontece não é um momento: é a ausência de um. Ninguém se lembra de proibir o que ainda não
 * existe.
 *
 * Por isso {@link PODERES} é uma lista FECHADA, e o que não está nela é do dono por omissão. A
 * pergunta «isto é meu para decidir?» responde-se por pertença à lista, nunca por interpretação.
 *
 * ═══ OS TRÊS TESTES QUE UM PODER TEM DE PASSAR PARA ENTRAR AQUI ═══════════════════════════
 *
 *  1. **reversível** — desfaz-se com um clique e sem pedir desculpa a ninguém. Uma reescrita de
 *     instruções é reversível porque a versão anterior fica guardada; um envio a um cliente não é;
 *  2. **medível** — consegue-se dizer, por escrito, como se prova que correu bem. «Uma automação
 *     que ninguém consegue verificar é pior do que o trabalho manual, porque falha sem se notar»;
 *  3. **interno** — não sai da casa. Não toca num cliente, num preço, nem em dinheiro.
 *
 * Os três juntos, não dois. {@link PODERES_DO_DONO} nomeia o que ficou de fora e porquê, porque um
 * limite que não se nomeia parece um esquecimento, e alguém «completa» a lista de boa-fé.
 *
 * ═══ O QUE ESTA AUTONOMIA NÃO REVOGA, REPETIDO AQUI DE PROPÓSITO ══════════════════════════
 *
 *  · nenhum agente executa ordens de trading nem mexe em dinheiro. Propõe; decide o dono;
 *  · publicar, cobrar ou alterar preços continua a ser decisão do dono;
 *  · o CEO NÃO pode dar a si próprio nem a um filho um poder que não esteja em {@link PODERES}. Em
 *    particular: não alarga o catálogo de pedidos (`ciclo-ceo.ts`) e não concede imortalidade a
 *    ninguém — a excepção da régua de vida é NOMEADA e é do topo da árvore (`vida.ts`);
 *  · MENSAGENS: a capacidade de enviar existe nesta casa e é para crescer os grupos (decisão do
 *    dono). Não se retira. Mas também não se dá ao CEO como poder novo — o mecanismo é de quem já
 *    o tem, e não entra nesta lista.
 *
 * ═══ PURO, PORQUE ERRA EM SILÊNCIO ═══════════════════════════════════════════════════════
 *
 * «Isto é meu para decidir?» e «este bloqueio é meu ou do dono?» são perguntas que, respondidas
 * mal, não dão erro nenhum: dão um CEO a fazer uma coisa que não lhe competia, com um registo de
 * bom aspecto ao lado. `autonomia-ceo.check.ts` atira-lhe os casos maus sem base de dados.
 */

export type PoderId =
  | 'pedir_aos_filhos'
  | 'fechar_pedido'
  | 'educar_filho'
  | 'repor_limites'
  | 'marcar_links'
  | 'tornar_flag_explicita'
  | 'propagar_pipeline'
  | 'registar_decisao_de_papel'
  | 'escalar_ao_dono'

export interface Poder {
  id: PoderId
  /** O que ele pode fazer, sem ambiguidade. */
  oQue: string
  /** Como se desfaz. Um poder sem resposta a isto não entra na lista. */
  comoSeDesfaz: string
  /** Como se prova que correu bem. Sem isto a automação falha sem se notar. */
  comoSeProva: string
  /** Onde fica o rasto. Automação sem rasto é a doença que se acabou de curar nos agentes. */
  rasto: string
}

export const PODERES: Record<PoderId, Poder> = {
  pedir_aos_filhos: {
    id: 'pedir_aos_filhos',
    oQue:
      'Dar a um filho UM pedido do catálogo fechado (medir, propor, construir, baixar_custo, ' +
      'justificar), com prazo e com o número que o motivou.',
    comoSeDesfaz: 'Fecha-se o pedido com desfecho «cancelado». A linha fica.',
    comoSeProva: 'Uma linha em agentes_pedidos com accao, prazo e porque.',
    rasto: 'agentes_pedidos',
  },
  fechar_pedido: {
    id: 'fechar_pedido',
    oQue:
      'Fechar um pedido com desfecho: «cumprido» quando há prova, «sem_resposta» quando o prazo ' +
      'passou, «cancelado» quando o motivo deixou de existir.',
    comoSeDesfaz: 'Reabre-se escrevendo um pedido novo. A linha antiga nunca se apaga.',
    comoSeProva: 'desfecho e desfecho_em preenchidos, com o resultado escrito.',
    rasto: 'agentes_pedidos',
  },
  educar_filho: {
    id: 'educar_filho',
    oQue:
      'Reescrever as instruções de um filho a partir do que aprendeu — por exemplo quando um ' +
      'incidente ensina uma regra nova. SEMPRE através de lib/agentes/instrucoes-guarda.ts, que ' +
      'RECUSA qualquer reescrita que perca um limite.',
    comoSeDesfaz:
      'A versão anterior fica em agentes_instrucoes_versoes e repõe-se tal e qual. É esta cópia ' +
      'que faz deste poder reversível — sem ela, ele não entrava nesta lista.',
    comoSeProva:
      'Uma linha em agentes_instrucoes_versoes com o antes, o depois, e os limites que a guarda ' +
      'verificou. Se a guarda recusou, a linha diz isso e a coluna não mudou.',
    rasto: 'agentes_instrucoes_versoes + agentes_eventos (tipo «educou»)',
  },
  repor_limites: {
    id: 'repor_limites',
    oQue:
      'Recolar num filho um dos quatro limites da casa que lhe falte nas instruções. É o inverso ' +
      'do perigo de «educar»: aqui ele só pode ACRESCENTAR limites, e o texto canónico não é dele.',
    comoSeDesfaz: 'Igual: a versão anterior está guardada. Mas ninguém quer desfazer isto.',
    comoSeProva: 'detectar() passa a ver os quatro limites no filho, e a versão diz quais recolou.',
    rasto: 'agentes_instrucoes_versoes + agentes_eventos',
  },
  marcar_links: {
    id: 'marcar_links',
    oQue: 'Pôr o código de agente nos links nossos do conteúdo que a casa prepara, para o trabalho passar a ser medível.',
    comoSeDesfaz: 'Tira-se o parâmetro da legenda enquanto o post não está publicado.',
    comoSeProva: 'social_scheduled_posts.agente_codigo e agente_links_marcados preenchidos.',
    rasto: 'social_scheduled_posts',
  },
  tornar_flag_explicita: {
    id: 'tornar_flag_explicita',
    oQue:
      'Escrever na base, com o valor que a casa já pratica, um interruptor que NÃO EXISTE e por ' +
      'isso conta como desligado em silêncio. Isto NÃO liga nada: escreve «false» onde o efeito já ' +
      'era «false», para o interruptor passar a ser visível e decidível.',
    comoSeDesfaz: 'Apaga-se a linha e volta-se ao estado anterior, que era o mesmo efeito.',
    comoSeProva:
      'A chave passa a existir em site_settings com o mesmo valor efectivo de antes. Se o ' +
      'comportamento do sistema mudar, isto estava mal feito.',
    rasto: 'site_settings + agentes_eventos',
  },
  propagar_pipeline: {
    id: 'propagar_pipeline',
    oQue:
      'Propagar para o pipeline o que a fonte do lead já sabe e o negócio ainda não: avançar o ' +
      'estado para a frente e preencher colunas VAZIAS. Nunca recuar um estado, nunca tocar num ' +
      'negócio fechado, e nunca escrever por cima do que uma pessoa escreveu.',
    comoSeDesfaz:
      'Cada propagação diz que colunas mexeu. Recuar não é preciso: por construção, nada do que ' +
      'estava preenchido foi substituído.',
    comoSeProva:
      'Conta-se quantos negócios ficaram com o estado atrás da fonte. Com isto a correr, tende a ' +
      'zero; sem isto, só cresce.',
    rasto: 'vendas_negocios.atualizado_em + o relatório do cron backoffice-dia',
  },
  registar_decisao_de_papel: {
    id: 'registar_decisao_de_papel',
    oQue:
      'Registar no livro do agente trader o que ele analisou e decidiu na conta de PAPEL. ' +
      'Registar não é executar: não abre, não altera e não fecha uma ordem.',
    comoSeDesfaz: 'Nada a desfazer — é um registo. É isso que o torna seguro.',
    comoSeProva: 'Uma linha em agentes_eventos por passagem, com as decisões e o motivo de cada uma.',
    rasto: 'agentes_eventos (tipo «trabalho»)',
  },
  escalar_ao_dono: {
    id: 'escalar_ao_dono',
    oQue:
      'Pôr em cima da mesa do dono um bloqueio que NÃO lhe compete, com o motivo e a decisão ' +
      'pronta a tomar — não uma pergunta vaga. Escalar é o que ele faz em vez de agir onde não deve.',
    comoSeDesfaz: 'O dono decide, recusa, ou deixa aberto. A linha fica com o que ele escolheu.',
    comoSeProva: 'Uma linha em agentes_escalonamentos com assunto, porque e decisao_pronta.',
    rasto: 'agentes_escalonamentos',
  },
}

/**
 * O QUE FICOU DE FORA, NOMEADO — e o motivo de cada um.
 *
 * Nenhum destes é «ainda não implementado». São a decisão.
 */
export const PODERES_DO_DONO: Record<string, string> = {
  enviar_a_cliente:
    'Enviar uma mensagem a um cliente. A capacidade existe na casa e é para crescer os grupos — ' +
    'decisão do dono, que não se retira. Mas um envio NÃO SE DESFAZ, logo falha o primeiro dos três ' +
    'testes, logo não é poder do CEO. Ele redige e espera que uma pessoa aprove.',
  publicar:
    'Publicar conteúdo, pôr preço, lançar campanha. Constrói-se; a decisão de pôr à venda é de quem ' +
    'assume o negócio.',
  cobrar:
    'Cobrar, transferir, movimentar cripto. Nenhum agente mexe em dinheiro: receita LÊ-SE, dinheiro ' +
    'que sai é decisão do dono.',
  executar_ordem:
    'Abrir, alterar ou fechar uma ordem de trading. Nunca — e a conta do agente trader é de PAPEL ' +
    'de propósito, verificado a cada passagem por contaSegura().',
  armar_trader:
    'Armar o agente trader (site_settings.agente_trader = {"armado": true}). Fica com o dono porque ' +
    'a conta de papel JÁ TEM outro escritor (todos-os-sinais.ts): um segundo escritor duplica ' +
    'posições e estraga a única medição de desempenho honesta da casa. Não é um limite de segurança ' +
    'de dinheiro — é de medição — mas é igualmente do dono.',
  ligar_funis:
    'Ligar o motor de funis (site_settings.funis_motor_ligado = true). Ele ENVIA mensagens a ' +
    'pessoas reais, e um funil recém-desenhado com uma espera mal posta manda três seguidas à mesma ' +
    'pessoa. O CEO pode tornar a chave visível; ligá-la é do dono.',
  ligar_followup:
    'Pôr o cron do follow-up de leads a correr (/api/cron/lead-followup). Está escrito e não está ' +
    'no vercel.json: ligá-lo faz sair mensagens de reactivação sem passar por ninguém.',
  exigir_aprovacao_no_setter:
    'Mudar os interruptores do setter do Instagram. Hoje enviar_dm está true e ninguém escreve o ' +
    'estado «aprovado» — ou seja, saem DMs sem passar por uma pessoa. Os interruptores são uma ' +
    'decisão declarada do dono e não se mexem sem ele, nem para apertar.',
  apagar_agente:
    'Apagar um agente. Parar é mudar de estado e a linha fica para ensinar. Apagar é irreversível e ' +
    'nunca é só o que se pensa.',
  alargar_catalogo:
    'Acrescentar uma acção ao catálogo de pedidos. O catálogo é fechado porque é ELE que impede a ' +
    'autonomia de se esticar um pedido de cada vez. Um CEO que o pudesse alargar não tinha limite ' +
    'nenhum — tinha um formulário.',
  conceder_imortalidade:
    'Dar imortalidade a si próprio ou a um filho. A excepção da régua de vida é NOMEADA e única: o ' +
    'topo da árvore. Não se estende por estar debaixo do CEO nem por calhar o pilar «ceo».',
  mudar_a_regua:
    'Mexer na janela das 48 h, na carência ou no orçamento inicial. Quem é medido não escolhe a ' +
    'régua.',
}

/** A pergunta «isto é meu para decidir?», respondida por pertença à lista. */
export function podeFecharSozinho(x: unknown): { pode: boolean; porque: string } {
  const id = String(x ?? '').trim()
  if (id in PODERES) {
    const p = PODERES[id as PoderId]
    return { pode: true, porque: `${p.oQue} Prova-se: ${p.comoSeProva}. Rasto: ${p.rasto}.` }
  }
  if (id in PODERES_DO_DONO) return { pode: false, porque: PODERES_DO_DONO[id] }
  return {
    pode: false,
    porque:
      `«${id || '(vazio)'}» não está na lista de poderes do CEO. O que não está na lista é do dono, ` +
      'por omissão e de propósito: uma autonomia definida pela negativa cresce sozinha à medida que ' +
      'alguém se esquece de proibir alguma coisa.',
  }
}

/**
 * O CEO A CONCEDER UM PODER — a si próprio ou a um filho.
 *
 * Este é o caminho pelo qual a autonomia se esticaria sem ninguém dar por nada: não fazendo o que
 * não pode, mas ESCREVENDO que passa a poder. Recusa-se por forma.
 */
export function validarConcessao(entrada: { poder: unknown; paraQuem: 'si_proprio' | 'filho' }): {
  pode: boolean
  porque: string
} {
  const base = podeFecharSozinho(entrada.poder)
  if (!base.pode) {
    return {
      pode: false,
      porque:
        `O CEO não pode conceder «${String(entrada.poder ?? '(vazio)')}» ` +
        `${entrada.paraQuem === 'si_proprio' ? 'a si próprio' : 'a um filho'}: ${base.porque}`,
    }
  }

  /**
   * E mesmo um poder da lista não se concede a um filho só porque o CEO o tem. Dois dos poderes
   * são de GOVERNO da equipa — educar e repor limites — e um filho com eles podia reescrever as
   * instruções de outro filho, ou as suas próprias. Um agente a editar os seus próprios limites é
   * o fim de toda esta construção, e não dá erro nenhum.
   */
  const soDoCeo: PoderId[] = ['educar_filho', 'repor_limites', 'pedir_aos_filhos', 'fechar_pedido']
  if (entrada.paraQuem === 'filho' && soDoCeo.includes(entrada.poder as PoderId)) {
    return {
      pode: false,
      porque:
        `«${String(entrada.poder)}» é poder de GOVERNO e não se delega a um filho. Um filho com ele ` +
        'reescrevia as instruções de outro filho — ou as suas próprias, e aí os limites dele ' +
        'passavam a ser escolha dele.',
    }
  }

  return { pode: true, porque: base.porque }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// «ESTE BLOQUEIO É MEU OU DO DONO?»
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// A segunda decisão que erra em silêncio, e a que o ponto 3 do pedido obriga. O CEO tem de
// desbloquear o que lhe compete e ESCALAR o que não lhe compete, com o motivo. Os dois erros
// possíveis são caros e nenhum dá erro:
//
//  · tratar como seu um bloqueio do dono — e aí ele liga um motor que manda mensagens a clientes,
//    com um registo de bom aspecto ao lado;
//  · tratar como do dono um bloqueio seu — e aí nada anda, e a lista de escalonamentos enche-se de
//    coisas que ele podia ter feito. É o oposto do pedido, e passa por prudência.

/** O que um bloqueio FAZ quando se desbloqueia. É isto que decide de quem ele é. */
export type EfeitoDoBloqueio =
  /** Fica dentro de casa: tabelas, instruções, interruptores que não mudam comportamento. */
  | 'interno'
  /** Faz sair mensagens para pessoas reais. */
  | 'mensagem_a_cliente'
  /** Publica, põe preço, lança campanha. */
  | 'publicacao'
  /** Mexe em dinheiro ou em ordens. */
  | 'dinheiro'

export interface Bloqueio {
  id: string
  /** O que está parado, e onde se vê. */
  oQue: string
  efeito: EfeitoDoBloqueio
  /** Desfaz-se sem pedir desculpa a ninguém? */
  reversivel: boolean
  /** Sabe-se dizer como se prova que correu bem? */
  comoSeProva: string | null
  /** O poder do CEO que o resolveria, quando existe um. */
  poder?: PoderId
  /** A decisão pronta a tomar, para quando é do dono. Nunca uma pergunta vaga. */
  decisaoPronta?: string
}

export interface Veredicto {
  de: 'ceo' | 'dono'
  porque: string
  poder?: PoderId
  decisaoPronta?: string
}

/**
 * DE QUEM É ESTE BLOQUEIO.
 *
 * A ordem das perguntas é a regra. Repare-se que o efeito vem ANTES da reversibilidade: um envio a
 * um cliente é do dono mesmo que alguém jure que se desfaz, porque não se desfaz — a pessoa já leu.
 */
export function deQuemE(b: Bloqueio): Veredicto {
  if (b.efeito !== 'interno') {
    const rotulo: Record<Exclude<EfeitoDoBloqueio, 'interno'>, string> = {
      mensagem_a_cliente: 'faz sair mensagens para pessoas reais, e um envio não se desfaz',
      publicacao: 'publica, põe preço ou lança campanha — e isso é de quem assume o negócio',
      dinheiro: 'mexe em dinheiro ou em ordens de trading, o que nenhum agente faz',
    }
    return {
      de: 'dono',
      porque: `Desbloquear isto ${rotulo[b.efeito]}. Fica em cima da mesa do dono, com a decisão escrita.`,
      decisaoPronta: b.decisaoPronta,
    }
  }

  if (!b.reversivel) {
    return {
      de: 'dono',
      porque:
        'É interno mas NÃO é reversível. O primeiro dos três testes da lista de poderes é desfazer-se ' +
        'com um clique; o que não se desfaz decide-se uma vez, e quem decide uma vez é o dono.',
      decisaoPronta: b.decisaoPronta,
    }
  }

  if (!b.comoSeProva) {
    return {
      de: 'dono',
      porque:
        'É interno e reversível, mas ninguém sabe dizer como se prova que correu bem. Uma automação ' +
        'que não se consegue verificar é pior do que o trabalho manual, porque falha sem se notar — ' +
        'primeiro constrói-se a medição, depois automatiza-se.',
      decisaoPronta: b.decisaoPronta,
    }
  }

  if (!b.poder) {
    return {
      de: 'dono',
      porque:
        'Passa os três testes e não há poder do CEO que o cubra. E é assim que tem de ser: a lista ' +
        'de poderes é fechada, e um bloqueio que «parece inofensivo» não se auto-autoriza — ' +
        'acrescenta-se o poder à lista, por decisão, e só depois ele o fecha sozinho.',
      decisaoPronta: b.decisaoPronta,
    }
  }

  return {
    de: 'ceo',
    porque:
      `É interno, reversível e medível (${b.comoSeProva}), e está coberto pelo poder ` +
      `«${b.poder}». O CEO fecha-o sozinho e deixa rasto em ${PODERES[b.poder].rasto}.`,
    poder: b.poder,
  }
}
