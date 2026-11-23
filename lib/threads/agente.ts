/**
 * Agente do Threads @ricardogarciapt (23/11/2026). Corre dentro do ciclo do Threads (executor do
 * pipeline, de 2 em 2 h) e usa SÓ a IA grátis (`chamarIAGratis`), por ordem do Ricardo.
 *
 *  1. Prospeção: pesquisa posts recentes por palavra-chave (ver `prospecao.ts`), a IA decide se a
 *     pessoa encaixa (futuro setter/closer ou futuro aluno) e escreve uma resposta curta e útil,
 *     como o Ricardo escreveria. A pessoa entra no CRM com tarefa para um setter.
 *  2. Conversas: quem responde às nossas respostas recebe seguimento adaptado (até 4 turnos); a
 *     partir do 2.º turno pode levar o link do passo seguinte (/work, /caminho ou /agendar).
 *  3. Aprender: guarda as métricas dos nossos posts em site_settings.threads_aprendizagem.
 *
 * Tectos: 4 respostas novas por ciclo e 20 por dia. Sem etiquetas de IA, sem promessas de retorno.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { blocoFramework } from '@/lib/framework-mtm'
import { metricasDe, pesquisar, publicarTexto, respostasDe, type TokenThreads } from '@/lib/threads/cliente'
import {
  contarFeita,
  limparResposta,
  MAX_TURNOS,
  palavrasDoCiclo,
  postValido,
  quotaRestante,
  TECTO_CICLO,
  type Conversa,
  type EstadoProspecao,
  type Perfil,
} from '@/lib/threads/prospecao'
import { LINK_CANDIDATURA, LINK_ENTREVISTA, SITE } from '@/lib/threads/recrutamento'

const CHAVE = 'threads_prospecao'
const CHAVE_APRENDER = 'threads_aprendizagem'

const PASSOS: Record<Perfil, string> = {
  recruta: `candidatura em 2 minutos: ${LINK_CANDIDATURA} · entrevista de 30 min por Google Meet: ${LINK_ENTREVISTA}`,
  cliente: `o caminho para começar, por perfil: ${SITE}/caminho · conversa de 30 min: ${SITE}/agendar`,
}

function sistema(): string {
  return [
    'És o Ricardo Garcia (@ricardogarciapt no Threads), fundador da MoreThanMoney: ex-militar, trader, educação financeira com método e gestão de risco.',
    'Escreves respostas públicas no Threads, na primeira pessoa, em PT-PT informal («tu»), curtas (1 a 3 frases, máx. 400 caracteres), humanas, sem hashtags, sem emojis em excesso, sem parecer publicidade.',
    'Primeiro dás valor (uma ideia concreta, uma pergunta que faça pensar); nunca empurras link à primeira, a não ser que a pessoa o peça.',
    'Nunca prometes retornos nem rendimentos. Nunca dizes que és IA nem pões avisos de IA; mas se alguém perguntar diretamente se é um bot, não mentes: dizes que é a equipa do Ricardo a ajudar e que ele lê tudo.',
    'Responde na língua do post.',
    blocoFramework('setter'),
  ].join('\n\n')
}

type Decisao = { encaixa?: boolean; perfil?: Perfil | 'nenhum'; resposta?: string }

async function decidir(texto: string, username: string, perfilProvavel: Perfil): Promise<Decisao | null> {
  try {
    const r = await chamarIAGratis({
      sistema: sistema(),
      mensagens: [
        {
          role: 'user',
          content:
            `Post de @${username} no Threads:\n«${texto.slice(0, 700)}»\n\n` +
            `Perfil que procuramos nesta pesquisa: ${perfilProvavel === 'recruta' ? 'alguém que quer trabalhar em vendas/remoto (futuro setter ou closer da equipa)' : 'alguém interessado em aprender trading ou liberdade financeira (futuro aluno)'}.\n` +
            'Responde em JSON: {"encaixa": true|false, "perfil": "recruta"|"cliente"|"nenhum", "resposta": "texto da resposta pública"}. ' +
            'encaixa=false se for marca, guru, venda de cursos, spam, conteúdo político, ou se uma resposta tua fosse forçada.',
        },
      ],
      json: true,
      maxTokens: 300,
      temperatura: 0.7,
      tarefa: 'threads-agente',
      prioridade: 'fundo',
      timeoutMs: 15_000,
    })
    return JSON.parse(r.texto) as Decisao
  } catch {
    return null
  }
}

async function continuar(c: Conversa, ultima: string): Promise<string | null> {
  const historico = c.historico.map((h) => `${h.quem === 'nos' ? 'Tu' : `@${c.username}`}: ${h.texto}`).join('\n')
  try {
    const r = await chamarIAGratis({
      sistema: sistema(),
      mensagens: [
        {
          role: 'user',
          content:
            `Conversa pública no Threads com @${c.username} (${c.perfil === 'recruta' ? 'possível setter/closer' : 'possível aluno'}):\n${historico}\n@${c.username}: ${ultima}\n\n` +
            `Escreve a tua próxima resposta (só o texto). Responde ao que a pessoa disse. ` +
            (c.turnos >= 1 ? `Se fizer sentido, convida para o passo seguinte: ${PASSOS[c.perfil]}. ` : 'Ainda sem links. ') +
            'Se a pessoa não quiser, despede-te com simpatia e não insistas.',
        },
      ],
      maxTokens: 250,
      temperatura: 0.7,
      tarefa: 'threads-agente',
      prioridade: 'fundo',
      timeoutMs: 15_000,
    })
    return limparResposta(r.texto)
  } catch {
    return null
  }
}

async function registarNoCrm(db: SupabaseClient, responsavel: string | undefined, username: string, perfil: Perfil, texto: string, link?: string) {
  const u = username.toLowerCase()
  const recruta = perfil === 'recruta'
  const { data: neg } = await db
    .from('vendas_negocios')
    .upsert(
      {
        nome: `@${username}`,
        origem: 'threads',
        estado: 'contactado',
        etiquetas: recruta ? ['threads', 'prospecao_threads', 'recruta', 'candidato_equipa'] : ['threads', 'prospecao_threads'],
        interesse: recruta ? 'Trabalhar na equipa comercial (setter/closer)' : 'Aprender trading / educação financeira',
        nota: `Prospeção no Threads. Post: «${texto.slice(0, 200)}»${link ? ` (${link})` : ''}. Já tem resposta pública nossa; seguimento automático até ${MAX_TURNOS} turnos.`,
        chave_origem: `threads:${u}`,
        funil: recruta ? 'b2b' : 'educacao',
      },
      { onConflict: 'chave_origem', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()
  if (neg?.id && responsavel) {
    await db.from('vendas_tarefas').upsert(
      {
        titulo: `${recruta ? 'Recrutamento' : 'Lead'} · @${username} (Threads)`,
        descricao: recruta
          ? 'Contactado no Threads. Ver se preencheu /work; senão, convidar para a entrevista.'
          : 'Contactado no Threads. Acompanhar a conversa e levar ao /caminho ou ao /agendar.',
        responsavel_id: responsavel,
        negocio_id: neg.id,
        papel: 'setter',
        prazo: new Date(Date.now() + 86_400_000).toISOString(),
        estado: 'aberta',
        chave: `${recruta ? 'recruta' : 'lead'}:threads:${u}`,
      },
      { onConflict: 'chave', ignoreDuplicates: true },
    )
  }
}

/** Prospeção + conversas + aprendizagem. Nunca lança: devolve o resumo. */
export async function correrAgenteThreads(
  db: SupabaseClient,
  token: TokenThreads,
  ctx: { responsavel?: string; postsNossos: string[] },
): Promise<Record<string, unknown>> {
  const out = { novas: 0, seguimentos: 0, aprendidos: 0, erros: [] as string[] }
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const est: EstadoProspecao & { ligado?: boolean } = { ligado: true, vistos: [], conversas: [], ...(data?.value as EstadoProspecao | null) }
  if (est.ligado === false) return { desligado: true }
  const vistos = new Set(est.vistos ?? [])
  const agora = new Date()

  // 2. Conversas em curso primeiro (quem respondeu tem prioridade sobre estranhos).
  for (const c of (est.conversas ?? []).filter((c) => c.turnos < MAX_TURNOS).slice(0, 8)) {
    if (quotaRestante(est, agora) <= 0) break
    try {
      const novas = (await respostasDe(token, c.nosso_id)).filter((r) => r.username?.toLowerCase() === c.username.toLowerCase())
      const ultima = novas[novas.length - 1]
      if (!ultima?.text || vistos.has(ultima.id)) continue
      vistos.add(ultima.id)
      const txt = await continuar(c, ultima.text)
      if (!txt) continue
      const id = await publicarTexto(token, txt, ultima.id)
      c.historico.push({ quem: 'eles', texto: ultima.text.slice(0, 300) }, { quem: 'nos', texto: txt })
      c.historico = c.historico.slice(-8)
      c.nosso_id = id
      c.turnos++
      c.atualizado = agora.toISOString()
      contarFeita(est, agora)
      out.seguimentos++
    } catch (e) {
      out.erros.push(`conversa @${c.username}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // 1. Prospeção nova.
  let feitasCiclo = 0
  for (const { q, perfil } of palavrasDoCiclo(agora)) {
    if (feitasCiclo >= TECTO_CICLO || quotaRestante(est, agora) <= 0) break
    let posts: Awaited<ReturnType<typeof pesquisar>> = []
    try {
      posts = await pesquisar(token, q)
    } catch (e) {
      out.erros.push(`pesquisa «${q}»: ${e instanceof Error ? e.message : e}`)
      continue
    }
    for (const p of posts) {
      if (feitasCiclo >= TECTO_CICLO || quotaRestante(est, agora) <= 0) break
      if (!postValido(p, token.username, vistos, agora)) continue
      vistos.add(p.id)
      const d = await decidir(p.text ?? '', p.username!, perfil)
      const resposta = limparResposta(d?.resposta)
      if (!d?.encaixa || !resposta || d.perfil === 'nenhum') continue
      const perfilFinal: Perfil = d.perfil === 'cliente' || d.perfil === 'recruta' ? d.perfil : perfil
      try {
        const id = await publicarTexto(token, resposta, p.id)
        vistos.add(`u:${p.username!.toLowerCase()}`)
        est.conversas = [
          {
            username: p.username!,
            perfil: perfilFinal,
            nosso_id: id,
            turnos: 1,
            historico: [
              { quem: 'eles' as const, texto: (p.text ?? '').slice(0, 300) },
              { quem: 'nos' as const, texto: resposta },
            ],
            atualizado: agora.toISOString(),
          },
          ...(est.conversas ?? []),
        ].slice(0, 60)
        await registarNoCrm(db, ctx.responsavel, p.username!, perfilFinal, p.text ?? '', p.permalink)
        contarFeita(est, agora)
        feitasCiclo++
        out.novas++
      } catch (e) {
        out.erros.push(`responder @${p.username}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  // 3. Aprender: métricas dos nossos posts (uma vez por dia chega).
  try {
    const { data: ap } = await db.from('site_settings').select('value').eq('key', CHAVE_APRENDER).maybeSingle()
    const aprender = (ap?.value as { dia?: string; posts?: Record<string, Record<string, number>> } | null) ?? {}
    const dia = agora.toISOString().slice(0, 10)
    if (aprender.dia !== dia && ctx.postsNossos.length) {
      aprender.posts = aprender.posts ?? {}
      for (const id of ctx.postsNossos.slice(0, 12)) {
        try {
          aprender.posts[id] = await metricasDe(token, id)
          out.aprendidos++
        } catch {
          /* post apagado ou sem métricas ainda */
        }
      }
      aprender.dia = dia
      await db.from('site_settings').upsert({ key: CHAVE_APRENDER, value: aprender }, { onConflict: 'key' })
    }
  } catch (e) {
    out.erros.push(`métricas: ${e instanceof Error ? e.message : e}`)
  }

  est.vistos = [...vistos].slice(-3000)
  await db.from('site_settings').upsert({ key: CHAVE, value: est }, { onConflict: 'key' })
  return out
}

/** Resposta a quem comentou um post de vaga: adaptada pela IA grátis, com o texto fixo de recurso. */
export async function respostaARecruta(texto: string, username: string, recurso: string): Promise<string> {
  try {
    const r = await chamarIAGratis({
      sistema: sistema(),
      mensagens: [
        {
          role: 'user',
          content:
            `@${username} respondeu ao teu post de vaga (setters/closers, remoto, comissão por venda) com: «${texto.slice(0, 400)}».\n` +
            `Escreve a resposta pública (só o texto): agradece, responde ao que disse e dá-lhe o passo seguinte: ${PASSOS.recruta}.`,
        },
      ],
      maxTokens: 220,
      temperatura: 0.6,
      tarefa: 'threads-agente',
      prioridade: 'fundo',
      timeoutMs: 12_000,
    })
    const t = limparResposta(r.texto)
    return t && t.includes('/work') ? t : recurso
  } catch {
    return recurso
  }
}
