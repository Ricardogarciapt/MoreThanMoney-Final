import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from '@/lib/mtmcopy/exec-switches'

/**
 * O estado do negócio inteiro, numa leitura.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────────────────────────
 * A administração cresceu em ilhas: doze páginas, quatro barras laterais, e a mesma verdade
 * contada de maneiras diferentes em cada uma. Os leads do Telegram estavam em três sítios com
 * três contagens; havia três listas de utilizadores sobre a mesma tabela; e três lojas de
 * definições incompatíveis, uma delas um ficheiro em disco que num servidor sem disco não guarda
 * nada.
 *
 * O problema disto não é serem muitas páginas — é não haver um sítio onde a pergunta "está tudo
 * bem?" tenha resposta. Quem administra passa o tempo a saltar entre ecrãs a juntar pedaços, e a
 * coisa que está partida costuma ser a que não estava em ecrã nenhum.
 *
 * Isto lê tudo de uma vez e responde a três perguntas, por esta ordem:
 *   1. O que está PARTIDO agora?
 *   2. Onde é que o dinheiro está a travar?
 *   3. O que está a correr sozinho, e está mesmo?
 *
 * ── O que isto NÃO faz ───────────────────────────────────────────────────────────────────────
 * Não substitui as páginas que existem: elas continuam a ser onde se trabalha. Isto é o sítio de
 * onde se parte — e as ligações levam lá. Uma reescrita que apagasse doze ecrãs de uma vez
 * partiria coisas que só se descobrem em produção, e o mais provável era ficar tudo pior durante
 * um mês.
 */

export type Gravidade = 'partido' | 'atencao' | 'ok'

export interface Alerta {
  gravidade: Gravidade
  titulo: string
  /** Porque é que isto importa, em linguagem de quem decide. */
  detalhe: string
  /** Onde se resolve. */
  href?: string
}

export interface Degrau {
  nome: string
  n: number
  fonte: string
  passou: number | null
}

export interface Motor {
  nome: string
  ligado: boolean
  /** Quando deu sinal de vida pela última vez. Null = nunca. */
  ultimoSinal: string | null
  detalhe: string
}

export interface Dinheiro {
  /** Recebido este mês, em euros. */
  mes: number
  /** O mesmo mês passado, para o número de hoje ter com o que se comparar. */
  mesPassado: number
  /** Cobranças que falharam e ainda não foram recuperadas. */
  falhasAbertas: number
  /** O valor dessas falhas. */
  falhasEur: number
  assinantesAtivos: number
  novos7d: number
  expiramEm7d: number
  contasCopia: number
}

export interface EstadoComando {
  quando: string
  alertas: Alerta[]
  escada: Degrau[]
  motores: Motor[]
  dinheiro: Dinheiro
  conteudo: { porAprovar: number; agendados: number; publicados7d: number; falhados: number }
  atencaoIA: { automacoes: number; ativas: number; disparos: number; naFila: number; radarPorTratar: number }
}

const iso = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()

export async function estadoComando(): Promise<EstadoComando> {
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()

  const [
    switches,
    { data: sets },
    { count: leads },
    { count: broker },
    { count: registados },
    { count: ativos },
    { count: novos7d },
    { count: expiram7d },
    { count: contasCopia },
    { data: automacoes },
    { count: naFila },
    { count: radar },
    { data: posts },
    { data: sinais },
    { data: execucoes },
    { data: tokensIg },
  ] = await Promise.all([
    getExecSwitches(),
    db.from('site_settings').select('key, value').in('key', ['funis_motor_ligado', 'content_autopilot', 'instagram_tokens', 'pips_proof']),
    db.from('telegram_leads').select('chat_id', { count: 'exact', head: true }),
    db.from('broker_clients').select('uid', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
    db.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', iso(7)),
    db.from('profiles').select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'active').lte('subscription_expires_at', iso(-7)).gte('subscription_expires_at', agora),
    db.from('mtmcopy_connections').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('mtm_automacoes').select('ativa, disparos, ultimo_disparo'),
    db.from('mtm_conversa_fila').select('id', { count: 'exact', head: true }).eq('processada', false),
    db.from('ig_radar_prospetos').select('id', { count: 'exact', head: true }).eq('estado', 'pendente'),
    db.from('social_scheduled_posts').select('status, scheduled_at, media_urls'),
    db.from('tradingview_signals').select('id, received_at').gte('received_at', iso(1)).limit(200),
    db.from('mtmcopy_signal_log').select('status, created_at').gte('created_at', iso(1)).limit(300),
    db.from('site_settings').select('value').eq('key', 'instagram_tokens').maybeSingle(),
  ])

  /**
   * O dinheiro.
   *
   * Faltava por inteiro — e é o primeiro número que se procura. Os valores em `payment_history`
   * estão em CÊNTIMOS: mostrá-los como euros dava um negócio cem vezes maior do que é.
   */
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0)
  const inicioMesPassado = new Date(inicioMes); inicioMesPassado.setMonth(inicioMesPassado.getMonth() - 1)

  const { data: pagamentos } = await db
    .from('payment_history')
    .select('amount, status, created_at, user_id')
    .gte('created_at', inicioMesPassado.toISOString())

  const eur = (linhas: Array<{ amount: number | null }>) =>
    Math.round(linhas.reduce((t, x) => t + (Number(x.amount) || 0), 0)) / 100

  const pagos = (pagamentos ?? []).filter((x) => x.status === 'succeeded')
  const receitaMes = eur(pagos.filter((x) => String(x.created_at) >= inicioMes.toISOString()))
  const receitaMesPassado = eur(pagos.filter((x) => String(x.created_at) < inicioMes.toISOString()))

  /**
   * Falhas que ninguém recuperou.
   *
   * Uma cobrança falhada seguida de uma boa é um cartão que foi corrigido — não conta. O que
   * conta é quem falhou e nunca mais pagou: ou perdeu-se o cliente, ou ficou com acesso sem
   * pagar, e as duas custam dinheiro em direcções opostas.
   */
  const falhadas = (pagamentos ?? []).filter((x) => x.status === 'failed')
  const porUser = new Map<string, { n: number; valor: number; ultima: string }>()
  for (const f of falhadas) {
    const u = String(f.user_id)
    const a = porUser.get(u) ?? { n: 0, valor: 0, ultima: '' }
    a.n++
    a.valor = Math.max(a.valor, (Number(f.amount) || 0) / 100)
    a.ultima = String(f.created_at) > a.ultima ? String(f.created_at) : a.ultima
    porUser.set(u, a)
  }
  for (const [u, a] of porUser) {
    if (pagos.some((p) => String(p.user_id) === u && String(p.created_at) > a.ultima)) porUser.delete(u)
  }
  const falhasAbertas = porUser.size
  const falhasEur = Math.round([...porUser.values()].reduce((t, a) => t + a.valor, 0) * 100) / 100

  const chave = (k: string) => (sets ?? []).find((s) => s.key === k)?.value
  const alertas: Alerta[] = []

  // ── 1. O que está partido ──────────────────────────────────────────────────────────────────
  const autopiloto = (chave('content_autopilot') ?? {}) as { morethanmoney?: boolean; ricardo?: boolean }
  const listaPosts = posts ?? []
  const porAprovar = listaPosts.filter((p) => p.status === 'draft').length
  const semImagem = listaPosts.filter(
    (p) => p.status === 'approved' && !(Array.isArray(p.media_urls) && p.media_urls.length),
  ).length
  const falhados = listaPosts.filter((p) => p.status === 'failed').length
  const agendados = listaPosts.filter((p) => p.status === 'approved').length
  const publicados7d = listaPosts.filter(
    (p) => p.status === 'published' && String(p.scheduled_at ?? '') >= iso(7),
  ).length

  if (semImagem) {
    alertas.push({
      gravidade: 'partido',
      titulo: `${semImagem} post(s) aprovado(s) sem imagem`,
      detalhe: 'Aprovados mas nunca publicam: a publicação exige imagem. Ficam na fila em silêncio.',
      href: '/admin/social',
    })
  }
  if (!agendados && !porAprovar) {
    alertas.push({
      gravidade: 'atencao',
      titulo: 'Fila de conteúdo vazia',
      detalhe: 'Não há nada agendado. Sem posts não há comentários, e sem comentários não há leads.',
      href: '/admin/social',
    })
  }

  // Tokens do Instagram: um token que caduca não parte nada com estrondo — apenas deixa de
  // publicar, e o painel de conteúdo continua com o mesmo ar de sempre.
  const tokens = ((typeof tokensIg?.value === 'string' ? JSON.parse(tokensIg.value) : tokensIg?.value) ?? {}) as Record<string, string>
  if (!Object.keys(tokens).length) {
    alertas.push({
      gravidade: 'atencao',
      titulo: 'Instagram sem token guardado',
      detalhe: 'Corre pelo ambiente da Vercel — que não se consegue ler daqui para confirmar. Vale a pena guardar no painel.',
      href: '/admin/social',
    })
  }

  const autos = automacoes ?? []
  const ativas = autos.filter((a) => a.ativa === true).length
  if (autos.length && !ativas) {
    alertas.push({
      gravidade: 'partido',
      titulo: 'Todas as automações desligadas',
      detalhe: 'Existem regras criadas mas nenhuma responde. Um motor sem regras não se queixa — fica calado.',
      href: '/admin/social',
    })
  }

  // Sinais a entrar mas nada a executar é o sintoma clássico de um interruptor em baixo.
  const nSinais = (sinais ?? []).length
  const execs = execucoes ?? []
  const abertas = execs.filter((e) => e.status === 'executed' || e.status === 'closed').length
  if (nSinais > 5 && abertas === 0) {
    alertas.push({
      gravidade: 'partido',
      titulo: `${nSinais} sinais em 24h, zero execuções`,
      detalhe: 'Os sinais entram mas nada abre. Normalmente é um interruptor de execução em baixo.',
      href: '/admin/mtmcopy',
    })
  }

  const motorFunis = chave('funis_motor_ligado') === true || chave('funis_motor_ligado') === 'true'

  // ── 2. Onde o dinheiro trava ───────────────────────────────────────────────────────────────
  const escadaBruta = [
    { nome: 'Leads no Telegram', n: leads ?? 0, fonte: 'telegram_leads' },
    { nome: 'Conta na corretora', n: broker ?? 0, fonte: 'broker_clients' },
    { nome: 'Registados no site', n: registados ?? 0, fonte: 'profiles' },
    { nome: 'Subscrição ativa', n: ativos ?? 0, fonte: 'profiles' },
  ]
  const escada: Degrau[] = escadaBruta.map((d, i) => ({
    ...d,
    // Dividir por zero não é 0%: é "não há base de comparação".
    passou: i === 0 || escadaBruta[i - 1].n === 0 ? null : Math.round((d.n / escadaBruta[i - 1].n) * 1000) / 10,
  }))

  if (falhasAbertas) {
    alertas.push({
      gravidade: falhasAbertas > 2 ? 'partido' : 'atencao',
      titulo: `${falhasAbertas} cobrança(s) falhada(s) por recuperar · ${falhasEur}€`,
      detalhe:
        'Falharam e nunca mais houve pagamento. Vale a pena ver caso a caso: uns são cartões ' +
        'por corrigir (perde-se o cliente se ninguém falar com ele), outros são subscrições ' +
        'do Stripe que ficaram a tentar cobrar a quem já passou para acesso manual — e essa ' +
        'pessoa recebe emails de falha de pagamento sem dever nada.',
      href: '/admin?tab=users',
    })
  }

  const parede = escada.find((d, i) => i > 0 && d.passou !== null && d.passou < 10)
  if (parede) {
    alertas.push({
      gravidade: 'atencao',
      titulo: `Parede em "${parede.nome}"`,
      detalhe: `Só ${parede.passou}% passa do andar anterior. É aqui que o funil está a perder gente.`,
      href: '/admin/social/leads',
    })
  }

  // ── 3. O que corre sozinho ─────────────────────────────────────────────────────────────────
  const ultimoDisparo = autos.map((a) => (a.ultimo_disparo ? String(a.ultimo_disparo) : '')).filter(Boolean).sort().pop() ?? null

  const motores: Motor[] = [
    {
      nome: 'Automações de conversa',
      ligado: ativas > 0,
      ultimoSinal: ultimoDisparo,
      detalhe: `${ativas} de ${autos.length} regras ligadas · ${autos.reduce((t, a) => t + Number(a.disparos ?? 0), 0)} disparos`,
    },
    {
      nome: 'Motor dos funis desenhados',
      ligado: motorFunis,
      ultimoSinal: null,
      detalhe: motorFunis ? 'A correr os funis do mapa' : 'Desligado — os percursos acumulam à espera',
    },
    {
      nome: 'Publicação no Instagram',
      ligado: Boolean(autopiloto.morethanmoney || autopiloto.ricardo),
      ultimoSinal: null,
      detalhe: `Autopiloto: ${[autopiloto.morethanmoney && '@morethanmoney.pt', autopiloto.ricardo && '@ricardogarciapt'].filter(Boolean).join(' · ') || 'nenhuma conta'}`,
    },
    {
      nome: 'Execução de trading',
      ligado: Boolean(switches.premium || switches.sensei),
      ultimoSinal: (execs[0]?.created_at as string) ?? null,
      detalhe: `${Object.values(switches).filter(Boolean).length} de ${Object.keys(switches).length} interruptores ligados`,
    },
    {
      nome: 'Radar de leads',
      ligado: true,
      ultimoSinal: null,
      detalhe: `${radar ?? 0} conversas por tratar`,
    },
  ]

  if (!alertas.length) {
    alertas.push({ gravidade: 'ok', titulo: 'Nada partido', detalhe: 'Nenhum sinal de alarme nas verificações desta passagem.' })
  }

  return {
    quando: agora,
    // Partido primeiro. Uma lista por ordem de chegada faz o urgente aparecer a meio.
    alertas: alertas.sort((a, b) => {
      const peso = { partido: 0, atencao: 1, ok: 2 }
      return peso[a.gravidade] - peso[b.gravidade]
    }),
    escada,
    motores,
    dinheiro: {
      mes: receitaMes,
      mesPassado: receitaMesPassado,
      falhasAbertas,
      falhasEur,
      assinantesAtivos: ativos ?? 0,
      novos7d: novos7d ?? 0,
      expiramEm7d: expiram7d ?? 0,
      contasCopia: contasCopia ?? 0,
    },
    conteudo: { porAprovar, agendados, publicados7d, falhados },
    atencaoIA: {
      automacoes: autos.length,
      ativas,
      disparos: autos.reduce((t, a) => t + Number(a.disparos ?? 0), 0),
      naFila: naFila ?? 0,
      radarPorTratar: radar ?? 0,
    },
  }
}
