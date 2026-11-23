/**
 * Ciclo de recrutamento no Threads (@ricardogarciapt). Corre dentro do cron do executor do pipeline
 * (de 2 em 2 h) — o projeto está no tecto de 100 crons da Vercel, por isso não tem cron próprio.
 *  1. Renova o token se faltar pouco.
 *  2. Publica um post de vaga de 3,5 em 3,5 dias (site_settings.threads_recrutamento.ligado).
 *  3. A cada pessoa nova que responde a um post de vaga: UMA resposta pública com o link da
 *     candidatura (escrita pela IA grátis) e o candidato no CRM com tarefa de setter.
 *  4. Agente (lib/threads/agente.ts): prospeção por palavra-chave, conversas e métricas.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { lerToken, publicarTexto, renovarSeFaltarPouco, respostasDe } from '@/lib/threads/cliente'
import { correrConteudoThreads } from '@/lib/threads/conteudo'
import { correrAgenteThreads, respostaARecruta } from '@/lib/threads/agente'
import { devePublicar, ehInteressado, postDaSemana, respostaAoInteressado } from '@/lib/threads/recrutamento'

const CHAVE = 'threads_recrutamento'
type Estado = { ligado?: boolean; posts?: string[]; ultimo_post_em?: string | null; respondidos?: string[]; responsavel_id?: string }

export async function correrRecrutamentoThreads(db: SupabaseClient): Promise<Record<string, unknown>> {
  let token = await lerToken(db)
  if (!token) return { ok: false, motivo: 'Threads por ligar: abrir /api/threads/oauth como admin.' }
  token = await renovarSeFaltarPouco(db, token)

  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const est: Estado = { ligado: true, posts: [], respondidos: [], ...(data?.value as Estado | null) }
  if (est.ligado === false) return { ok: true, desligado: true }

  const r = { publicado: null as string | null, candidatos: 0, erros: [] as string[] }

  if (devePublicar(est.ultimo_post_em)) {
    try {
      r.publicado = await publicarTexto(token, postDaSemana())
      est.posts = [r.publicado, ...(est.posts ?? [])].slice(0, 12)
      est.ultimo_post_em = new Date().toISOString()
    } catch (e) {
      r.erros.push(`publicar: ${e instanceof Error ? e.message : e}`)
    }
  }

  const respondidos = new Set(est.respondidos ?? [])
  let responsavel = est.responsavel_id
  if (!responsavel) {
    const { data: adm } = await db.from('profiles').select('id').eq('user_type', 'admin').order('created_at').limit(1).maybeSingle()
    responsavel = adm?.id as string | undefined
  }

  for (const post of (est.posts ?? []).slice(0, 6)) {
    let lista: Awaited<ReturnType<typeof respostasDe>> = []
    try {
      lista = await respostasDe(token, post)
    } catch (e) {
      r.erros.push(`respostas ${post}: ${e instanceof Error ? e.message : e}`)
      continue
    }
    for (const resp of lista) {
      const u = resp.username?.toLowerCase()
      if (!u || respondidos.has(u) || !ehInteressado(resp.text, resp.username, token.username)) continue
      if (r.candidatos >= 10) break
      try {
        await publicarTexto(token, await respostaARecruta(resp.text ?? '', resp.username!, respostaAoInteressado(resp.username)), resp.id)
        const chave = `threads:${u}`
        const { data: neg } = await db
          .from('vendas_negocios')
          .upsert(
            {
              nome: `@${resp.username}`,
              origem: 'threads',
              estado: 'contactado',
              etiquetas: ['recruta', 'candidato_equipa', 'threads'],
              interesse: 'Trabalhar na equipa comercial (setter/closer)',
              nota: `Respondeu ao post de recrutamento no Threads: «${(resp.text ?? '').slice(0, 200)}». Já recebeu o link da candidatura.`,
              chave_origem: chave,
              funil: 'b2b',
            },
            { onConflict: 'chave_origem', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle()
        if (neg?.id && responsavel) {
          await db.from('vendas_tarefas').insert({
            titulo: `Recrutamento · @${resp.username} (Threads)`,
            descricao: 'Respondeu ao post de recrutamento. Ver se preencheu /work; senão, DM no Threads/Instagram a convidar para a entrevista.',
            responsavel_id: responsavel,
            negocio_id: neg.id,
            papel: 'setter',
            prazo: new Date(Date.now() + 86_400_000).toISOString(),
            estado: 'aberta',
            chave: `recruta:threads:${u}`,
          })
        }
        respondidos.add(u)
        r.candidatos++
      } catch (e) {
        r.erros.push(`@${u}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  est.respondidos = [...respondidos].slice(-2000)
  await db.from('site_settings').upsert({ key: CHAVE, value: est }, { onConflict: 'key' })

  // 23/11: prospeção ativa, conversas e métricas (IA grátis). Uma falha lá não estraga o resto.
  // Conteúdo para todos os funis (post de valor de ~6 em 6 h + respostas a quem comenta).
  const conteudo = await correrConteudoThreads(db, token, responsavel).catch((e) => ({
    erro: e instanceof Error ? e.message : String(e),
  }))
  const { data: ct } = await db.from('site_settings').select('value').eq('key', 'threads_conteudo').maybeSingle()
  const postsConteudo = ((ct?.value as { posts?: { id: string }[] } | null)?.posts ?? []).map((p) => p.id)

  const agente = await correrAgenteThreads(db, token, { responsavel, postsNossos: [...(est.posts ?? []), ...postsConteudo] }).catch((e) => ({
    erro: e instanceof Error ? e.message : String(e),
  }))
  return { ok: true, ...r, conteudo, agente }
}
