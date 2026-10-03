import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoPipeline } from '@/lib/backoffice-vista'
import {
  COLUNAS_PREENCHIVEIS,
  SELECT_PARA_PROPAGAR,
  mudancasSeguras,
  planearPropagacao,
  type ColunaPreenchivel,
  type NegocioNoPipeline,
  type OQueAFonteSabe,
} from '@/lib/agentes/pipeline-fluxo'

/**
 * A INGESTÃO — pôr no pipeline quem já está à espera e ninguém está a trabalhar.
 *
 * O QUE ISTO VEIO RESOLVER
 * Em 25/09 a contagem era esta: pipeline com ZERO negócios e ZERO tarefas, e ao lado, na mesma
 * base de dados, 96 perfis inactivos (gente que se registou e nunca chegou a nada), 5 leads do
 * Telegram, 5 do Instagram e 1 do . Cerca de cem pessoas paradas — algumas há meses — não
 * por falta de equipa, mas porque nunca ninguém as passou do sítio onde caíram para o sítio onde
 * se trabalha.
 *
 * Esta função é essa passagem, e corre sozinha todas as manhãs.
 *
 * DUAS REGRAS QUE MANDAM AQUI
 *
 * 1. NUNCA DUPLICAR. Cada lead traz uma `chave_origem` estável (migração 135). Correr isto dez
 *    vezes seguidas dá exactamente o mesmo pipeline que correr uma vez. Um pipeline com a mesma
 *    pessoa cinco vezes não é um pipeline — é a razão pela qual a equipa deixa de o abrir.
 *
 * 2. NUNCA DESPEJAR. Há um tecto diário por fonte. Meter 96 reactivações de uma vez em cima de um
 *    setter não dá 96 conversas: dá uma pessoa a olhar para uma parede e a não começar nenhuma.
 *    Entram aos poucos, todos os dias, e os mais recentes primeiro — porque quem se registou
 *    ontem ainda se lembra de nós e quem se registou em Março já não.
 *
 * 3. (01/10) NUNCA MAIS CONGELAR. Até aqui esta passagem só INSERIA: depois da primeira cópia,
 *    nada propagava. Um lead que passou a `pending_review` no Telegram, ou que entretanto deu o
 *    `broker_uid`, continuava `lead` no pipeline para sempre, e a equipa abordava como desconhecido
 *    quem já tinha respondido a tudo. Agora propaga — e propaga com as quatro regras de
 *    `lib/agentes/pipeline-fluxo.ts`, que existem porque a CURA é mais perigosa do que o defeito:
 *    um `update` automático que escreve tudo apaga o trabalho de quem vende. O estado só anda para
 *    a frente, um negócio fechado não se toca, só se preenche o que está vazio, e a `nota` não se
 *    escreve nunca.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ
 * Não fala com ninguém. Cria e actualiza a linha no pipeline e nada mais. Quem escreve à pessoa é a
 * pessoa da equipa, a partir da tarefa que o motor prepara.
 */

/** Quantos negócios novos, no máximo, cada fonte pode trazer por dia. */
export const TECTO_POR_FONTE: Record<string, number> = {
  telegram: 15,
  instagram: 15,
  base: 10,
  // A rede de IBs leva mais: são as pessoas com maior probabilidade de fechar de todas as fontes.
  // Já negoceiam, já depositaram, já sabem o que é uma corretora — não é preciso explicar o
  // produto a ninguém, é preciso mudar uma conta de sítio.
  corretora: 20,
}

export interface Ingerido {
  fonte: string
  criados: number
  jaExistiam: number
  /** Quantos negócios que JÁ existiam ficaram a par do que a fonte sabe hoje. */
  actualizados: number
  /**
   * Uma frase sobre a propagação. Aparece sempre, mesmo quando é zero: um dia em que não houve nada
   * a propagar tem de ser distinguível de um dia em que a propagação não correu.
   */
  propagacao: string
  erro?: string
}

interface Candidato {
  chave_origem: string
  nome: string
  email: string | null
  telefone: string | null
  telegram_id: string | null
  origem: string
  estado: EstadoPipeline
  nota: string
  /**
   * Quem é esta pessoa no site, quando já se sabe.
   *
   * Isto não é decoração: é a coluna por onde o livro das comissões liga um pagamento ao negócio
   * (`lib/vendas/atribuicao.ts`). Ficou vazia nos primeiros 97 negócios, e o resultado foi que
   * nenhum pagamento encontrava a equipa que o tinha trabalhado. Quem cria o lead a partir de um
   * perfil tem o id na mão — escreve-o.
   */
  comprador_id?: string | null

  /**
   * O QUE SE PERDIA AQUI, E PORQUE É QUE ISTO NÃO É DECORAÇÃO.
   *
   * A 26/09, com a migração 142 ainda por aplicar, a ingestão descartava tudo isto e enterrava o
   * resto em prosa dentro da `nota`. O resultado é um pipeline onde não se consegue responder à
   * pergunta mais básica de uma campanha: «a quem é que isto interessa, e em que língua?». Uma
   * coisa escrita na nota não se segmenta — e sem segmentar não há campanha, há um envio para todos.
   *
   * Concretamente, o que estava a ser deitado fora:
   *   · 59 perfis sabem o idioma, e 48 o país — o pipeline escrevia a todos em português.
   *   · 5 perfis têm telefone e a linha do negócio guardava `telefone: null`.
   *   · o `interesse` do bot e a palavra comentada no Instagram — o campo que separa quem quer
   *     copytrading de quem quer aprender, dois discursos diferentes a receber o mesmo email.
   *   · o `broker_uid` do bot: já abriu conta na corretora. É o sinal mais quente desta casa, e ia
   *     directo para o lixo à entrada do pipeline.
   *   · o handle do Instagram, que nestas pessoas é o ÚNICO contacto que existe e vivia escondido
   *     dentro da chave de deduplicação.
   *
   * Nada disto é inventado: é o que a fonte dá. Onde a fonte não dá, fica nulo — um país adivinhado
   * pelo prefixo do telefone seria pior do que campo vazio, porque parece um dado.
   */
  idioma?: string | null
  pais?: string | null
  interesse?: string | null
  instagram_handle?: string | null
  telegram_username?: string | null
  broker_uid?: string | null
  etiquetas?: string[] | null
}

/** O que a fonte deu, ou nulo. Nunca string vazia: uma coluna com '' finge que há dado onde não há. */
function ouNulo(...tentativas: Array<string | null | undefined>): string | null {
  for (const t of tentativas) {
    const s = (t ?? '').toString().trim()
    if (s) return s.slice(0, 200)
  }
  return null
}

/**
 * Emails que não são de ninguém.
 *
 * Encontrado no ensaio: `frangauci@test.com` ia entrar no pipeline e ocupar o lugar de uma pessoa
 * a sério. São domínios reservados para exemplos e testes (RFC 2606) mais os que aparecem em
 * formulários preenchidos à pressa. Filtra-se só o que é indiscutível — um registo estrangeiro
 * frio continua a ser um lead, e descartá-lo por parecer improvável seria eu a decidir por quem
 * vende.
 */
const DOMINIOS_DE_MENTIRA = ['test.com', 'example.com', 'example.org', 'example.net', 'teste.com', 'mailinator.com']

function ehEmailDeMentira(email: string): boolean {
  const dominio = email.split('@')[1] ?? ''
  return DOMINIOS_DE_MENTIRA.includes(dominio)
}

/** Um nome apresentável a partir do que a fonte deu. Nunca vazio — uma linha sem nome não se trabalha. */
function nomeUtil(...tentativas: Array<string | null | undefined>): string {
  for (const t of tentativas) {
    const s = (t ?? '').toString().trim()
    if (s) return s.slice(0, 120)
  }
  return 'Sem nome'
}

/**
 * Onde é que este lead entra no funil.
 *
 * Um lead do Telegram que já respondeu a perguntas não é um lead cru — pô-lo em `lead` obrigava o
 * prospector a repetir uma conversa que já aconteceu, e a pessoa do outro lado a responder duas
 * vezes ao mesmo. O estado tem de reflectir o que já se sabe dela.
 */
function estadoDoLeadTelegram(stage: string | null): EstadoPipeline | null {
  switch ((stage ?? '').toLowerCase()) {
    // `granted` NÃO é um lead: é alguém a quem já foi dado acesso. Pô-lo no pipeline mandava a
    // equipa abordar um cliente como se fosse desconhecido — o erro que mais depressa faz um
    // cliente perder a confiança em nós.
    case 'granted':
      return null
    case 'pending_review':
      return 'qualificado'
    case 'qualifying':
      return 'contactado'
    default:
      return 'lead'
  }
}

/**
 * O que já está no pipeline, com o suficiente para decidir o que propagar.
 *
 * Lê-se mais do que a chave de propósito: sem o estado e sem os valores actuais não há como saber
 * se uma propagação ANDA PARA A FRENTE ou se pisa o que uma pessoa escreveu — e essa decisão não
 * se adivinha pelo que a fonte traz.
 */
async function lerDoPipeline(
  db: SupabaseClient,
  chaves: string[],
): Promise<Map<string, NegocioNoPipeline>> {
  const mapa = new Map<string, NegocioNoPipeline>()
  if (!chaves.length) return mapa
  const { data } = await db
    .from('vendas_negocios')
    // O literal vive em `pipeline-fluxo.ts`, ao lado da lista de colunas, e o `.check.ts` confirma
    // que os dois dizem o mesmo. Ver o comentário de `SELECT_PARA_PROPAGAR` para o porquê.
    .select(SELECT_PARA_PROPAGAR)
    .in('chave_origem', chaves)
  for (const r of data ?? []) {
    const linha = r as Record<string, unknown>
    const valores: Partial<Record<ColunaPreenchivel, unknown>> = {}
    for (const c of COLUNAS_PREENCHIVEIS) valores[c] = linha[c]
    mapa.set(String(linha.chave_origem), {
      id: String(linha.id),
      chave_origem: String(linha.chave_origem),
      estado: (linha.estado as string | null) ?? null,
      valores,
    })
  }
  return mapa
}

/**
 * PROPAGAR PARA QUEM JÁ ESTÁ LÁ.
 *
 * O tecto diário NÃO se aplica aqui, e é uma decisão: o tecto existe para não despejar conversas
 * novas em cima de uma pessoa, e uma actualização não é uma conversa nova. Travar as actualizações
 * pelo mesmo número deixava metade do pipeline desactualizado num dia de muitos leads novos.
 */
async function propagar(
  db: SupabaseClient,
  candidatos: Candidato[],
  existentes: Map<string, NegocioNoPipeline>,
): Promise<{ actualizados: number; resumo: string }> {
  const fontes: OQueAFonteSabe[] = candidatos
    .filter((c) => existentes.has(c.chave_origem))
    .map((c) => {
      const valores: Partial<Record<ColunaPreenchivel, unknown>> = {}
      const comoRegisto = c as unknown as Record<string, unknown>
      for (const col of COLUNAS_PREENCHIVEIS) valores[col] = comoRegisto[col]
      return { chave_origem: c.chave_origem, estado: c.estado, valores }
    })

  const plano = planearPropagacao({ negocios: [...existentes.values()], fontes })
  let actualizados = 0
  for (const p of plano.propagar) {
    const campos = mudancasSeguras(p.mudancas as Record<string, unknown>)
    if (!Object.keys(campos).length) continue
    const { error } = await db
      .from('vendas_negocios')
      .update({ ...campos, atualizado_em: new Date().toISOString() })
      .eq('id', p.negocioId)
    if (!error) actualizados++
  }
  return { actualizados, resumo: plano.resumo }
}

/**
 * Grava os que faltam.
 *
 * `ignoreDuplicates` e não um erro: entre a leitura e a escrita pode entrar alguém pela mão de uma
 * pessoa, e nesse caso a linha dela é que vale. A ingestão nunca atropela trabalho humano.
 */
async function gravar(db: SupabaseClient, novos: Candidato[]): Promise<number> {
  if (!novos.length) return 0
  const { error, count } = await db
    .from('vendas_negocios')
    .upsert(novos, { onConflict: 'chave_origem', ignoreDuplicates: true, count: 'exact' })
  if (error) throw new Error(error.message)
  return count ?? novos.length
}

async function ingerir(
  db: SupabaseClient,
  fonte: string,
  candidatos: Candidato[],
): Promise<Ingerido> {
  const tecto = TECTO_POR_FONTE[fonte] ?? 10
  const existentes = await lerDoPipeline(db, candidatos.map((c) => c.chave_origem))
  const novos = candidatos.filter((c) => !existentes.has(c.chave_origem)).slice(0, tecto)
  const criados = await gravar(db, novos)
  // Propaga-se DEPOIS de inserir, e nunca sobre o que acabou de entrar: o que acabou de entrar já
  // veio com o que a fonte sabe, e um update em cima dele era trabalho a dobrar com risco a dobrar.
  const prop = await propagar(db, candidatos, existentes)
  return {
    fonte,
    criados,
    jaExistiam: existentes.size,
    actualizados: prop.actualizados,
    propagacao: prop.resumo,
  }
}

// ── As fontes ────────────────────────────────────────────────────────────────

/** Telegram: o funil do bot. Quem já falou connosco e ficou a meio. */
async function doTelegram(db: SupabaseClient): Promise<Ingerido> {
  const { data } = await db
    .from('telegram_leads')
    .select('chat_id, username, first_name, stage, interesse, interest, source, updated_at, lang, tags, broker_uid, email, telefone')
    .order('updated_at', { ascending: false })
    .limit(200)

  const candidatos: Candidato[] = []
  for (const r of data ?? []) {
    const l = r as Record<string, unknown>
    const estado = estadoDoLeadTelegram(l.stage as string)
    if (!estado) continue // já é cliente — ver `estadoDoLeadTelegram`
    const interesse = nomeUtil(l.interesse as string, l.interest as string, 'sem interesse declarado')
    candidatos.push({
      chave_origem: `telegram:${String(l.chat_id)}`,
      nome: nomeUtil(l.first_name as string, l.username as string, `Telegram ${String(l.chat_id)}`),
      // Colunas novas (migração 142): até aqui o funil do bot não tinha onde aterrar um email, e
      // quatro dos seis leads existiam apenas como um número de conversa.
      email: ouNulo(l.email as string),
      telefone: ouNulo(l.telefone as string),
      telegram_id: String(l.chat_id),
      telegram_username: ouNulo(l.username as string),
      idioma: ouNulo(l.lang as string),
      interesse: ouNulo(l.interesse as string, l.interest as string),
      // Já abriu conta. Quem tem isto não é um lead frio — e a nota dizia-o em prosa, onde nenhuma
      // segmentação o encontrava.
      broker_uid: ouNulo(l.broker_uid as string),
      etiquetas: Array.isArray(l.tags) ? (l.tags as string[]) : null,
      origem: 'telegram',
      estado,
      nota: `Veio do Telegram (${nomeUtil(l.source as string, 'bot')}). Interesse: ${interesse}.`,
    })
  }
  return ingerir(db, 'telegram', candidatos)
}

/** Instagram: quem comentou com intenção. O `commenter` é uma pessoa, e é isso que faz disto um lead. */
async function doInstagram(db: SupabaseClient): Promise<Ingerido> {
  const [comentarios, ] = await Promise.all([
    db
      .from('ig_leads')
      .select('comment_id, commenter, keyword, intent, comment_text, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    db
      .from('mtm_leads')
      .select('id, instagram_handle, full_name, email, score, stage, source, last_interaction, country')
      .order('last_interaction', { ascending: false })
      .limit(200),
  ])

  const candidatos: Candidato[] = []

  /**
   * UM NEGÓCIO POR PESSOA, e não um por comentário.
   *
   * A primeira versão deste código usava o `comment_id` como chave. O ensaio mostrou o resultado:
   * o mesmo `ruipaulo.fxcripto` cinco vezes seguidas na lista de trabalho de uma pessoa, porque
   * tinha comentado cinco vezes. É a forma mais rápida de alguém deixar de confiar na lista — e
   * pior, de o Rui Paulo receber cinco abordagens diferentes da mesma empresa no mesmo dia.
   *
   * A chave é a PESSOA. Os vários comentários dela juntam-se numa nota só, que é contexto útil
   * para quem vai falar com ela: quem comentou «Premium» e «DESAFIO» está mais quente do que quem
   * comentou uma vez.
   */
  const porPessoa = new Map<string, { quem: string; palavras: string[]; textos: string[] }>()
  for (const r of comentarios.data ?? []) {
    const l = r as Record<string, unknown>
    const quem = nomeUtil(l.commenter as string)
    if (quem === 'Sem nome') continue // sem pessoa não há negócio
    const chave = quem.toLowerCase()
    const acc = porPessoa.get(chave) ?? { quem, palavras: [], textos: [] }
    const palavra = (l.keyword as string) ?? ''
    if (palavra && !acc.palavras.includes(palavra)) acc.palavras.push(palavra)
    const texto = ((l.comment_text as string) ?? '').trim()
    if (texto && acc.textos.length < 3 && !acc.textos.includes(texto)) acc.textos.push(texto)
    porPessoa.set(chave, acc)
  }

  for (const [chave, acc] of porPessoa) {
    candidatos.push({
      chave_origem: `ig-pessoa:${chave}`,
      nome: acc.quem,
      email: null,
      telefone: null,
      telegram_id: null,
      // O handle é o ÚNICO contacto que existe destas pessoas. Tê-lo só dentro da chave de
      // deduplicação era tê-lo escondido de quem tem de lhes escrever.
      instagram_handle: acc.quem,
      // A palavra que a pessoa comentou é o que ela declarou querer. «Premium» e «DESAFIO» não são
      // a mesma conversa.
      interesse: ouNulo(acc.palavras[0]),
      origem: 'instagram',
      estado: 'lead',
      nota:
        `Comentou no Instagram` +
        (acc.palavras.length ? ` (${acc.palavras.map((p) => `«${p}»`).join(', ')})` : '') +
        (acc.textos.length ? `: ${acc.textos.join(' | ')}` : ''),
    })
  }

  for (const r of .data ?? []) {
    const l = r as Record<string, unknown>
    candidatos.push({
      chave_origem: `mtm-lead:${String(l.id)}`,
      nome: nomeUtil(l.full_name as string, l.instagram_handle as string),
      email: (l.email as string) || null,
      telefone: null,
      telegram_id: null,
      instagram_handle: ouNulo(l.instagram_handle as string),
      pais: ouNulo(l.country as string),
      origem: 'instagram',
      // `warm` e acima já falaram connosco: entram como contactados para não repetir a abordagem.
      estado: ['warm', 'hot', 'qualified'].includes(String(l.stage ?? '').toLowerCase()) ? 'contactado' : 'lead',
      nota: `Lead do Instagram (${nomeUtil(l.source as string, '')}), score ${String(l.score ?? '—')}.`,
    })
  }

  return ingerir(db, 'instagram', candidatos)
}

/**
 * A BASE — quem já cá está e nunca chegou a nada.
 *
 * São 96 pessoas que se registaram e ficaram por ali. É a fonte mais barata que existe: já sabem
 * quem somos, já deram o email, e alguma coisa as trouxe cá. Custa zero em publicidade e é a
 * primeira coisa que qualquer operação séria trabalha antes de ir comprar tráfego novo.
 *
 * Entram os mais recentes primeiro, e nunca mais de dez por dia — reactivação feita à pressa lê-se
 * como spam, e queimava a lista que se queria recuperar.
 */
async function daBase(db: SupabaseClient): Promise<Ingerido> {
  const { data } = await db
    .from('profiles')
    .select('id, full_name, email, phone, whatsapp, country, preferred_language, detected_language, created_at, is_active')
    .not('is_active', 'is', true)
    .order('created_at', { ascending: false })
    .limit(200)

  const candidatos: Candidato[] = []
  for (const r of data ?? []) {
    const p = r as Record<string, unknown>
    const email = ((p.email as string) || '').trim().toLowerCase()
    if (!email || ehEmailDeMentira(email)) continue
    candidatos.push({
      chave_origem: `perfil:${String(p.id)}`,
      comprador_id: String(p.id),
      nome: nomeUtil(p.full_name as string, email),
      email,
      // O perfil TEM telefone em 5 casos e o pipeline escrevia `null`. Uma pessoa a quem se pode
      // ligar e a que só se manda email é uma conversa que não acontece.
      telefone: ouNulo(p.phone as string, p.whatsapp as string),
      telegram_id: null,
      pais: ouNulo(p.country as string),
      // `preferred_language` primeiro: é o que a pessoa escolheu. O detectado é um palpite do
      // browser e só vale quando ela não escolheu nada.
      idioma: ouNulo(p.preferred_language as string, p.detected_language as string),
      origem: 'base',
      estado: 'lead',
      nota: `Registou-se em ${String(p.created_at ?? '').slice(0, 10)} e nunca activou. Reactivação.`,
    })
  }
  return ingerir(db, 'base', candidatos)
}

/**
 * A REDE DE IBs — as pessoas que já negoceiam, só que noutra casa.
 *
 * É a melhor fonte de leads que a MTM tem, e esteve fechada num Excel até hoje. Não é gente a
 * quem é preciso explicar o que é trading: é gente que já abriu conta, já depositou e já negociou
 * — só que a comissão do que ela faz está a ser paga à Infinox, à Hantec ou à VT Markets. Trazer
 * uma destas pessoas não é uma venda nova, é mudar uma conta de sítio.
 *
 * SÓ ENTRA QUEM SE CONSEGUE CONTACTAR. Uma boa parte das linhas das exportações não traz nome nem
 * email (as contas de segundo nível da Hantec vêm todas com `N/A`). Um lead sem forma de lhe
 * chegar não é um lead — é uma linha numa lista que faz a lista parecer maior do que é, e faz a
 * pessoa que a trabalha perder a confiança nela ao terceiro nome sem contacto.
 *
 * E SÓ ENTRA QUEM ESTÁ MARCADO `a_transitar`. As contas `a_fechar` (sem volume, sem depósito, sem
 * comissão) ficam de fora de propósito: são a maioria, e enchê-las na lista de alguém é a forma
 * mais rápida de enterrar as que valem a pena.
 */
async function daRedeIb(db: SupabaseClient): Promise<Ingerido> {
  const [{ data }, { data: daCasa }, { data: ibs }] = await Promise.all([
    db
      .from('ib_contas')
      .select('corretora, conta, cliente_nome, cliente_email, cliente_telefone, cliente_externo_id, volume_lotes, comissao_usd, estado_migracao, pais')
      .eq('estado_migracao', 'a_transitar')
      .order('volume_lotes', { ascending: false, nullsFirst: false })
      .limit(500),
    // Quem já é membro da casa não é lead. Ver a explicação abaixo.
    db.from('profiles').select('email'),
    db.from('ib_membros').select('user_id').is('ate', null),
  ])

  /**
   * QUEM JÁ É NOSSO NÃO ENTRA.
   *
   * A primeira versão pôs o Rui Rodrigues no pipeline como lead a angariar. O Rui é sub-IB da
   * rede e está na árvore de MLM — mandar um setter «abrir conversa» com ele é o tipo de coisa
   * que faz uma equipa perder a confiança na lista à primeira linha que lê.
   *
   * Compara-se pelo email, que é o que as duas pontas têm em comum. Não é perfeito (quem usar um
   * email diferente na corretora escapa), mas apanha o caso normal e nunca exclui ninguém a mais.
   */
  const emailsDaCasa = new Set(
    (daCasa ?? [])
      .map((r) => ((r as { email: string | null }).email ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
  void ibs

  /**
   * UM NEGÓCIO POR PESSOA, e não um por conta.
   *
   * É a segunda vez que caio neste erro no mesmo dia — primeiro com os comentários do Instagram,
   * agora com as contas de corretora. O Nuno Fernandes tem quatro contas na Hantec, e a versão
   * anterior punha-o quatro vezes na lista de trabalho de alguém. Duas abordagens da mesma empresa
   * no mesmo dia já é mau; quatro é indefensável.
   *
   * As contas dele juntam-se numa linha só, com o volume e a comissão SOMADOS — que é, aliás, o
   * número que interessa para decidir se vale a pena a conversa.
   */
  interface Pessoa {
    nome: string
    email: string | null
    telefone: string | null
    corretora: string
    pais: string | null
    contas: string[]
    lotes: number
    comissao: number
  }

  const porPessoa = new Map<string, Pessoa>()
  for (const r of data ?? []) {
    const c = r as Record<string, unknown>
    const email = ((c.cliente_email as string) || '').trim().toLowerCase()
    const telefone = ((c.cliente_telefone as string) || '').trim()
    if (!email && !telefone) continue // sem forma de contactar não há lead
    if (email && ehEmailDeMentira(email)) continue
    if (email && emailsDaCasa.has(email)) continue

    const corretora = String(c.corretora)
    // A chave é a pessoa: o identificador dela na corretora, ou o email, ou o telefone.
    const chave = `ib:${corretora}:${String(c.cliente_externo_id || email || telefone)}`
    const acc = porPessoa.get(chave) ?? {
      nome: nomeUtil(c.cliente_nome as string),
      email: email || null,
      telefone: telefone || null,
      corretora,
      pais: ouNulo(c.pais as string),
      contas: [],
      lotes: 0,
      comissao: 0,
    }
    acc.contas.push(String(c.conta))
    acc.lotes += Number(c.volume_lotes ?? 0)
    acc.comissao += Number(c.comissao_usd ?? 0)
    porPessoa.set(chave, acc)
  }

  const candidatos: Candidato[] = [...porPessoa.entries()]
    // Pelo volume somado: quem negocia mais é quem mais vale a pena trazer.
    .sort((a, b) => b[1].lotes - a[1].lotes)
    .map(([chave, p]) => ({
      chave_origem: chave,
      nome: p.nome === 'Sem nome' ? `Conta ${p.contas[0]}` : p.nome,
      email: p.email,
      telefone: p.telefone,
      telegram_id: null,
      pais: p.pais,
      origem: 'corretora',
      estado: 'lead' as const,
      nota:
        `Negoceia na ${p.corretora} — ${p.contas.length} ${p.contas.length === 1 ? 'conta' : 'contas'} ` +
        `(${p.contas.join(', ')}). ` +
        `${p.lotes > 0 ? `${p.lotes.toFixed(2)} lotes. ` : ''}` +
        `${p.comissao > 0 ? `${p.comissao.toFixed(2)} USD de comissão paga a essa casa. ` : ''}` +
        `Objectivo: trazer para a PU Prime.`,
    }))

  return ingerir(db, 'corretora', candidatos)
}

/**
 * Corre todas as fontes.
 *
 * Uma fonte que rebente não pode levar as outras atrás: o Instagram fica sem quota de API com
 * frequência, e não é razão para o Telegram e a base ficarem por trabalhar nesse dia.
 */
export async function ingerirLeads(db: SupabaseClient): Promise<Ingerido[]> {
  const fontes: Array<[string, () => Promise<Ingerido>]> = [
    ['telegram', () => doTelegram(db)],
    ['instagram', () => doInstagram(db)],
    ['base', () => daBase(db)],
    ['corretora', () => daRedeIb(db)],
  ]

  const resultados: Ingerido[] = []
  for (const [nome, correr] of fontes) {
    try {
      resultados.push(await correr())
    } catch (e) {
      resultados.push({
        fonte: nome,
        criados: 0,
        jaExistiam: 0,
        actualizados: 0,
        propagacao: 'Não propagou: a fonte falhou antes disso.',
        erro: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return resultados
}
