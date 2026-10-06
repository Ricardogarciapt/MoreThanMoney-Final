/**
 * O CEO DESBLOQUEIA O QUE LHE COMPETE, E ESCALA O RESTO COM A DECISÃO PRONTA.
 *
 * ═══ O PEDIDO, E O QUE ELE NÃO É ══════════════════════════════════════════════════════════
 *
 * «Faz com que as tarefas pendentes e do pipeline fluam. Não inventes um pipeline novo: faz andar o
 * que existe.» Portanto este ficheiro não constrói máquina nenhuma — pega na lista do que já está
 * construído e parado, pergunta de quem é cada bloqueio (`autonomia-ceo.ts`), e faz ou escala.
 *
 * ═══ O CATÁLOGO É DECLARADO, NÃO DESCOBERTO ═══════════════════════════════════════════════
 *
 * {@link BLOQUEIOS} está escrito à mão, com a prova de cada um (ficheiro e linha, ou a consulta que
 * o mediu). Um descobridor automático de bloqueios era o que parecia mais inteligente e era pior:
 * teria de adivinhar o EFEITO de desbloquear cada coisa, e é precisamente o efeito que decide de
 * quem é a decisão. Um «motor de funis desligado» e um «interruptor invisível» parecem a mesma
 * linha em `site_settings`; um manda mensagens a pessoas reais e o outro não muda nada.
 *
 * Cada entrada traz também a SONDA: a pergunta à base que diz se o bloqueio ainda existe. Sem
 * sonda, um bloqueio resolvido continuava a ser escalado todos os dias, e o dono deixava de abrir a
 * lista — que é o oposto de escalar.
 *
 * ═══ O QUE ESTE FICHEIRO NUNCA FAZ ════════════════════════════════════════════════════════
 *
 * Não liga nada que envie mensagens, não publica, não mexe em preços nem em dinheiro, e não arma o
 * trader. O único tipo de escrita que ele faz em `site_settings` é tornar VISÍVEL um interruptor
 * que não existe, com o valor que a casa já pratica — ou seja, uma escrita que não muda
 * comportamento nenhum. Se mudar, está mal feita.
 */
import { deQuemE, type Bloqueio, type Veredicto } from './autonomia-ceo'

type Db = { from: (tabela: string) => any }

/** O que a sonda devolve: ainda está parado, e com que medida. */
export interface Sondagem {
  parado: boolean
  /** O número que o mediu. Vai para o escalonamento, para a decisão ser tomada sobre um facto. */
  medida: string
}

export interface BloqueioConhecido extends Bloqueio {
  /** Onde se vê o bloqueio no repositório ou na base. */
  prova: string
  /** A pergunta que diz se ainda está parado. */
  sondar: (db: Db) => Promise<Sondagem>
  /** Quando é do CEO: o que ele faz. Devolve a frase do rasto. */
  resolver?: (db: Db) => Promise<string>
}

/** Lê uma chave de `site_settings` e diz se ela EXISTE. Existir e estar a `false` não é o mesmo. */
async function chaveExiste(db: Db, key: string): Promise<{ existe: boolean; valor: unknown }> {
  const { data } = await db.from('site_settings').select('value').eq('key', key).maybeSingle()
  const linha = data as { value?: unknown } | null
  return { existe: linha != null, valor: linha?.value }
}

export const BLOQUEIOS: BloqueioConhecido[] = [
  // ───────────────────────────────────────────────────────────────────────────────────────────
  // DO CEO — interno, reversível, medível, e coberto por um poder da lista.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'funis_flag_invisivel',
    oQue:
      'A chave `site_settings.funis_motor_ligado` NÃO EXISTE na base. `lib/funis-bracos.ts:20-35` ' +
      'trata a falha de leitura como DESLIGADO — e trata bem, porque um motor que arranca por não ' +
      'conseguir perguntar se pode é um motor a arrancar sem autorização. Só que o resultado é um ' +
      'cron a correr ao minuto (`vercel.json`) sem fazer nada, e um interruptor que não aparece em ' +
      'painel nenhum porque não tem linha. Desligado em silêncio é o pior dos estados: ninguém o ' +
      'pode ligar porque ninguém sabe que ele existe.',
    prova: 'lib/funis-bracos.ts:20-35; select key from site_settings where key = \'funis_motor_ligado\' → 0 linhas',
    efeito: 'interno',
    reversivel: true,
    comoSeProva: 'a chave passa a existir com o valor `false`, que é o MESMO efeito que já havia',
    poder: 'tornar_flag_explicita',
    sondar: async (db) => {
      const { existe } = await chaveExiste(db, 'funis_motor_ligado')
      return {
        parado: !existe,
        medida: existe ? 'a chave já existe' : 'a chave não existe — desligado por falha de leitura',
      }
    },
    resolver: async (db) => {
      // `false`, nunca `true`. Escrever o valor que a casa já pratica torna o interruptor visível
      // sem mudar uma única mensagem enviada. Ligar é do dono — e está escalado logo abaixo.
      const { error } = await db
        .from('site_settings')
        .upsert({ key: 'funis_motor_ligado', value: false }, { onConflict: 'key' })
      if (error) throw new Error(error.message ?? 'erro')
      return 'funis_motor_ligado passou a existir com o valor false — o mesmo efeito de antes, agora visível e decidível.'
    },
  },
  {
    id: 'trader_flag_invisivel',
    oQue:
      'A chave `site_settings.agente_trader` não existe, logo o agente trader corre DESARMADO por ' +
      'omissão. Está certo que esteja desarmado; está errado que não se veja. Escrever ' +
      '`{"armado": false}` não muda nada no comportamento e põe a decisão à vista de quem a tem de ' +
      'tomar.',
    prova: 'lib/agentes/trader.ts (CHAVE_INTERRUPTOR); select ... where key = \'agente_trader\' → 0 linhas',
    efeito: 'interno',
    reversivel: true,
    comoSeProva: 'a chave existe com {"armado": false} e o trader continua a decidir sem abrir nada',
    poder: 'tornar_flag_explicita',
    sondar: async (db) => {
      const { existe } = await chaveExiste(db, 'agente_trader')
      return { parado: !existe, medida: existe ? 'a chave já existe' : 'a chave não existe — desarmado em silêncio' }
    },
    resolver: async (db) => {
      const { error } = await db
        .from('site_settings')
        .upsert({ key: 'agente_trader', value: { armado: false } }, { onConflict: 'key' })
      if (error) throw new Error(error.message ?? 'erro')
      return 'agente_trader passou a existir com {"armado": false} — desarmado, como já estava, mas agora visível.'
    },
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // DO DONO — porque desbloquear faz sair mensagens, publica, ou mexe na medição da casa.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'funis_motor_desligado',
    oQue:
      'O motor de funis está desligado. O cron corre ao minuto e não faz nada: um funil inteiro ' +
      'construído e parado.',
    prova: 'app/api/cron/funis/route.ts:23; vercel.json (funis, * * * * *)',
    efeito: 'mensagem_a_cliente',
    reversivel: true,
    comoSeProva: 'contam-se as mensagens que saem por dia e os leads que avançam de braço',
    decisaoPronta:
      'LIGAR OU NÃO LIGAR o motor de funis (site_settings.funis_motor_ligado = true). O que isso faz: ' +
      'passa a enviar mensagens a pessoas reais no Telegram, sem passar por ninguém. O risco que o ' +
      'próprio código nomeia é uma espera mal posta mandar três mensagens seguidas à mesma pessoa, e ' +
      'essa pessoa não voltar. O ensaio percorre o mesmo código de decisão sem tocar em ninguém — ' +
      'correr o ensaio primeiro é a forma de decidir isto com um número em vez de um palpite.',
    sondar: async (db) => {
      const { existe, valor } = await chaveExiste(db, 'funis_motor_ligado')
      const ligado = valor === true || valor === 'true'
      return {
        parado: !ligado,
        medida: existe ? `a chave existe e está ${ligado ? 'ligada' : 'desligada'}` : 'a chave não existe (conta como desligada)',
      }
    },
  },
  {
    id: 'lead_followup_sem_cron',
    oQue:
      'O follow-up de leads mornos existe, tem rota, e NÃO está no `vercel.json`. ' +
      '`lib/telegram-lead-funnel.ts:253` escreve `followup_count: 0` em cada lead, à espera de uma ' +
      'sequência de três toques que nunca corre. Código que parece correr e não corre é pior do que ' +
      'código que não existe, porque ninguém o vai procurar.',
    prova: 'app/api/cron/lead-followup/route.ts:6 («correr a cada ~2h»); ausente de vercel.json',
    efeito: 'mensagem_a_cliente',
    reversivel: true,
    comoSeProva: 'conta-se o followup_count a subir e as respostas que vêm depois de cada toque',
    decisaoPronta:
      'DUAS SAÍDAS, e qualquer uma é melhor do que a de hoje: (a) entra no vercel.json a cada 2 h, e ' +
      'passam a sair mensagens de reactivação sozinhas — e aí é um envio sem aprovação humana, que é ' +
      'uma decisão sua e não minha; ou (b) sai do repositório, e o `followup_count` deixa de ser ' +
      'escrito. O que não se deve manter é o estado actual: uma sequência escrita, a contar, e a não ' +
      'correr.',
    sondar: async () => ({
      // Esta sonda não vai à base: a prova é o `vercel.json`, que é um ficheiro do repositório e não
      // um estado de produção. Declara-se parado e diz-se onde se confirma — adivinhar o conteúdo
      // do vercel.json a partir do código em execução era inventar uma medição.
      parado: true,
      medida: 'confirma-se por leitura do vercel.json: a entrada /api/cron/lead-followup não existe',
    }),
  },
  {
    id: 'ig_setter_sem_aprovado',
    oQue:
      'O setter do Instagram tem `enviar_dm: true` e NINGUÉM escreve o estado `aprovado`: o fluxo vai ' +
      'de `rascunho` direito a `enviado` (`lib/instagram/setter.ts:266,289`). O degrau de aprovação ' +
      'humana existe no esquema (`migrations/144:70-71`) e não existe no caminho. É o único sítio da ' +
      'casa onde o limite «nada é enviado a um cliente sem aprovação humana» está declarado e não ' +
      'cumprido.',
    prova: 'supabase/migrations/144_ig_setter_rascunhos.sql:70-71; lib/instagram/setter.ts:266,289,324-325',
    efeito: 'mensagem_a_cliente',
    reversivel: false,
    comoSeProva: 'contam-se as DMs enviadas sem uma linha com estado «aprovado» antes delas',
    decisaoPronta:
      'IMPLEMENTAR OU NÃO o degrau `aprovado`. Hoje saem DMs sem passar por uma pessoa, e os ' +
      'interruptores (redigir / enviar_publica / enviar_dm) são uma decisão sua declarada a 01/10 — ' +
      'não lhes toco, nem para apertar. A decisão: ou o envio passa a exigir estado «aprovado» (e ' +
      'alguém aprova no painel, todos os dias), ou fica como está e o limite escrito nas instruções ' +
      'dos agentes deixa de corresponder ao que a casa faz. Não aponto a terceira saída, porque não ' +
      'há: um envio já lido não se desfaz.',
    sondar: async (db) => {
      const { valor } = await chaveExiste(db, 'ig_setter_persona')
      const bruto = typeof valor === 'string' ? safeJson(valor) : valor
      const enviaDm = (bruto as { enviar_dm?: unknown } | null)?.enviar_dm === true
      // Desde 06/10 o degrau existe no CAMINHO (lib/envios-aprovacao.ts + setter.ts): a DM fica
      // `pendente` e só sai de `aprovado`. O que se mede agora é se alguma DM saiu SEM decisão
      // registada depois disso — esse número tem de ser zero.
      const { count: pendentes } = await db
        .from('ig_setter_rascunhos')
        .select('comment_id', { count: 'exact', head: true })
        .eq('estado', 'pendente')
      const { count: semDecisao } = await db
        .from('ig_setter_rascunhos')
        .select('comment_id', { count: 'exact', head: true })
        .eq('estado', 'enviado')
        .eq('dm_possivel', true)
        .is('decidido_por', null)
        .gte('enviado_em', '2026-10-06T12:00:00Z')
      return {
        parado: Number(semDecisao ?? 0) > 0,
        medida: `enviar_dm=${enviaDm} (sem efeito desde 06/10); DMs por aprovar: ${Number(pendentes ?? 0)}; DMs enviadas sem decisão desde 06/10: ${Number(semDecisao ?? 0)}`,
      }
    },
  },
  {
    id: 'content_repost_sem_cron',
    oQue:
      'O repost para @ricardogarciapt existe, herda o código do agente do original, e não está no ' +
      '`vercel.json` — só corre à mão pela máquina de vendas.',
    prova: 'app/api/cron/content-repost/route.ts; lib/sales-machine.ts:290; ausente de vercel.json',
    efeito: 'publicacao',
    reversivel: true,
    comoSeProva: 'contam-se os posts republicados e o alcance de cada um',
    decisaoPronta:
      'PÔR OU NÃO o repost a correr sozinho. Com `content_autopilot.ricardo = true` — que é o estado ' +
      'de hoje — o post entra como `approved` e PUBLICA sem toque, na conta pessoal. Publicar é seu; ' +
      'a alternativa é correr com o autopilot do Ricardo a false, e aí ele prepara rascunhos e você ' +
      'aprova.',
    sondar: async () => ({ parado: true, medida: 'confirma-se por leitura do vercel.json' }),
  },
]

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A DECISÃO, PURA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface LinhaDoPlano {
  id: string
  veredicto: Veredicto
  medida: string
}

export interface PlanoDesbloqueio {
  /** Os que o CEO fecha sozinho. */
  resolver: LinhaDoPlano[]
  /** Os que vão para a mesa do dono, com a decisão escrita. */
  escalar: LinhaDoPlano[]
  /** Os que já não estão parados. Aparecem para «nada a fazer» ser distinguível de «não correu». */
  resolvidos: string[]
  resumo: string
}

/**
 * O PLANO — puro, e sem base de dados.
 *
 * Recebe o que as sondas mediram e distribui pelas duas pilhas. A classificação não é feita aqui:
 * é `deQuemE` que a faz, e de propósito — a pergunta «de quem é este bloqueio?» tem uma única
 * resposta em todo o sistema, e duas implementações dela discordariam no caso difícil.
 */
export function planearDesbloqueio(
  entradas: readonly { bloqueio: Bloqueio; sondagem: Sondagem }[],
): PlanoDesbloqueio {
  const resolver: LinhaDoPlano[] = []
  const escalar: LinhaDoPlano[] = []
  const resolvidos: string[] = []

  for (const e of entradas ?? []) {
    if (!e.sondagem.parado) {
      resolvidos.push(e.bloqueio.id)
      continue
    }
    const veredicto = deQuemE(e.bloqueio)
    const linha: LinhaDoPlano = { id: e.bloqueio.id, veredicto, medida: e.sondagem.medida }
    if (veredicto.de === 'ceo') resolver.push(linha)
    else escalar.push(linha)
  }

  const resumo =
    `Bloqueios: ${resolver.length} do CEO, ${escalar.length} para a mesa do dono, ` +
    `${resolvidos.length} já resolvido(s).`

  return { resolver, escalar, resolvidos, resumo }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A PARTE COM BASE DE DADOS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface ResultadoDesbloqueio {
  ok: boolean
  ensaio: boolean
  resolvidosAgora: Array<{ id: string; oQue: string }>
  escalados: Array<{ id: string; decisao: string }>
  jaResolvidos: string[]
  erros: string[]
  resumo: string
}

/**
 * CORRER O DESBLOQUEIO.
 *
 * `ceoId` é quem assina os escalonamentos. Sem CEO não se escala a ninguém: não se elege um
 * substituto, pela mesma razão de `ciclo-ceo.ts` — promover o primeiro agente da lista a chefe por
 * omissão era dar-lhe um poder que ninguém lhe deu.
 */
export async function correrDesbloqueio(
  db: Db,
  opcoes: { ensaio?: boolean; ceoId?: string | null } = {},
): Promise<ResultadoDesbloqueio> {
  const ensaio = opcoes.ensaio === true
  const erros: string[] = []
  const resolvidosAgora: ResultadoDesbloqueio['resolvidosAgora'] = []
  const escalados: ResultadoDesbloqueio['escalados'] = []

  const entradas: Array<{ bloqueio: BloqueioConhecido; sondagem: Sondagem }> = []
  for (const b of BLOQUEIOS) {
    try {
      entradas.push({ bloqueio: b, sondagem: await b.sondar(db) })
    } catch (e) {
      // Uma sonda que falha NÃO conta como «parado»: isso fazia o CEO resolver ou escalar com base
      // numa falha de leitura, e a frase que ficava escrita parecia perfeitamente sólida.
      erros.push(`sonda de ${b.id} falhou (${e instanceof Error ? e.message : 'erro'}) — não foi classificado nesta passagem`)
    }
  }

  const plano = planearDesbloqueio(entradas.map((e) => ({ bloqueio: e.bloqueio, sondagem: e.sondagem })))
  const porId = new Map(BLOQUEIOS.map((b) => [b.id, b]))

  for (const linha of plano.resolver) {
    const b = porId.get(linha.id)
    if (!b?.resolver) {
      erros.push(`${linha.id}: classificado como do CEO e sem forma de o resolver — defeito do catálogo`)
      continue
    }
    if (ensaio) {
      resolvidosAgora.push({ id: b.id, oQue: `[ENSAIO] ${b.comoSeProva}` })
      continue
    }
    try {
      const feito = await b.resolver(db)
      resolvidosAgora.push({ id: b.id, oQue: feito })
      if (opcoes.ceoId) {
        await db.from('agentes_eventos').insert({
          agente_id: opcoes.ceoId,
          tipo: 'desbloqueou',
          detalhe: `${b.id}: ${feito} (medido: ${linha.medida})`,
        })
      }
    } catch (e) {
      erros.push(`${b.id} não resolvido (${e instanceof Error ? e.message : 'erro'})`)
    }
  }

  for (const linha of plano.escalar) {
    const b = porId.get(linha.id)
    if (!b) continue
    const decisao = b.decisaoPronta ?? linha.veredicto.decisaoPronta
    if (!decisao) {
      // Um escalonamento sem decisão escrita é trabalho a mudar de mesa. Não se grava.
      erros.push(`${b.id}: é do dono e não traz decisão pronta — não se escala uma pergunta vaga`)
      continue
    }
    escalados.push({ id: b.id, decisao })
    if (ensaio || !opcoes.ceoId) continue

    /**
     * `onConflict: 'assunto'` não serve: o índice único é PARCIAL (só sobre os abertos), e um upsert
     * por `assunto` tentaria pisar linhas já decididas. Insere-se, e se o índice recusar é porque já
     * está em cima da mesa — o que é exactamente o comportamento que se quer, e por isso o erro de
     * duplicado não é um erro a reportar.
     */
    const { error } = await db.from('agentes_escalonamentos').insert({
      de_agente_id: opcoes.ceoId,
      assunto: b.id,
      o_que: b.oQue,
      porque: `${linha.veredicto.porque} Medido: ${linha.medida}. Prova: ${b.prova}.`,
      decisao_pronta: decisao,
    })
    if (error && !/duplicate key|already exists|unique/i.test(String(error.message ?? ''))) {
      erros.push(`${b.id} não escalado (${error.message ?? 'erro'})`)
    } else if (!error) {
      await db.from('agentes_eventos').insert({
        agente_id: opcoes.ceoId,
        tipo: 'escalou',
        detalhe: `${b.id}: ${linha.veredicto.porque.slice(0, 300)}`,
      })
    }
  }

  return {
    ok: erros.length === 0,
    ensaio,
    resolvidosAgora,
    escalados,
    jaResolvidos: plano.resolvidos,
    erros,
    resumo: plano.resumo,
  }
}
