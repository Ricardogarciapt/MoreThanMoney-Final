/**
 * Conteúdo do Threads para TODOS os funis (pedido do Ricardo, 23/11/2026: «bora engajar e trabalhar
 * para todos os funis»). Corre dentro do ciclo do Threads (executor do pipeline, 2/2 h).
 *
 *  - Publica um post de valor a cada ~6 h (entre as 8h e as 22h de Lisboa), rodando pelos funis:
 *    educação (/caminho), GoldKiller grátis, ferramentas, soluções B2B. Recrutamento já tem o seu.
 *  - O post acaba num CTA «comenta PALAVRA». Quem comenta recebe resposta adaptada (IA grátis) com o
 *    link do funil desse post e entra no CRM com tarefa para um setter.
 *
 * Só IA grátis (`chamarIAGratis`), sem etiquetas de IA, sem promessas de retorno, disclaimer educativo
 * nos posts de trading. Texto fixo de recurso quando a IA falha.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { blocoFramework } from '@/lib/framework-mtm'
import { publicarImagem, publicarTexto, respostasDe, type TokenThreads } from '@/lib/threads/cliente'
import { limparResposta } from '@/lib/threads/prospecao'
import { SITE } from '@/lib/threads/recrutamento'

const CHAVE = 'threads_conteudo'
const DISCLAIMER = 'Conteúdo educativo, não é aconselhamento financeiro.'

export type Funil = {
  id: string
  palavra: string
  link: string
  funilCrm: string
  trading: boolean
  tema: string
  recurso: string
  /** Imagem nossa (real, sem IA de pessoas) servida em público pelo site. */
  imagem?: string
}

export const FUNIS: Funil[] = [
  {
    id: 'educacao',
    imagem: `${SITE}/bootcamp-mtm-sala-estudo.png`,
    palavra: 'PASSO',
    link: `${SITE}/caminho`,
    funilCrm: 'educacao',
    trading: true,
    tema: 'o primeiro passo para aprender trading com método: gestão de risco antes de estratégia, 15 minutos por dia, diário de trades',
    recurso:
      'A maior parte de quem começa no trading procura a estratégia perfeita. O que separa quem fica de quem desiste é outra coisa: risco fixo por trade e um diário honesto.\n\nMontei um caminho simples para começar por aí.\n\nComenta «PASSO» e eu mando-te.',
  },
  {
    id: 'goldkiller',
    palavra: 'SCANNER',
    link: `${SITE}/gratis/goldkiller`,
    funilCrm: 'educacao',
    trading: true,
    tema: 'usar um scanner no ouro (XAUUSD) para não andar a adivinhar entradas: esperar pelo sinal, definir stop antes de entrar',
    recurso:
      'No ouro, metade dos erros vem de entrar por impulso.\n\nUso um scanner que me diz quando o cenário está montado. Se não está, não entro. Simples.\n\nEstou a dar 30 dias grátis. Comenta «SCANNER».',
  },
  {
    id: 'ferramentas',
    palavra: 'PLANO',
    link: `${SITE}/caminho`,
    funilCrm: 'educacao',
    trading: true,
    tema: 'trocar a armadilha das 40 horas por um plano de 3 passos: aprender, testar em conta simulada, só depois arriscar capital próprio',
    recurso:
      'Ninguém devia arriscar dinheiro a sério no primeiro mês.\n\nO meu plano para quem começa: aprender o básico, testar em conta simulada, e só depois usar capital próprio, pouco.\n\nComenta «PLANO» e envio-te os 3 passos.',
  },
  {
    id: 'b2b',
    imagem: `${SITE}/images/solucoes/solucoes-poster.jpg`,
    palavra: 'SOLUÇÕES',
    link: `${SITE}/solucoes`,
    funilCrm: 'b2b',
    trading: false,
    tema: 'pequenos negócios que perdem clientes por não responderem a tempo no WhatsApp e no Instagram; automatizar respostas e marcações sem perder o toque humano',
    recurso:
      'Quantos clientes perdes por responder tarde no WhatsApp?\n\nNos meus negócios as mensagens têm resposta em minutos e as marcações entram sozinhas na agenda.\n\nSe tens um negócio e queres ver como, comenta «SOLUÇÕES».',
  },
]

type EstadoConteudo = { ligado?: boolean; temas?: { dia: string; lista: string[] }; ultimo_em?: string | null; indice?: number; posts?: { id: string; funil: string }[]; respondidos?: string[] }

/** Lisboa está em UTC+0 no inverno e +1 no verão; para a janela 8–22 h chega aproximar pelo fuso do servidor. */
function horaLisboa(agora: Date): number {
  return Number(new Intl.DateTimeFormat('pt-PT', { hour: 'numeric', hour12: false, timeZone: 'Europe/Lisbon' }).format(agora))
}

export function devePublicarConteudo(ultimo: string | null | undefined, agora = new Date(), horas = 6): boolean {
  const h = horaLisboa(agora)
  if (h < 8 || h >= 22) return false
  if (!ultimo) return true
  return agora.getTime() - new Date(ultimo).getTime() >= horas * 3_600_000
}

function sistema(): string {
  return [
    'És o Ricardo Garcia (@ricardogarciapt no Threads), fundador da MoreThanMoney: trader, educação financeira com método e gestão de risco, e soluções digitais para negócios.',
    'Escreves em PT-PT informal («tu»), como uma pessoa real: frases curtas, uma ideia concreta, sem hashtags, no máximo 1 emoji, sem parecer publicidade.',
    'Nunca prometes retornos nem rendimentos. Nunca dizes que és IA nem pões avisos de IA.',
    blocoFramework('conteudo'),
  ].join('\n\n')
}

/**
 * Temas do dia a partir dos relatórios do MiroFish (público virtual que corre no Mac; não se lança
 * outro aqui). Lê os relatórios feitos nos últimos 10 dias e tira 3 temas que pegam no público.
 * Guardado por dia; sem relatórios, fica vazio e o post usa o tema fixo do funil.
 */
async function temasDoMiroFish(db: SupabaseClient, est: EstadoConteudo, agora: Date): Promise<string[]> {
  const dia = agora.toISOString().slice(0, 10)
  if (est.temas?.dia === dia) return est.temas.lista
  let lista: string[] = []
  try {
    const desde = new Date(agora.getTime() - 10 * 86_400_000).toISOString()
    const { data } = await db
      .from('publico_virtual_testes')
      .select('relatorio')
      .eq('estado', 'feito')
      .gte('actualizado_em', desde)
      .order('actualizado_em', { ascending: false })
      .limit(3)
    const texto = (data ?? []).map((r) => String(r.relatorio ?? '').slice(0, 2500)).join('\n\n---\n\n')
    if (texto.trim()) {
      const r = await chamarIAGratis({
        sistema: 'Extrais temas de conteúdo de relatórios de simulação de público. Respondes só JSON.',
        mensagens: [
          {
            role: 'user',
            content:
              `Relatórios do público virtual (simulação, não pessoas reais):\n${texto}\n\n` +
              'Dá 3 temas curtos (máx. 15 palavras cada) para posts no Threads que este público comentaria, ligados a trading com método, liberdade financeira ou negócios. JSON: {"temas": ["..",".."]}',
          },
        ],
        json: true,
        maxTokens: 200,
        temperatura: 0.5,
        tarefa: 'threads-conteudo',
        prioridade: 'fundo',
        timeoutMs: 15_000,
      })
      lista = ((JSON.parse(r.texto) as { temas?: string[] }).temas ?? []).filter((t) => typeof t === 'string' && t.length < 160).slice(0, 3)
    }
  } catch {
    lista = []
  }
  est.temas = { dia, lista }
  return lista
}

async function escreverPost(f: Funil, temaExtra?: string): Promise<string> {
  try {
    const r = await chamarIAGratis({
      sistema: sistema(),
      mensagens: [
        {
          role: 'user',
          content:
            `Escreve um post para o Threads (máx. 380 caracteres, só o texto) sobre: ${f.tema}.\n` +
            (temaExtra ? `Ângulo de hoje (o que o público anda a discutir): ${temaExtra}. Liga-o ao tema de forma natural.\n` : '') +
            'Começa com uma frase que prenda (uma verdade incómoda ou uma pergunta). Dá uma ideia útil. ' +
            `Acaba exatamente com um convite a comentar a palavra «${f.palavra}». Sem links.`,
        },
      ],
      maxTokens: 260,
      temperatura: 0.85,
      tarefa: 'threads-conteudo',
      prioridade: 'fundo',
      timeoutMs: 15_000,
    })
    const t = limparResposta(r.texto)
    if (t && t.toUpperCase().includes(f.palavra) && t.length <= 420) return t
  } catch {
    /* recurso abaixo */
  }
  return f.recurso
}

async function responderComentario(f: Funil, texto: string, username: string): Promise<string> {
  const recurso = `@${username} aqui tens: ${f.link}\nQualquer dúvida, diz-me.`
  try {
    const r = await chamarIAGratis({
      sistema: sistema(),
      mensagens: [
        {
          role: 'user',
          content:
            `@${username} comentou o teu post (tema: ${f.tema}) com: «${texto.slice(0, 300)}».\n` +
            `Escreve a resposta pública (só o texto, 1–2 frases): agradece pelo nome, responde ao que disse e dá o link ${f.link}.`,
        },
      ],
      maxTokens: 160,
      temperatura: 0.6,
      tarefa: 'threads-conteudo',
      prioridade: 'fundo',
      timeoutMs: 12_000,
    })
    const t = limparResposta(r.texto)
    return t && t.includes(f.link) ? t : recurso
  } catch {
    return recurso
  }
}

async function registar(db: SupabaseClient, responsavel: string | undefined, f: Funil, username: string, texto: string) {
  const u = username.toLowerCase()
  const { data: neg } = await db
    .from('vendas_negocios')
    .upsert(
      {
        nome: `@${username}`,
        origem: 'threads',
        estado: 'contactado',
        etiquetas: ['threads', `threads_${f.id}`],
        interesse: f.id === 'b2b' ? 'Soluções digitais para o negócio' : 'Aprender trading / educação financeira',
        nota: `Comentou «${texto.slice(0, 160)}» num post do Threads (funil ${f.id}). Recebeu ${f.link}.`,
        chave_origem: `threads:${u}`,
        funil: f.funilCrm,
      },
      { onConflict: 'chave_origem', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()
  if (neg?.id && responsavel) {
    await db.from('vendas_tarefas').upsert(
      {
        titulo: `Lead · @${username} (Threads, ${f.id})`,
        descricao: `Comentou ${f.palavra} no Threads e recebeu ${f.link}. Acompanhar até à compra ou à marcação em /agendar.`,
        responsavel_id: responsavel,
        negocio_id: neg.id,
        papel: 'setter',
        prazo: new Date(Date.now() + 86_400_000).toISOString(),
        estado: 'aberta',
        chave: `lead:threads:${u}`,
      },
      { onConflict: 'chave', ignoreDuplicates: true },
    )
  }
}

/** Publica (se for hora) e responde aos comentários dos posts de funil. Nunca lança. */
export async function correrConteudoThreads(db: SupabaseClient, token: TokenThreads, responsavel?: string): Promise<Record<string, unknown>> {
  const out = { publicado: null as string | null, funil: null as string | null, tema: null as string | null, respostas: 0, erros: [] as string[] }
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const est: EstadoConteudo = { ligado: true, indice: 0, posts: [], respondidos: [], ...(data?.value as EstadoConteudo | null) }
  if (est.ligado === false) return { desligado: true }
  const agora = new Date()

  if (devePublicarConteudo(est.ultimo_em, agora)) {
    const f = FUNIS[(est.indice ?? 0) % FUNIS.length]
    try {
      const temas = await temasDoMiroFish(db, est, agora)
      const tema = temas.length ? temas[(est.indice ?? 0) % temas.length] : undefined
      let texto = await escreverPost(f, tema)
      if (f.trading && !texto.includes(DISCLAIMER)) texto = `${texto}\n\n${DISCLAIMER}`
      out.tema = tema ?? null
      out.publicado = f.imagem
        ? await publicarImagem(token, texto, f.imagem).catch(() => publicarTexto(token, texto))
        : await publicarTexto(token, texto)
      out.funil = f.id
      est.posts = [{ id: out.publicado, funil: f.id }, ...(est.posts ?? [])].slice(0, 20)
      est.ultimo_em = agora.toISOString()
      est.indice = (est.indice ?? 0) + 1
    } catch (e) {
      out.erros.push(`publicar ${f.id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  const respondidos = new Set(est.respondidos ?? [])
  for (const p of (est.posts ?? []).slice(0, 8)) {
    const f = FUNIS.find((x) => x.id === p.funil)
    if (!f) continue
    try {
      for (const c of await respostasDe(token, p.id)) {
        if (out.respostas >= 10) break
        const u = c.username?.toLowerCase()
        if (!u || !c.text || respondidos.has(c.id) || u === token.username?.toLowerCase()) continue
        respondidos.add(c.id)
        await publicarTexto(token, await responderComentario(f, c.text, c.username!), c.id)
        await registar(db, responsavel, f, c.username!, c.text)
        out.respostas++
      }
    } catch (e) {
      out.erros.push(`comentários ${p.id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  est.respondidos = [...respondidos].slice(-3000)
  await db.from('site_settings').upsert({ key: CHAVE, value: est }, { onConflict: 'key' })
  return out
}
