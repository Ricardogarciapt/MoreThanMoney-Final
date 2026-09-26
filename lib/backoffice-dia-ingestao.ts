import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoPipeline } from '@/lib/backoffice-vista'

/**
 * A INGESTÃO — pôr no pipeline quem já está à espera e ninguém está a trabalhar.
 *
 * O QUE ISTO VEIO RESOLVER
 * Em 25/09 a contagem era esta: pipeline com ZERO negócios e ZERO tarefas, e ao lado, na mesma
 * base de dados, 96 perfis inactivos (gente que se registou e nunca chegou a nada), 5 leads do
 * Telegram, 5 do Instagram e 1 do ManyChat. Cerca de cem pessoas paradas — algumas há meses — não
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
 * O QUE ESTA FUNÇÃO NÃO FAZ
 * Não fala com ninguém. Cria a linha no pipeline e nada mais. Quem escreve à pessoa é a pessoa da
 * equipa, a partir da tarefa que o motor prepara.
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

async function jaNoPipeline(db: SupabaseClient, chaves: string[]): Promise<Set<string>> {
  if (!chaves.length) return new Set()
  const { data } = await db.from('vendas_negocios').select('chave_origem').in('chave_origem', chaves)
  return new Set((data ?? []).map((r) => String((r as { chave_origem: string }).chave_origem)))
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
  const existentes = await jaNoPipeline(db, candidatos.map((c) => c.chave_origem))
  const novos = candidatos.filter((c) => !existentes.has(c.chave_origem)).slice(0, tecto)
  const criados = await gravar(db, novos)
  return { fonte, criados, jaExistiam: existentes.size }
}

// ── As fontes ────────────────────────────────────────────────────────────────

/** Telegram: o funil do bot. Quem já falou connosco e ficou a meio. */
async function doTelegram(db: SupabaseClient): Promise<Ingerido> {
  const { data } = await db
    .from('telegram_leads')
    .select('chat_id, username, first_name, stage, interesse, interest, source, updated_at')
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
      email: null,
      telefone: null,
      telegram_id: String(l.chat_id),
      origem: 'telegram',
      estado,
      nota: `Veio do Telegram (${nomeUtil(l.source as string, 'bot')}). Interesse: ${interesse}.`,
    })
  }
  return ingerir(db, 'telegram', candidatos)
}

/** Instagram: quem comentou com intenção. O `commenter` é uma pessoa, e é isso que faz disto um lead. */
async function doInstagram(db: SupabaseClient): Promise<Ingerido> {
  const [comentarios, manychat] = await Promise.all([
    db
      .from('ig_leads')
      .select('comment_id, commenter, keyword, intent, comment_text, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    db
      .from('mtm_leads')
      .select('id, instagram_handle, full_name, email, score, stage, source, last_interaction')
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
      origem: 'instagram',
      estado: 'lead',
      nota:
        `Comentou no Instagram` +
        (acc.palavras.length ? ` (${acc.palavras.map((p) => `«${p}»`).join(', ')})` : '') +
        (acc.textos.length ? `: ${acc.textos.join(' | ')}` : ''),
    })
  }

  for (const r of manychat.data ?? []) {
    const l = r as Record<string, unknown>
    candidatos.push({
      chave_origem: `mtm-lead:${String(l.id)}`,
      nome: nomeUtil(l.full_name as string, l.instagram_handle as string),
      email: (l.email as string) || null,
      telefone: null,
      telegram_id: null,
      origem: 'instagram',
      // `warm` e acima já falaram connosco: entram como contactados para não repetir a abordagem.
      estado: ['warm', 'hot', 'qualified'].includes(String(l.stage ?? '').toLowerCase()) ? 'contactado' : 'lead',
      nota: `Lead do Instagram (${nomeUtil(l.source as string, 'manychat')}), score ${String(l.score ?? '—')}.`,
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
    .select('id, full_name, email, created_at, is_active')
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
      nome: nomeUtil(p.full_name as string, email),
      email,
      telefone: null,
      telegram_id: null,
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
      .select('corretora, conta, cliente_nome, cliente_email, cliente_telefone, cliente_externo_id, volume_lotes, comissao_usd, estado_migracao')
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
      resultados.push({ fonte: nome, criados: 0, jaExistiam: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}
