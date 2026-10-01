/**
 * COMO SE PEGA NUMA PESSOA — por onde falar, o que dizer e quando voltar.
 *
 * ═══ PORQUE É QUE ISTO EXISTE, E PORQUE É QUE É PURO ═══════════════════════════════════════
 *
 * O backoffice mostra negócios. O que não mostra é a decisão que quem trabalha leads tem de tomar
 * de cada vez que abre um: **por onde é que eu falo com esta pessoa, e o que é que lhe digo?**
 *
 * Hoje essa decisão é tomada de cabeça, uma a uma, e o retrato de 01/10/2026 diz o que isso dá:
 * 111 negócios, **106 ainda em «lead»**, 278 tarefas abertas **todas atrasadas**, 4 feitas, zero
 * closers atribuídos. Não é falta de ecrãs — é que abrir um negócio não diz a ninguém o que fazer
 * a seguir.
 *
 * E há um facto que manda em tudo e que normalmente se descobre tarde: **só 15 dos 111 têm
 * telefone.** 100 têm email. Qualquer desenho que assuma «liga-se ao lead» está a falar de 13% da
 * base. Por isso a primeira função deste ficheiro não sugere o canal ideal — sugere o canal que
 * EXISTE, e diz quando não existe nenhum.
 *
 * Puro porque um erro aqui não rebenta: manda alguém ligar para um número que não há, ou responder
 * a uma objeção que a pessoa não levantou. Ninguém vê um erro; vê-se um lead que não fecha.
 */

export type Canal = 'telefone' | 'whatsapp' | 'email' | 'telegram' | 'instagram'

export interface PessoaDoNegocio {
  nome?: string | null
  email?: string | null
  telefone?: string | null
  telegram_id?: string | number | null
  telegram_username?: string | null
  instagram_handle?: string | null
  estado?: string | null
  /** Quando a pessoa entrou no pipeline. */
  criado_em?: string | null
  /** A última vez que ALGUÉM falou com ela (evento, tarefa feita, mensagem). */
  ultimo_contacto?: string | null
  /** Quantas vezes já se tentou sem resposta. */
  tentativas?: number | null
  pack_previsto?: string | null
  interesse?: string | null
  origem?: string | null
}

export interface Caminho {
  canal: Canal
  /** O destino já pronto a usar: número, email, @handle. */
  destino: string
  /** Porque é este e não outro — para aparecer no ecrã, não só nos registos. */
  porque: string
}

/**
 * POR ONDE SE FALA COM ESTA PESSOA, por ordem de quem responde mais.
 *
 * A ordem não é opinião: é o que a origem do lead diz. Quem veio do Instagram responde no
 * Instagram e ignora emails; quem comprou no marketplace deu um email a sério e atende melhor aí.
 * Telefone primeiro só quando existe — e existe em 13% dos casos.
 *
 * Devolve TODOS os caminhos possíveis, não só o melhor: quem trabalha o lead precisa de ver as
 * alternativas quando a primeira falha, e não de voltar a adivinhar.
 */
export function caminhos(p: PessoaDoNegocio): Caminho[] {
  const fora: Caminho[] = []
  const tel = String(p.telefone ?? '').trim()
  const mail = String(p.email ?? '').trim()
  const tg = String(p.telegram_username ?? '').trim().replace(/^@/, '')
  const ig = String(p.instagram_handle ?? '').trim().replace(/^@/, '')
  const veioDoIg = String(p.origem ?? '').toLowerCase().includes('instagram')
  const veioDoTelegram = String(p.origem ?? '').toLowerCase().includes('telegram')

  if (tel) {
    // O WhatsApp vem ANTES da chamada: a chamada interrompe, a mensagem espera. E a janela de 24h
    // da Meta só abre se a pessoa escrever primeiro — por isso o primeiro toque é texto.
    fora.push({ canal: 'whatsapp', destino: tel, porque: 'Tem telefone. A mensagem espera; a chamada interrompe.' })
    fora.push({ canal: 'telefone', destino: tel, porque: 'Chamada — depois de a mensagem ficar sem resposta.' })
  }
  if (veioDoTelegram && (tg || p.telegram_id)) {
    fora.push({
      canal: 'telegram',
      destino: tg ? `@${tg}` : String(p.telegram_id),
      porque: 'Veio pelo Telegram — é onde já falou connosco.',
    })
  }
  if (veioDoIg && ig) {
    fora.push({ canal: 'instagram', destino: `@${ig}`, porque: 'Veio do Instagram — responde no Instagram, não no email.' })
  }
  if (mail) {
    fora.push({
      canal: 'email',
      destino: mail,
      porque: fora.length ? 'Email como reforço do que já se disse no outro canal.' : 'É o único contacto que esta pessoa deixou.',
    })
  }
  // Os que não vieram desse canal entram no fim: existem, mas não é lá que a conversa começou.
  if (!veioDoTelegram && (tg || p.telegram_id)) {
    fora.push({ canal: 'telegram', destino: tg ? `@${tg}` : String(p.telegram_id), porque: 'Tem Telegram.' })
  }
  if (!veioDoIg && ig) fora.push({ canal: 'instagram', destino: `@${ig}`, porque: 'Tem Instagram.' })
  return fora
}

/**
 * Quantos dias passaram. `null` quando não há data — e `null` não é zero: é «não sei», e quem lê
 * tem de o distinguir de «foi hoje».
 */
export function diasDesde(iso: string | null | undefined, agora: Date = new Date()): number | null {
  if (!iso) return null
  const t = Date.parse(String(iso))
  if (!Number.isFinite(t)) return null
  return Math.floor((agora.getTime() - t) / 86_400_000)
}

export interface ProximoPasso {
  /** O que fazer, numa frase, no imperativo. */
  accao: string
  /** O canal sugerido, quando há algum. */
  canal: Canal | null
  destino: string | null
  /** A razão — aparece no ecrã por baixo da acção. */
  porque: string
  /** 0 a 1000. Ordena a lista do dia. */
  urgencia: number
}

/**
 * O QUE FAZER A SEGUIR com esta pessoa.
 *
 * A urgência não premeia o lead mais recente: premeia o que se perde por esperar. Um lead novo que
 * ninguém tocou vale mais do que um antigo já trabalhado, e um que RESPONDEU vale mais do que
 * ambos — porque a janela de atenção de quem responde fecha em horas, não em dias.
 */
export function proximoPasso(p: PessoaDoNegocio, agora: Date = new Date()): ProximoPasso {
  const vias = caminhos(p)
  const melhor = vias[0] ?? null
  const idade = diasDesde(p.criado_em, agora)
  const desdeContacto = diasDesde(p.ultimo_contacto, agora)
  const tentativas = Math.max(0, Number(p.tentativas ?? 0))
  const estado = String(p.estado ?? 'lead')

  // Sem canal nenhum, não há passo nenhum — e é isso que tem de aparecer, em vez de uma sugestão
  // que ninguém consegue executar. Um lead sem contacto é trabalho para quem o criou, não para
  // quem o tenta trabalhar.
  if (!melhor) {
    return {
      accao: 'Encontrar um contacto antes de mais',
      canal: null, destino: null, urgencia: 200,
      porque: 'Esta pessoa não tem telefone, email, Telegram nem Instagram. Não há por onde falar.',
    }
  }

  if (estado === 'ganho' || estado === 'perdido') {
    return {
      accao: estado === 'ganho' ? 'Acompanhar o arranque' : 'Sem acção',
      canal: estado === 'ganho' ? melhor.canal : null,
      destino: estado === 'ganho' ? melhor.destino : null,
      urgencia: estado === 'ganho' ? 120 : 0,
      porque: estado === 'ganho' ? 'Já comprou: o risco agora é não arrancar.' : 'Fechado como perdido.',
    }
  }

  // Respondeu e está à espera — o caso mais caro de deixar arrefecer.
  if (estado === 'contactado' || estado === 'qualificado') {
    const d = desdeContacto ?? 0
    return {
      accao: d >= 2 ? `Retomar por ${melhor.canal}` : `Avançar por ${melhor.canal}`,
      canal: melhor.canal, destino: melhor.destino,
      urgencia: d >= 2 ? 900 : 800,
      porque: d >= 2
        ? `Já houve conversa e passaram ${d} dias. Quem respondeu uma vez responde outra — mas não daqui a uma semana.`
        : 'Está em conversa. É aqui que se marca a chamada.',
    }
  }

  if (estado === 'no_show') {
    return {
      accao: 'Remarcar sem cobrar a falta',
      canal: melhor.canal, destino: melhor.destino, urgencia: 700,
      porque: 'Faltou. Remarcar uma vez, com uma frase curta e sem culpa, recupera mais do que insistir.',
    }
  }

  // Nunca ninguém falou com esta pessoa.
  if (desdeContacto === null && tentativas === 0) {
    const novo = idade !== null && idade <= 2
    return {
      accao: `Primeiro contacto por ${melhor.canal}`,
      canal: melhor.canal, destino: melhor.destino,
      urgencia: novo ? 1000 : 600,
      porque: novo
        ? `Entrou há ${idade} dia(s) e ninguém falou com ela. É agora que responde.`
        : `Está no pipeline há ${idade ?? '?'} dias sem um único contacto.`,
    }
  }

  /**
   * SABE-SE QUE JÁ SE TENTOU, MAS NÃO QUANDO.
   *
   * Acontece porque `vendas_negocios` não guarda a data do último toque — quem chama conta as
   * tentativas pelas tarefas que já existiram para aquele negócio, e isso diz «quantas» mas não
   * «quando». Sem este ramo, o código caía no «Esperar» (porque `d` ficava 0) e mandava esperar
   * para sempre por uma data que nunca vai existir.
   *
   * E havia um erro pior, visível no ecrã a 01/10: a tarefa dizia «Segunda tentativa de contacto»
   * e a sugestão por baixo dizia «sem um único contacto». Duas frases a contradizerem-se no mesmo
   * cartão ensinam quem lê a não acreditar em nenhuma.
   */
  if (desdeContacto === null && tentativas > 0) {
    return {
      accao: `Nova tentativa por ${vias[1]?.canal ?? melhor.canal}`,
      canal: vias[1]?.canal ?? melhor.canal,
      destino: vias[1]?.destino ?? melhor.destino,
      urgencia: 450,
      porque: `Já houve ${tentativas} tentativa(s) sem resposta registada. Não se sabe a data da última — ` +
        (vias[1] ? 'muda de canal, que responde mais do que repetir o mesmo.' : 'muda o ângulo da mensagem.'),
    }
  }

  // Tentou-se e não respondeu.
  if (tentativas >= 4) {
    return {
      accao: 'Última mensagem e arquivar',
      canal: melhor.canal, destino: melhor.destino, urgencia: 150,
      porque: `${tentativas} tentativas sem resposta. Mais uma não muda nada — uma mensagem de fecho às vezes muda.`,
    }
  }
  const esperar = tentativas <= 1 ? 2 : tentativas === 2 ? 4 : 7
  const d = desdeContacto ?? 0
  if (d < esperar) {
    return {
      accao: 'Esperar',
      canal: melhor.canal, destino: melhor.destino, urgencia: 50,
      porque: `Última tentativa há ${d} dia(s). Insistir antes de ${esperar} dias queima o contacto.`,
    }
  }
  return {
    accao: `Insistir por ${vias[1]?.canal ?? melhor.canal}`,
    canal: vias[1]?.canal ?? melhor.canal,
    destino: vias[1]?.destino ?? melhor.destino,
    urgencia: 500,
    porque: vias[1]
      ? `${tentativas} tentativa(s) por ${melhor.canal} sem resposta. Mudar de canal responde mais do que repetir o mesmo.`
      : `Passaram ${d} dias desde a última tentativa.`,
  }
}

/**
 * ═══ AS OBJEÇÕES ═══════════════════════════════════════════════════════════════════════════
 *
 * Não é um guião para debitar. É o que a pessoa está mesmo a dizer por trás da frase, porque quase
 * nenhuma objeção é literal: «é caro» quase nunca é sobre o preço, é sobre não ver o que recebe.
 *
 * A resposta sugerida NUNCA inventa números. Esta casa mede a prova em pips e com origem declarada
 * — um resultado inventado para fechar uma venda é uma promessa falsa sobre dinheiro de outra
 * pessoa, e isso não se corrige com um pedido de desculpas.
 */
export interface Objeccao {
  chave: string
  /** Como a pessoa a diz. */
  comoSoa: string[]
  /** O que está mesmo por trás. */
  porTras: string
  /** O que fazer — não o que recitar. */
  resposta: string
}

export const OBJECCOES: Objeccao[] = [
  {
    chave: 'caro',
    comoSoa: ['é caro', 'não tenho dinheiro', 'está fora do meu orçamento', 'é muito dinheiro'],
    porTras: 'Não é o preço: é não ver o que recebe por ele. Ninguém acha caro aquilo cujo valor consegue medir.',
    resposta: 'Pergunta o que esperava receber por esse valor. Mostra o que está incluído, item a item, e deixa-a comparar com o que já gastou sozinha a tentar. Não baixes o preço na primeira frase — um preço que cai à primeira diz que o primeiro era inventado.',
  },
  {
    chave: 'tempo',
    comoSoa: ['não tenho tempo', 'agora não dá', 'estou muito ocupado'],
    porTras: 'Acha que isto exige horas por dia. É a ideia de que ser bom exige estar agarrado ao gráfico.',
    resposta: 'Pergunta quanto tempo tem por semana, a sério. Mostra o que se faz nesse tempo. Se for mesmo pouco, diz qual dos produtos encaixa e qual NÃO encaixa — mandar alguém para o produto errado custa mais do que não vender.',
  },
  {
    chave: 'pensar',
    comoSoa: ['vou pensar', 'depois digo', 'deixa-me ver'],
    porTras: 'Quase sempre é uma dúvida que não quis dizer em voz alta. «Vou pensar» sozinho não volta.',
    resposta: 'Pergunta o que falta saber para decidir. Combina dia e hora para falar — sem data, isto não volta. Se não quiser marcar, a dúvida é outra: procura-a.',
  },
  {
    chave: 'confianca',
    comoSoa: ['é mesmo verdade', 'isto não é esquema', 'como sei que funciona', 'já fui enganado'],
    porTras: 'Já perdeu dinheiro com alguém. A pergunta não é sobre ti — é sobre o anterior.',
    resposta: 'Dá a prova real e DIZ DE ONDE VEM: período, conta, em pips. Nunca arredondes para cima. Oferece falar com alguém que já lá está. Uma prova com origem vale mais do que dez números bonitos sem ela.',
  },
  {
    chave: 'risco',
    comoSoa: ['e se perder tudo', 'tenho medo de perder', 'isto é arriscado'],
    porTras: 'Medo legítimo, e é bom sinal — quem pergunta pelo risco é quem vai gerir risco.',
    resposta: 'Confirma que sim, há risco, e explica como se mede: tamanho por operação, stop definido antes de entrar. Não prometas que não perde. Quem promete isso perde o cliente no primeiro mês mau.',
  },
  {
    chave: 'experiencia',
    comoSoa: ['não percebo nada disto', 'sou totalmente novo', 'nunca fiz isto'],
    porTras: 'Não é objeção, é receio de não acompanhar e passar por tolo.',
    resposta: 'Diz por onde começam os que chegam sem saber nada e quanto tempo demora até à primeira operação acompanhada. Isto costuma ser um sim disfarçado.',
  },
  {
    chave: 'conjuge',
    comoSoa: ['tenho de falar com a minha mulher', 'vou falar com o meu marido', 'tenho de ver com a família'],
    porTras: 'Pode ser verdade e pode ser saída educada. As duas tratam-se igual.',
    resposta: 'Pergunta o que ele ou ela vai querer saber, e dá-lhe isso por escrito para mostrar. Combina quando voltam a falar. Nunca peças para decidir às escondidas de quem divide as contas.',
  },
  {
    chave: 'ja_tenho',
    comoSoa: ['já sigo outro', 'já tenho um grupo de sinais', 'já pago outra coisa'],
    porTras: 'Está a comparar. Dizer mal do outro põe-no a defender a escolha dele.',
    resposta: 'Pergunta o que lá tem e o que lhe falta. Se estiver bem servido, diz isso — e fica com a porta aberta. Credibilidade ganha-se a dizer «não precisas» uma vez.',
  },
]

/** Encontra a objeção pelo que a pessoa escreveu. Sem acentos e sem maiúsculas, que é como se escreve à pressa. */
export function objeccaoDe(texto: string): Objeccao | null {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!t.trim()) return null
  for (const o of OBJECCOES) {
    for (const soa of o.comoSoa) {
      const s = soa.normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (t.includes(s)) return o
    }
  }
  return null
}
