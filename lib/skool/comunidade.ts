import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { blocoFramework } from '@/lib/framework-mtm'
import { lerPagina, lerSessao } from '@/lib/skool/cliente'
import bootcamps from '@/lib/skool/conteudo/bootcamps-scanners.json'

/**
 * Animação da comunidade Skool MoreThanMoney (chamada pelo ciclo de hora a hora, lib/skool/ciclo.ts).
 *
 *  · Programa do dia (18h): um formato diferente por dia da semana — sondagem, «pergunta-me tudo»,
 *    experiência de 24 h, isca grátis, missão da app, plano da semana.
 *  · Bootcamp semanal de 3 dias (terça a quinta, 12h), anunciado na segunda: uma estratégia por
 *    semana, vídeo + exercício por dia, live call ligada às sessões do site, convite final para
 *    o caminho seguinte.
 *  · Respostas a comentários: lê os posts com atividade recente e responde, no idioma de quem
 *    escreveu, como uma pessoa da equipa (frases curtas, «tu», sem rótulos de IA).
 *  · Eventos e desafios da app Missão (rg_app_eventos) promovidos no Skool de 3 em 3 dias.
 *
 * IA sempre pela cadeia grátis (chamarIAGratis). Nunca promete lucros nem inventa números.
 */

const SITE = 'https://www.morethanmoney.pt'
const APP = `${SITE}/ricardogarcia/app`
const AVISO = '\n\n⚠️ Conteúdo educativo, não é aconselhamento financeiro. Operar tem risco de perda.'

/** A voz única de tudo o que sai no Skool — é isto que mantém o conteúdo homogéneo. */
export const VOZ_SKOOL =
  'Escreves como o Ricardo e a equipa MoreThanMoney a falar com a comunidade no Skool. ' +
  'Frases curtas e simples, tom próximo e humano, trata por «tu», PT-PT (ecrã, telemóvel, equipa). ' +
  'Nada de jargão de marketing, nada de listas longas, no máximo 2 emojis. ' +
  'Nunca digas que és uma IA nem acrescentes legendas de IA. Nunca prometas lucros nem inventes números de desempenho. ' +
  'Não fales de outras empresas nem de pessoas de fora.'

export interface EstadoComunidade {
  respondidos?: string[]
  eventoEm?: string
  dia?: { programa?: boolean; bootcamp?: boolean }
}

type Publicar = (categoria: string, titulo: string, conteudo: string) => Promise<string | undefined>
type Comentar = (postId: string, conteudo: string, paiId?: string) => Promise<void>

async function ia(tarefa: string, pedido: string, maxTokens = 700): Promise<{ titulo: string; texto: string }> {
  const r = await chamarIAGratis({
    tarefa,
    sistema: `${blocoFramework('conteudo')}\n\n${VOZ_SKOOL}\n\nDevolve JSON {"titulo": "...", "texto": "..."} — título até 80 caracteres, texto até 1100 caracteres, quebras de linha com \\n.`,
    mensagens: [{ role: 'user', content: pedido }],
    json: true,
    temperatura: 0.9,
    maxTokens,
    timeoutMs: 20000,
  })
  const o = JSON.parse(r.texto) as { titulo?: string; texto?: string }
  if (!o.titulo || !o.texto) throw new Error(`IA não devolveu ${tarefa}`)
  return { titulo: o.titulo.slice(0, 110), texto: o.texto }
}

// ── Programa do dia (formato por dia da semana) ──────────────────────────────────────────────
const PROGRAMA: Record<number, { nome: string; pedido: string; rodape: string }> = {
  1: {
    nome: 'sondagem',
    pedido:
      'Faz uma SONDAGEM para a comunidade sobre trading consciente, rotina, risco ou mindset. Título a começar por «📊 Sondagem:». ' +
      'No texto: a pergunta, 3 ou 4 opções numeradas (1, 2, 3, 4) e o pedido para responderem só com o número nos comentários e dizerem porquê.',
    rodape: '\n\nAmanhã partilho o resultado e o que ele diz sobre nós. 👇',
  },
  2: {
    nome: 'pergunta-me-tudo',
    pedido:
      'Abre um fio «🙋 Pergunta-me tudo» do dia. Escolhe um tema (gestão de risco, primeira conta, scanners, psicologia, rotina) e convida a deixarem dúvidas. ' +
      'Dá 3 exemplos de perguntas que ninguém tem coragem de fazer. Diz que todas as dúvidas recebem resposta.',
    rodape: `\n\nSe preferires falar a sós, marca aqui: ${SITE}/agendar`,
  },
  3: {
    nome: 'experiencia',
    pedido:
      'Propõe uma EXPERIÊNCIA de 24 horas (título a começar por «🧪 Experiência de 24 h:»). Algo simples de testar em si próprio ligado a trading ou disciplina: ' +
      'não abrir o gráfico fora do horário, escrever o plano antes de cada trade, medir quanto tempo passa no telemóvel a olhar para o mercado, etc. ' +
      'Explica a regra, como medir e pede que voltem amanhã ao fio contar o que notaram.',
    rodape: '\n\nVolta aqui amanhã e conta o que aconteceu. Os melhores relatos vão para o destaque da semana.',
  },
  4: {
    nome: 'sondagem',
    pedido:
      'Faz uma SONDAGEM rápida (título a começar por «📊 Sondagem:») sobre hábitos de trader: horário, mercados preferidos, maior dificuldade, como lidam com uma perda. ' +
      '3 ou 4 opções numeradas, pede o número nos comentários e uma frase de porquê.',
    rodape: '\n\nVou usar as respostas para escolher o tema do próximo bootcamp. 👇',
  },
  5: {
    nome: 'isca',
    pedido:
      'Post de sexta a oferecer os recursos GRÁTIS da casa a quem ainda não os tem e a pedir que convidem um amigo para a comunidade. ' +
      'Recursos: o livro «O Método Frio» e o Guia dos Scanners com 30 dias do scanner GoldKiller grátis. Título simples e humano, sem parecer anúncio.',
    rodape: `\n\n📘 O Método Frio: ${SITE}/ebooks/o-metodo-frio\n🎁 GoldKiller 30 dias grátis: ${SITE}/gratis/goldkiller\n👥 Convida alguém: https://www.skool.com/morethanmoney-1132/about`,
  },
  6: {
    nome: 'missao',
    pedido:
      'Post de sábado sobre a app Missão: uma missão para o fim de semana (treino, mindset, digital ou produtividade) que se cumpre na app e se partilha aqui com um print. ' +
      'Título a começar por «🎯 Missão do fim de semana:». Explica em 2 frases o que é a app (missões diárias, XP, ranking, desafios) e convida a entrar.',
    rodape: `\n\n📲 Entra na app Missão: ${APP}\nPartilha aqui o print quando cumprires. 💪`,
  },
  0: {
    nome: 'plano-semana',
    pedido:
      'Post de domingo à tarde: reflexão curta sobre a semana e convite para cada um escrever nos comentários o seu plano para a próxima (3 linhas: horário, mercado, regra de risco). ' +
      'Título a começar por «🗓️ O teu plano para a semana».',
    rodape: '\n\nAmanhã às 10h abre o fio das vitórias da semana. Até lá, escreve o teu plano aqui. 👇',
  },
}

export async function programaDoDia(diaSemana: number, publicar: Publicar, categoria: string): Promise<string> {
  const p = PROGRAMA[diaSemana]
  const o = await ia(`skool-programa-${p.nome}`, `${p.pedido}\n\nData: ${new Date().toISOString().slice(0, 10)}.`)
  const temTrading = p.nome === 'sondagem' || p.nome === 'experiencia'
  await publicar(categoria, o.titulo, `${o.texto}${p.rodape}${temTrading ? AVISO : ''}`)
  return p.nome
}

// ── Bootcamp semanal de 3 dias ───────────────────────────────────────────────────────────────
const NOMES: Record<string, string> = {
  'golden-zone': 'Golden Zone',
  trendshot: 'TrendShot',
  'sniper-pro': 'Sniper Pro',
  goldkiller: 'GoldKiller',
  momentum: 'Momentum',
}

function estrategiaDaSemana(): { slug: string; nome: string; videos: [string, string][] } {
  const lista = Object.entries(bootcamps as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v) && (v as unknown[]).length >= 3 && NOMES[k])
    .map(([k, v]) => ({ slug: k, nome: NOMES[k], videos: v as [string, string][] }))
  const semana = Math.floor((Date.now() / 86_400_000 + 3) / 7) // muda à segunda
  return lista[semana % lista.length]
}

async function proximaLive(): Promise<{ titulo: string; quando: string; link: string } | null> {
  const agora = new Date()
  const ate = new Date(agora.getTime() + 4 * 86_400_000)
  const { data } = await getSupabaseAdmin()
    .from('lms_streams')
    .select('id, title, scheduled_start_at, access_tier')
    .in('access_tier', ['free', 'all', 'app_member'])
    .gte('scheduled_start_at', agora.toISOString())
    .lte('scheduled_start_at', ate.toISOString())
    .order('scheduled_start_at', { ascending: true })
    .limit(1)
  const s = data?.[0]
  if (s) {
    const quando = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(s.scheduled_start_at))
    return { titulo: s.title, quando, link: `${SITE}/live-sessions/${s.id}` }
  }
  return proximaLiveRecorrente()
}

/** Sessões grátis recorrentes (lms_stream_schedules, plano «free»), as mesmas de /FreeSession. */
async function proximaLiveRecorrente(): Promise<{ titulo: string; quando: string; link: string } | null> {
  const { data } = await getSupabaseAdmin()
    .from('lms_stream_schedules')
    .select('weekday, start_time, access_tier, stream:lms_streams(title, access_tier)')
    .eq('is_active', true)
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
  const minAgora = hoje.getDay() * 1440 + hoje.getHours() * 60 + hoje.getMinutes()
  let melhor: { dist: number; titulo: string; quando: string } | null = null
  for (const r of (data ?? []) as any[]) {
    const stream = Array.isArray(r.stream) ? r.stream[0] : r.stream
    if ((r.access_tier ?? stream?.access_tier) !== 'free') continue
    const [h, m] = String(r.start_time).split(':').map(Number)
    const min = Number(r.weekday) * 1440 + h * 60 + m
    const dist = (min - minAgora + 7 * 1440) % (7 * 1440)
    if (!melhor || dist < melhor.dist) {
      melhor = { dist, titulo: stream?.title ?? 'Sessão aberta', quando: `${DIAS[Number(r.weekday)]} às ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
    }
  }
  return melhor ? { titulo: melhor.titulo, quando: melhor.quando, link: `${SITE}/FreeSession` } : null
}

/** dia: 1 = segunda (anúncio), 2–4 = dias 1 a 3 do bootcamp. */
export async function bootcampDoDia(diaSemana: number, publicar: Publicar, categoria: string): Promise<string | null> {
  if (diaSemana < 1 || diaSemana > 4) return null
  const e = estrategiaDaSemana()
  if (!e) return null
  const live = await proximaLive()
  const linhaLive = live
    ? `🔴 Live call: «${live.titulo}», ${live.quando} (hora de Lisboa) → ${live.link}`
    : `🔴 Lives e sessões abertas: ${SITE}/FreeSession · dúvidas a sós: ${SITE}/agendar`
  const yt = (id: string) => `https://youtu.be/${id}`

  if (diaSemana === 1) {
    const o = await ia(
      'skool-bootcamp-anuncio',
      `Anuncia o BOOTCAMP DA SEMANA (3 dias, terça a quinta, 12h) sobre a estratégia ${e.nome} da MoreThanMoney. ` +
        'Título a começar por «🚀 Bootcamp da semana:». Diz o que se aprende em cada dia (1: o que é e como se lê; 2: confirmações e entrada; 3: gestão e rotina), ' +
        'que há exercício diário e live call, e pede que comentem «EU» para receberem lembrete.',
    )
    await publicar(categoria, o.titulo, `${o.texto}\n\n${linhaLive}${AVISO}`)
    return `bootcamp-anuncio ${e.slug}`
  }

  const n = diaSemana - 1 // 1..3
  const v = e.videos[Math.min(n - 1, e.videos.length - 1)]
  const extra = n === 3 && e.videos.length > 3 ? e.videos.slice(3) : []
  const o = await ia(
    `skool-bootcamp-dia${n}`,
    `Escreve o DIA ${n} de 3 do bootcamp da semana sobre ${e.nome}. A aula de hoje é o vídeo «${v[1]}». ` +
      `Título a começar por «🚀 Bootcamp ${e.nome} · Dia ${n}/3:». No texto: o que ver, o que reparar, e um EXERCÍCIO concreto de 10 minutos para provar nos comentários (print ou frase). ` +
      (n === 3 ? 'Fecha o bootcamp: pede que contem o que levam e convida, sem pressão, a darem o passo seguinte no caminho MoreThanMoney.' : ''),
  )
  const corpo = [
    o.texto,
    '',
    `▶️ Aula: ${yt(v[0])}`,
    ...extra.map(([id, t]) => `▶️ ${t}: ${yt(id)}`),
    linhaLive,
    n === 3 ? `🧭 O passo seguinte: ${SITE}/caminho` : '',
  ].filter(Boolean).join('\n')
  await publicar(categoria, o.titulo, `${corpo}${AVISO}`)
  return `bootcamp-dia${n} ${e.slug}`
}

// ── Eventos e desafios da app Missão ─────────────────────────────────────────────────────────
export async function promoverEvento(publicar: Publicar, categoria: string): Promise<string | null> {
  const agora = Date.now()
  const { data } = await getSupabaseAdmin()
    .from('rg_app_eventos')
    .select('id, tipo, titulo, descricao, quando, local, link_compra, vagas, xp')
    .eq('activo', true)
    .order('ordem')
    .limit(20)
  const futuros = (data ?? []).filter((e) => e.tipo === 'desafio' || (e.quando && Date.parse(e.quando) > agora))
  if (!futuros.length) return null
  const ev = futuros[Math.floor(agora / (3 * 86_400_000)) % futuros.length]
  const quando = ev.quando
    ? new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ev.quando))
    : ''
  const o = await ia(
    'skool-evento',
    `Convida a comunidade para ${ev.tipo === 'desafio' ? 'o desafio' : 'o evento'} «${ev.titulo}» da MoreThanMoney. ` +
      `Detalhes: ${String(ev.descricao ?? '').slice(0, 500)} ${quando ? `Quando: ${quando}.` : ''} ${ev.local ? `Onde: ${ev.local}.` : ''} ${ev.vagas ? `Vagas: ${ev.vagas}.` : ''} ` +
      'Diz que a inscrição se faz na app Missão (e dá XP). Usa só os detalhes dados, não inventes nada.',
  )
  const links = [`📲 Inscrição na app Missão: ${APP}`, ev.link_compra ? `🎟️ Bilhete: ${ev.link_compra}` : ''].filter(Boolean).join('\n')
  await publicar(categoria, o.titulo, `${o.texto}\n\n${links}`)
  return `evento ${ev.id}`
}

// ── Respostas a comentários ──────────────────────────────────────────────────────────────────
interface Comentario { id: string; postId: string; paiId: string; autorId?: string; autor: string; texto: string; contexto: string }

function juntarComentarios(postId: string, contexto: string, filhos: any[] | undefined, saida: Comentario[], topo?: string) {
  for (const c of filhos ?? []) {
    const p = c?.post
    if (!p?.id) continue
    saida.push({
      id: String(p.id),
      postId,
      paiId: topo ?? String(p.id), // o Skool só tem 2 níveis: responde-se sempre debaixo do comentário de topo
      autorId: p.userId ?? p.user?.id,
      autor: String(p.user?.firstName ?? p.user?.name ?? '').trim(),
      texto: String(p.metadata?.content ?? '').trim(),
      contexto,
    })
    juntarComentarios(postId, contexto, c.children, saida, topo ?? String(p.id))
  }
}

export async function responderComentarios(e: EstadoComunidade, comentar: Comentar, log: string[], max = 5): Promise<void> {
  const s = await lerSessao()
  const { pageProps: pp } = await lerPagina(`${s.grupo}?s=newest-cm`)
  const eu = pp.self?.id
  const vistos = new Set(e.respondidos ?? [])
  const primeiraVez = !e.respondidos
  const recentes = (pp.postTrees ?? [])
    .map((t: any) => t.post)
    .filter((p: any) => p?.name && Number(p?.metadata?.comments ?? 0) > 0)
    .slice(0, 8)

  let feitos = 0
  for (const post of recentes) {
    if (feitos >= max) break
    const { pageProps: pq } = await lerPagina(`${s.grupo}/${encodeURIComponent(post.name)}`)
    const arvore = pq.postTree ?? pq.postModal
    if (!arvore?.post) continue
    const contexto = `${arvore.post.metadata?.title ?? ''}\n${String(arvore.post.metadata?.content ?? '').slice(0, 800)}`
    const todos: Comentario[] = []
    juntarComentarios(String(arvore.post.id), contexto, arvore.children, todos)
    // Comentários a que a equipa já respondeu no mesmo fio ficam de fora.
    const respondidosPorMim = new Set<string>()
    const walk = (filhos: any[] | undefined, pai?: string) => {
      for (const c of filhos ?? []) {
        if ((c?.post?.userId ?? c?.post?.user?.id) === eu && pai) respondidosPorMim.add(pai)
        walk(c?.children, c?.post?.id)
      }
    }
    walk(arvore.children)

    for (const c of todos) {
      if (vistos.has(c.id)) continue
      vistos.add(c.id)
      if (primeiraVez) continue // 1.ª corrida: marca o que já existe, não responde a conversas antigas
      if (!c.texto || c.autorId === eu || respondidosPorMim.has(c.id)) continue
      if (feitos >= max) break
      const r = await chamarIAGratis({
        tarefa: 'skool-resposta-comentario',
        sistema:
          `${blocoFramework('apoio')}\n\n${VOZ_SKOOL}\n\n` +
          'Respondes a UM comentário num post da comunidade. Responde no MESMO idioma e registo de quem escreveu (se escrever em brasileiro, francês, inglês ou espanhol, responde assim; se escrever informal, sê informal). ' +
          'Entre 1 e 4 frases, trata a pessoa pelo primeiro nome quando o souberes. Dá valor real: responde à dúvida, reconhece o esforço, ou faz uma pergunta que puxe a conversa. ' +
          `Se fizer sentido, aponta UM recurso: aulas no Classroom do Skool, ${SITE}/agendar, ${SITE}/caminho ou a app Missão ${APP}. ` +
          'Se a pessoa estiver chateada ou tiver um problema de conta/pagamento, pede desculpa e diz que a equipa lhe manda mensagem. Devolve só o texto da resposta.',
        mensagens: [{ role: 'user', content: `Post:\n${c.contexto}\n\nComentário de ${c.autor || 'um membro'}:\n${c.texto.slice(0, 1200)}` }],
        temperatura: 0.8,
        maxTokens: 300,
        timeoutMs: 20000,
      })
      const texto = r.texto.trim().replace(/^["“]|["”]$/g, '')
      if (texto.length < 3) continue
      await comentar(c.postId, texto, c.paiId)
      feitos++
      log.push(`resposta ${c.id}`)
    }
  }
  e.respondidos = Array.from(vistos).slice(-600)
}
