import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { sincronizarAcessos } from '@/lib/skool/acessos'
import { blocoFramework } from '@/lib/framework-mtm'
import { chamarApi, idDoGrupo, lerPagina, lerSessao } from '@/lib/skool/cliente'

/**
 * Ciclo automático do Skool MoreThanMoney (corre de hora a hora, ver app/api/cron/skool-ciclo).
 *
 *  1. Feed da app-mobile (tabela `posts`, autores admin) → post no Skool.
 *  2. Ideias DEFY (chat `sinais-defy`, sinal novo com gráfico) → «Forex - Discussão de ideias»
 *     (cripto vai para «Crypto e Stocks»). O desfecho (TP/SL, resposta ao sinal) entra como
 *     comentário no post original.
 *  3. Análise DCA do dia (chats `cripto` e `etf-stocks`) → «Crypto e Stocks».
 *  4. Uma vez por dia: desafio do dia (manhã) e a sala/aula do dia com link (tarde).
 *  5. Segunda-feira: fio «Vitórias da semana» para recolher testemunhos.
 *
 * Sem sessão do Skool guardada, não faz nada (devolve `semSessao`). Estado em
 * site_settings.skool_ciclo (só marcas de tempo e ids de posts — nada secreto). Interruptor:
 * `ligado: false` nesse JSON pára tudo.
 */

const CHAVE = 'skool_ciclo'
const SITE = 'https://www.morethanmoney.pt'
const DISCLAIMER = '\n\n⚠️ Conteúdo educativo, não constitui consultoria financeira. Resultados passados não garantem resultados futuros.'
const MAX_POR_CORRIDA = { feed: 3, defy: 4, dca: 2 }
const MAX_DEFY_DIA = 10

interface Estado {
  ligado?: boolean
  feedDesde?: string
  defyDesde?: string
  dcaDesde?: string
  defyMapa?: Record<string, string> // chat_messages.id → skool post id
  dia?: { data: string; desafio?: boolean; sala?: boolean; vitorias?: boolean; defy?: number }
  ultimaCorrida?: string
  acessosEm?: string
  ultimoErro?: string | null
}

interface Categorias {
  geral: string
  forex: string
  cripto: string
}

const agoraLisboa = () => {
  const d = new Date()
  const f = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), segunda: /^seg/i.test(String(p.weekday)) }
}

async function lerEstado(): Promise<Estado> {
  const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  return (data?.value as Estado) ?? {}
}

async function gravarEstado(e: Estado) {
  // Só os últimos 300 sinais no mapa, para o JSON não crescer sem fim.
  const mapa = Object.entries(e.defyMapa ?? {})
  if (mapa.length > 300) e.defyMapa = Object.fromEntries(mapa.slice(-300))
  await getSupabaseAdmin().from('site_settings').upsert({ key: CHAVE, value: e }, { onConflict: 'key' })
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export async function categoriasDoGrupo(): Promise<Categorias & { todas: { id: string; nome: string }[] }> {
  const s = await lerSessao()
  const { pageProps } = await lerPagina(s.grupo)
  const todas: { id: string; nome: string }[] = (pageProps.currentGroup?.labels ?? []).map((l: any) => ({ id: l.id, nome: String(l.metadata?.displayName ?? l.name ?? '') }))
  if (!todas.length) throw new Error('A comunidade não tem categorias visíveis.')
  const achar = (...chaves: string[]) => todas.find((c) => chaves.some((k) => normal(c.nome).includes(k)))?.id
  const geral = achar('geral', 'general', 'discuss', 'comunidade', 'anuncio') ?? todas[0].id
  return { todas, geral, forex: achar('forex') ?? geral, cripto: achar('crypto', 'cripto', 'stock') ?? geral }
}

async function publicar(categoria: string, titulo: string, conteudo: string): Promise<string | undefined> {
  const r: any = await chamarApi('POST', 'posts?follow=true', {
    post_type: 'generic',
    group_id: await idDoGrupo(),
    metadata: { title: titulo.slice(0, 120), content: conteudo.slice(0, 9000), attachments: '', labels: categoria, action: 0, video_ids: '' },
  })
  return r?.id
}

async function comentar(postId: string, conteudo: string) {
  await chamarApi('POST', 'posts?follow=true', {
    post_type: 'comment',
    group_id: await idDoGrupo(),
    root_id: postId,
    parent_id: postId,
    metadata: { content: conteudo.slice(0, 4000), attachments: '', action: 0, video_ids: '' },
  })
}

/** Tira as molduras de caixa (┏━┓) e o markdown que o Skool não desenha. */
function limpar(t: string): string {
  return t
    .replace(/[┏┓┗┛━┃]+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const primeiraLinha = (t: string, max = 90) => {
  const l = limpar(t).split('\n').map((x) => x.trim()).find((x) => x.length > 0) ?? 'MoreThanMoney'
  return l.length > max ? l.slice(0, max - 1) + '…' : l
}

const eCripto = (t: string) => /\b[A-Z0-9]{2,10}(USDT|USDC)\b|\bBTCUSD\b|\bETHUSD\b/.test(t)

// ── 1. Feed da app ─────────────────────────────────────────────────────────────────────────
async function sincronizarFeed(e: Estado, cat: Categorias, log: string[]) {
  const db = getSupabaseAdmin()
  const desde = e.feedDesde ?? new Date().toISOString()
  const { data: admins } = await db.from('profiles').select('id').eq('user_type', 'admin')
  const ids = (admins ?? []).map((a) => a.id)
  if (!ids.length) return
  const { data: posts } = await db
    .from('posts')
    .select('id, content, media_url, media_urls, link_url, created_at')
    .in('user_id', ids)
    .gt('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(MAX_POR_CORRIDA.feed)
  for (const p of posts ?? []) {
    const media = [p.media_url, ...((p.media_urls as string[] | null) ?? [])].filter(Boolean) as string[]
    const corpo = [limpar(String(p.content ?? '')), ...Array.from(new Set(media)).map((m) => `📎 ${m}`), '', `📲 Mais no feed da app MTM System: ${SITE}/app-mobile`].join('\n')
    await publicar(cat.geral, primeiraLinha(String(p.content ?? '')), corpo)
    e.feedDesde = String(p.created_at)
    log.push(`feed ${p.id}`)
  }
  if (!e.feedDesde) e.feedDesde = desde
}

// ── 2. Ideias DEFY ─────────────────────────────────────────────────────────────────────────
async function sincronizarDefy(e: Estado, cat: Categorias, log: string[]) {
  const db = getSupabaseAdmin()
  const desde = e.defyDesde ?? new Date().toISOString()
  const { data: msgs } = await db
    .from('chat_messages')
    .select('id, content, image_url, reply_to_id, created_at')
    .eq('channel_slug', 'sinais-defy')
    .eq('is_deleted', false)
    .gt('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(30)
  e.defyMapa ??= {}
  let novos = 0
  for (const m of msgs ?? []) {
    const texto = String(m.content ?? '')
    const original = m.reply_to_id ? e.defyMapa[String(m.reply_to_id)] : undefined
    if (original) {
      await comentar(original, limpar(texto))
      log.push(`defy desfecho ${m.id}`)
    } else if (!m.reply_to_id && m.image_url && /novo sinal/i.test(texto)) {
      if (novos >= MAX_POR_CORRIDA.defy || (e.dia?.defy ?? 0) >= MAX_DEFY_DIA) {
        e.defyDesde = String(m.created_at)
        continue // fica de fora para não inundar o feed; o próximo desfecho deste sinal também é ignorado
      }
      const corpo = `${limpar(texto)}\n\n📊 Gráfico: ${m.image_url}\n\n💬 Como lês este setup? Entravas, esperavas ou passavas? Comenta em baixo.\n🔔 Alertas em tempo real na app: ${SITE}/app-mobile${DISCLAIMER}`
      const id = await publicar(eCripto(texto) ? cat.cripto : cat.forex, `💡 Ideia DEFY · ${primeiraLinha(texto, 70)}`, corpo)
      if (id) e.defyMapa[String(m.id)] = id
      novos++
      e.dia = { ...(e.dia ?? { data: agoraLisboa().data }), defy: (e.dia?.defy ?? 0) + 1 }
      log.push(`defy ${m.id}`)
    }
    e.defyDesde = String(m.created_at)
  }
  if (!e.defyDesde) e.defyDesde = desde
}

// ── 3. DCA do dia ──────────────────────────────────────────────────────────────────────────
async function sincronizarDca(e: Estado, cat: Categorias, log: string[]) {
  const db = getSupabaseAdmin()
  const desde = e.dcaDesde ?? new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data: msgs } = await db
    .from('chat_messages')
    .select('id, channel_slug, content, created_at')
    .in('channel_slug', ['cripto', 'etf-stocks'])
    .ilike('content', '%ANÁLISE DCA%')
    .gt('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(MAX_POR_CORRIDA.dca)
  for (const m of msgs ?? []) {
    const tipo = m.channel_slug === 'cripto' ? 'Cripto' : 'ETF & Stocks'
    const corpo = `${limpar(String(m.content ?? ''))}\n\n📈 Acompanha o DCA diário na app: ${SITE}/app-mobile${DISCLAIMER}`
    await publicar(cat.cripto, `📅 DCA do dia · ${tipo} · ${agoraLisboa().data.split('-').reverse().join('/')}`, corpo)
    e.dcaDesde = String(m.created_at)
    log.push(`dca ${m.id}`)
  }
  if (!e.dcaDesde) e.dcaDesde = desde
}

// ── 4. Desafio do dia e sala do dia ────────────────────────────────────────────────────────
async function desafioDoDia(cat: Categorias): Promise<void> {
  const r = await chamarIAGratis({
    tarefa: 'skool-desafio-diario',
    sistema:
      `${blocoFramework('conteudo')}\n\nEscreves o DESAFIO DO DIA da comunidade Skool MoreThanMoney (trading consciente, gestão de risco, mindset, disciplina). ` +
      'Um desafio pequeno, concreto, que se faz em 10–15 minutos e se prova num comentário (print, número, frase). Varia o tema: gestão de risco, diário de trading, backtest de 10 trades, rotina pré-mercado, leitura de um conceito, mindset. ' +
      'Nunca prometas lucros nem números de desempenho. PT-PT, «tu». Devolve JSON {"titulo": "...", "texto": "..."} — título até 70 caracteres a começar por «🎯 Desafio do dia:», texto até 900 caracteres com: o desafio, como provar nos comentários, e porquê importa.',
    mensagens: [{ role: 'user', content: `Data: ${agoraLisboa().data}. Escreve o desafio de hoje.` }],
    json: true,
    temperatura: 0.9,
    maxTokens: 700,
    timeoutMs: 20000,
  })
  const o = JSON.parse(r.texto) as { titulo?: string; texto?: string }
  if (!o.titulo || !o.texto) throw new Error('IA não devolveu o desafio')
  await publicar(cat.geral, o.titulo, `${o.texto}\n\n🏆 Quem cumprir 5 desafios na semana é destacado na segunda-feira.`)
}

async function salaDoDia(cat: Categorias): Promise<void> {
  const { data } = await getSupabaseAdmin()
    .from('lms_streams')
    .select('id, title, description, playlist_url, access_tier, scheduled_start_at, is_live')
    .in('access_tier', ['free', 'all', 'app_member'])
    .not('title', 'ilike', '%luis pinto%')
  const salas = (data ?? []).filter((s) => s.playlist_url || s.is_live)
  if (!salas.length) return
  const ao = salas.find((s) => s.is_live)
  const dia = Math.floor(Date.now() / 86_400_000)
  const s = ao ?? salas[dia % salas.length]
  const link = `${SITE}/live-sessions/${s.id}`
  const titulo = ao ? `🔴 Em directo agora: ${s.title}` : `🎓 Aula do dia: ${s.title}`
  const corpo = [
    ao ? 'Estamos em directo — entra já:' : `Hoje a sugestão é a sala «${s.title}» na plataforma MoreThanMoney.`,
    s.description ? String(s.description).slice(0, 400) : '',
    `▶️ Sala e gravações: ${link}`,
    s.playlist_url ? `📺 Playlist: ${s.playlist_url}` : '',
    `🗓️ Próximas lives e sessões: ${SITE}/live-sessions`,
    '',
    'Depois de veres, deixa aqui 1 coisa que aprendeste. 👇',
  ].filter(Boolean).join('\n')
  await publicar(cat.geral, titulo, corpo)
}

async function vitoriasDaSemana(cat: Categorias): Promise<void> {
  await publicar(
    cat.geral,
    '🏆 Vitórias da semana — partilha a tua',
    'Nova semana, novo balanço. Conta-nos uma vitória dos últimos 7 dias: um trade bem gerido (mesmo que tenha dado SL dentro do plano), um hábito cumprido, um conceito que finalmente fez clique.\n\n' +
      'Os melhores testemunhos vão para o destaque da comunidade (com a tua autorização). Sem números inventados: conta o processo, não só o resultado. 👇',
  )
}

// ── Orquestração ───────────────────────────────────────────────────────────────────────────
export async function correrCicloSkool(): Promise<Record<string, unknown>> {
  try {
    await lerSessao()
  } catch {
    return { ok: true, semSessao: true }
  }
  const e = await lerEstado()
  if (e.ligado === false) return { ok: true, desligado: true }
  const log: string[] = []
  const erros: string[] = []
  const hoje = agoraLisboa()
  if (e.dia?.data !== hoje.data) e.dia = { data: hoje.data, defy: 0 }

  let cat: Categorias
  try {
    cat = await categoriasDoGrupo()
  } catch (err) {
    e.ultimoErro = err instanceof Error ? err.message : String(err)
    e.ultimaCorrida = new Date().toISOString()
    await gravarEstado(e)
    return { ok: false, erro: e.ultimoErro }
  }

  const passo = async (nome: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      erros.push(`${nome}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300))
    }
  }

  await passo('feed', () => sincronizarFeed(e, cat, log))
  await passo('defy', () => sincronizarDefy(e, cat, log))
  await passo('dca', () => sincronizarDca(e, cat, log))
  if (!e.dia.desafio && hoje.hora >= 9) await passo('desafio', async () => { await desafioDoDia(cat); e.dia!.desafio = true; log.push('desafio') })
  if (!e.dia.sala && hoje.hora >= 13) await passo('sala', async () => { await salaDoDia(cat); e.dia!.sala = true; log.push('sala') })
  // Acessos (pagantes do site ↔ cursos do Skool), de 3 em 3 horas.
  if (!e.acessosEm || Date.now() - Date.parse(e.acessosEm) > 3 * 3600_000) {
    await passo('acessos', async () => {
      const r = await sincronizarAcessos()
      e.acessosEm = new Date().toISOString()
      log.push(`acessos: ${JSON.stringify({ c: r.concedidos, v: r.convites, r: r.retirados })}`)
    })
  }
  if (hoje.segunda && !e.dia.vitorias && hoje.hora >= 10) await passo('vitorias', async () => { await vitoriasDaSemana(cat); e.dia!.vitorias = true; log.push('vitorias') })

  e.ultimaCorrida = new Date().toISOString()
  e.ultimoErro = erros.length ? erros.join(' | ') : null
  await gravarEstado(e)
  return { ok: erros.length === 0, feitos: log, erros }
}
