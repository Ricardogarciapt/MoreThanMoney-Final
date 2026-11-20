/**
 * TAKE → PROJECTO DO EDITOR («Montar com IA»), partilhado por:
 *  · POST /api/estudio/projeto com take_id (o botão do editor, com ou sem comando escrito);
 *  · o ROBÔ dos reels: quando a transcrição de um take do Ricardo fica pronta, o projecto é
 *    montado sozinho (reel curto, planos do guião) e vai logo para o Mac renderizar.
 * O render fica na biblioteca do /estudio; nada aqui publica no Instagram.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MARCAS_CASA } from '@/lib/conteudo-magnetico/acesso'
import { normalizarCortes, normalizarPalavras } from './texto'
import { lerComando } from './comando'
import { montarDeTake, normalizarProjeto, type Projeto } from './projeto'

/** Pedido do robô: o ritmo dos reels do Ricardo (gancho → plano → take → plano), 15 s, 3 planos. */
export const COMANDO_ROBO = 'Cria um reel do Ricardo em 3 planos, 15 s'

export async function projetoDoTake(
  db: SupabaseClient,
  takeId: string,
  opcoes: { comando?: string | null; formato?: Projeto['formato'] } = {},
): Promise<{ titulo: string; marca: string; projeto: Projeto; caminho: string; pecaId: string | null } | null> {
  const { data: t } = await db.from('estudio_gravacoes')
    .select('id, peca_id, marca, caminho, duracao_s, cortes, transcricao').eq('id', takeId).maybeSingle()
  if (!t) return null
  const marca = MARCAS_CASA.includes(t.marca) ? t.marca : 'morethanmoney'
  const [{ data: peca }, { data: ativos }] = await Promise.all([
    t.peca_id ? db.from('conteudo_magnetico_pecas').select('guiao').eq('id', t.peca_id).maybeSingle() : Promise.resolve({ data: null }),
    t.peca_id
      ? db.from('estudio_ativos').select('id, tipo, nome, caminho, animacao, segmento').eq('peca_id', t.peca_id).eq('estado', 'pronto').order('segmento', { ascending: true }).limit(20)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const g = (peca?.guiao ?? {}) as any
  const seg0 = Array.isArray(g.reel?.segmentos) ? g.reel.segmentos[0] : null
  const gancho = (seg0?.texto_ecra || g.laminas?.[0]?.titulo || '').toString().slice(0, 90) || null
  const cta = g.palavra_chave ? `Comenta «${String(g.palavra_chave)}»` : null
  const lista = (ativos ?? []) as any[]
  const musica = lista.find((a) => a.tipo === 'audio') ?? null
  const projeto = montarDeTake({
    take: { id: t.id, caminho: t.caminho, duracao_s: Number(t.duracao_s) || 30, cortes: normalizarCortes(t.cortes), nome: 'Take' },
    gancho, cta, ativos: lista, musica, formato: opcoes.formato,
    palavras: normalizarPalavras((t as any).transcricao?.palavras ?? (t as any).transcricao),
    comando: opcoes.comando?.trim() ? lerComando(opcoes.comando) : null,
  })
  const titulo = g.nicho ? `Reel · ${String(g.nicho).slice(0, 60)}` : 'Reel montado com IA'
  return { titulo, marca, projeto, caminho: t.caminho, pecaId: t.peca_id ?? null }
}

/**
 * Robô: take do Ricardo (marca ricardo-garcia, ligado a um guião) com transcrição pronta →
 * projecto curto já em 'a_render'. Um só por take (re-transcrever não duplica). Nunca lança.
 */
export async function roboReelDoTake(db: SupabaseClient, takeId: string): Promise<string | null> {
  try {
    const { data: t } = await db.from('estudio_gravacoes').select('marca, peca_id, caminho').eq('id', takeId).maybeSingle()
    if (!t || t.marca !== 'ricardo-garcia' || !t.peca_id) return null
    const { data: ja } = await db.from('estudio_projetos').select('id')
      .contains('projeto', { clips: [{ fonte: { caminho: t.caminho } }] }).limit(1)
    if (ja?.length) return null
    const r = await projetoDoTake(db, takeId, { comando: COMANDO_ROBO })
    if (!r || !r.projeto.clips.length) return null
    const { data: dono } = await db.from('conteudo_magnetico_pecas').select('user_id, guiao').eq('id', t.peca_id).maybeSingle()
    if (!dono?.user_id) return null
    // 20/11: o reel do robô sai no MOLDE CINEMÁTICO (o take dele por baixo, edição AnuncioReel por cima),
    // montado pelo robô video/cinematico/robo-cinematico.mjs. O «Montar com IA» à mão continua na timeline.
    const take = r.projeto.clips.find((c) => c.fonte.tipo === 'take') ?? r.projeto.clips[0]
    const g = (dono.guiao ?? {}) as any
    const seg0 = Array.isArray(g.reel?.segmentos) ? g.reel.segmentos[0] : null
    const projeto = normalizarProjeto({
      ...r.projeto,
      clips: [take],
      textos: [],
      molde: 'cinematico',
      cinematico: {
        marca: r.marca === 'morethanmoney' ? 'morethanmoney' : 'ricardo-garcia',
        gancho: String(seg0?.texto_ecra || ''),
        palavra_chave: String(g.palavra_chave || ''),
        nicho: String(g.nicho || ''),
        texto: (Array.isArray(g.reel?.segmentos) ? g.reel.segmentos : []).map((x: any) => String(x?.fala || '')).join(' '),
        apoio: [],
        cta_url: String(g.cta_url || ''),
      },
    })
    const { data } = await db.from('estudio_projetos')
      .insert({ user_id: dono.user_id, titulo: `${r.titulo} · robô`.slice(0, 120), marca: r.marca, projeto, estado: 'a_render' })
      .select('id').maybeSingle()
    return data?.id ?? null
  } catch {
    return null
  }
}
