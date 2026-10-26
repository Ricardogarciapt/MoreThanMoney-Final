import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { SLUG_RE, sanitizeDestino, sanitizeFields, type CustomFormField, type DestinoFormulario } from '@/lib/custom-forms'
import { guardarFunis, lerFunis, type Funil } from '@/lib/funis'
import { criarCampanhaPausada, validarNovaCampanha, type NovaCampanhaMeta } from '@/lib/trafego/meta'
import { peneira } from './regras'

/**
 * OS RASCUNHOS DO MARKETING — o que a IA propõe e o dono aplica (tabela `marketing_rascunhos`).
 *
 * Dois tipos:
 *   · `lancamento` — o kit de um produto novo: palavra-chave do Instagram, resposta e seguimento,
 *     formulário de captação com destino no pipeline, e o desenho do funil. Aplicar cria o
 *     formulário (activo, para ter link), a automação DESLIGADA e o funil no mapa.
 *   · `campanha_meta` — campanha, conjunto, criativo e anúncio na Meta, tudo em PAUSA.
 *
 * A validação (`validarLancamento`) é pura e está na guarda `marketing.check.ts`: a IA erra
 * formatos, e um rascunho que não se consegue aplicar não deve sequer ser guardado.
 */

export interface KitLancamento {
  produto: string
  palavraChave: string
  respostaPublica: string[]
  mensagemPrivada: string
  seguimento: Array<{ esperaMin: number; texto: string }>
  formulario: { slug: string; titulo: string; subtitulo: string; campos: CustomFormField[] }
  destino: DestinoFormulario
  funil: { nome: string; descricao: string }
}

const t = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

export function validarLancamento(raw: unknown): { ok: true; kit: KitLancamento; avisos: string[] } | { ok: false; erros: string[] } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const erros: string[] = []
  const produto = t(o.produto, 120)
  if (!produto) erros.push('produto')
  const palavraChave = t(o.palavraChave, 30).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim()
  if (palavraChave.length < 3) erros.push('palavra-chave (3+ letras)')

  const respostaPublica = (Array.isArray(o.respostaPublica) ? o.respostaPublica : [o.respostaPublica])
    .map((x) => t(x, 300)).filter(Boolean).slice(0, 5)
  if (!respostaPublica.length) erros.push('resposta pública ao comentário')
  const mensagemPrivada = t(o.mensagemPrivada, 1000)
  if (!mensagemPrivada) erros.push('mensagem privada')
  const seguimento = (Array.isArray(o.seguimento) ? o.seguimento : []).slice(0, 5).map((p) => {
    const q = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    return { esperaMin: Math.min(Math.max(Math.round(Number(q.esperaMin) || 0), 5), 60 * 24 * 7), texto: t(q.texto, 800) }
  }).filter((p) => p.texto)

  const f = (o.formulario && typeof o.formulario === 'object' ? o.formulario : {}) as Record<string, unknown>
  const slug = t(f.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (!SLUG_RE.test(slug)) erros.push('slug do formulário (a-z, 0-9, hífens)')
  const titulo = t(f.titulo, 160)
  if (!titulo) erros.push('título do formulário')
  const campos = sanitizeFields(f.campos)
  if (!campos || !campos.length) erros.push('campos do formulário')
  else if (!campos.some((c) => c.type === 'email')) erros.push('o formulário precisa de um campo de email')

  const funil = (o.funil && typeof o.funil === 'object' ? o.funil : {}) as Record<string, unknown>
  if (erros.length) return { ok: false, erros }

  const kit: KitLancamento = {
    produto,
    palavraChave,
    respostaPublica,
    mensagemPrivada,
    seguimento,
    formulario: { slug, titulo, subtitulo: t(f.subtitulo, 300), campos: campos! },
    destino: sanitizeDestino({ ...(o.destino as object), etiquetas: [...((o.destino as { etiquetas?: string[] })?.etiquetas ?? []), `produto:${slug}`] }),
    funil: { nome: t(funil.nome, 120) || `${produto} · lançamento`, descricao: t(funil.descricao, 400) },
  }
  const avisos = peneira([kit.respostaPublica.join('\n'), kit.mensagemPrivada, ...kit.seguimento.map((s) => s.texto)].join('\n'))
  return { ok: true, kit, avisos }
}

/** O desenho do funil a partir do kit — para o mapa de funis mostrar o caminho novo. */
export function funilDoKit(kit: KitLancamento, formUrl: string): Funil {
  const id = `lancamento-${kit.formulario.slug}`
  return {
    id,
    nome: kit.funil.nome,
    descricao: kit.funil.descricao || `Kit de lançamento de ${kit.produto} (Marketing → Rascunhos).`,
    nos: [
      { id: 'post', tipo: 'entrada', titulo: `Comenta ${kit.palavraChave}`, detalhe: 'Post/Reel com CTA de palavra-chave', config: { origem: 'comentario_ig' }, x: 40, y: 40, seguintes: ['resposta'] },
      { id: 'resposta', tipo: 'mensagem', titulo: 'Resposta pública + mensagem privada', detalhe: kit.mensagemPrivada.slice(0, 120), config: { canal: 'instagram_comentario' }, x: 40, y: 150, seguintes: ['form'] },
      { id: 'form', tipo: 'destino', titulo: `Formulário ${kit.formulario.titulo}`, detalhe: formUrl, config: { conta_como: 'registo' }, x: 40, y: 260, seguintes: ['pipeline'] },
      { id: 'pipeline', tipo: 'acao', titulo: 'Entra no pipeline', detalhe: `Etiquetas: ${kit.destino.etiquetas.join(', ')}`, config: {}, x: 40, y: 370, seguintes: ['agenda'] },
      { id: 'agenda', tipo: 'destino', titulo: 'Marca chamada em /agendar', config: { conta_como: 'registo' }, x: 40, y: 480, seguintes: [] },
    ],
  }
}

export async function aplicarLancamento(kit: KitLancamento): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin()
  const formUrl = `https://www.morethanmoney.pt/docs/forms/${kit.formulario.slug}`
  const form = await db.from('custom_forms').insert({
    slug: kit.formulario.slug,
    title: kit.formulario.titulo,
    subtitle: kit.formulario.subtitulo || null,
    active: true,
    fields: kit.formulario.campos,
    destino: kit.destino,
  }).select('id').single()
  if (form.error) throw new Error(form.error.code === '23505' ? `Já existe um formulário «${kit.formulario.slug}».` : form.error.message)

  const funil = funilDoKit(kit, formUrl)
  const auto = await db.from('mtm_automacoes').insert({
    nome: `${kit.produto} · ${kit.palavraChave}`.slice(0, 120),
    canal: 'instagram_comentario',
    gatilho: 'palavra',
    valor: kit.palavraChave,
    resposta_tipo: 'texto',
    resposta: { texto: kit.mensagemPrivada.replace('{link}', formUrl), url: formUrl, publicas: kit.respostaPublica },
    seguimento: kit.seguimento.length ? kit.seguimento : null,
    funil_id: funil.id,
    no_id: 'resposta',
    // Desligada: o dono lê-a em /admin/social e liga quando quiser.
    ativa: false,
  }).select('id').single()
  if (auto.error) throw new Error(`Formulário criado, mas a automação falhou: ${auto.error.message}`)

  const funis = (await lerFunis()).filter((f) => f.id !== funil.id)
  const g = await guardarFunis([...funis, funil])
  return { formularioId: form.data.id, formUrl, automacaoId: auto.data.id, automacaoActiva: false, funilId: funil.id, funilGuardado: g.ok }
}

export async function aplicarCampanha(c: NovaCampanhaMeta): Promise<Record<string, unknown>> {
  const erros = validarNovaCampanha(c)
  if (erros.length) throw new Error(`Campanha inválida: ${erros.join(', ')}.`)
  const r = await criarCampanhaPausada(c)
  if (!r.ok) throw new Error(`${r.erro}${Object.keys(r.criados).length ? ` (já criado em pausa: ${JSON.stringify(r.criados)})` : ''}`)
  return { ...r, estado: 'PAUSED' }
}

export async function guardarRascunho(tipo: 'lancamento' | 'campanha_meta', titulo: string, conteudo: unknown, origem: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('marketing_rascunhos')
    .insert({ tipo, titulo: titulo.slice(0, 200), conteudo, origem: origem.slice(0, 60) })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}
