/**
 * GUIÃO → REEL FEITO PELO CLONE (HeyGen), sem take — partilhado pelo botão «Fazer com o clone» do
 * /estudio e pelo pedido diário dos reels cinemáticos (lib/estudio/reels-cinematicos.ts).
 * Uma cena por segmento do guião com fala, cada uma no look VERTICAL do seu plano, voz da Fish.
 * Quando a HeyGen acaba, nasce o projecto no MOLDE CINEMÁTICO (heygen.ts → projetoDoClone).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarHeygen } from './heygen'
import { cenasDoGuiao, lookDoPlano, VOZ_RICARDO } from './heygen-looks'
import { falarParaStorage } from '@/lib/voz'

export async function pedirReelDoClone(db: SupabaseClient, pecaId: string, userId: string | null, via: 'api' | 'mcp' = 'mcp'): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const { data: peca } = await db.from('conteudo_magnetico_pecas').select('id, user_id, marca, guiao').eq('id', pecaId).maybeSingle()
  if (!peca) return { status: 404, corpo: { erro: 'Guião não encontrado.' } }
  // 20/11: o molde cinemático serve as duas marcas (os anúncios da MTM já usam o gémeo).
  if (peca.marca !== 'ricardo-garcia' && peca.marca !== 'morethanmoney') return { status: 400, corpo: { erro: 'O clone é só para as marcas da casa.' } }
  const marca = peca.marca as 'ricardo-garcia' | 'morethanmoney'
  // Molde cinemático: o gémeo fala sempre a ecrã inteiro; as imagens de apoio do guião entram depois,
  // em PiP, pelo robô cinemático (nada de bolha da HeyGen por cima do b-roll).
  const cenasGuiao = cenasDoGuiao(peca.guiao)
  const apoio = cenasGuiao.map((c) => c.media_url).filter((u): u is string => !!u).slice(0, 4)
  const cenas = cenasGuiao.map((c) => ({ ...c, visual: 'apresentador', media_url: null }))
  if (!cenas.length) return { status: 400, corpo: { erro: 'O guião não tem falas nos segmentos.' } }

  // Um pedido de cada vez por guião (evita gastar créditos duas vezes num duplo clique).
  const { data: ja } = await db.from('estudio_geracoes').select('id')
    .eq('origem', 'clone-reel').in('estado', ['a_gerar', 'aguarda_mcp']).contains('params', { peca_id: pecaId }).limit(1)
  if (ja?.length) return { status: 200, corpo: { ok: true, id: ja[0].id, estado: 'a_gerar', cenas: cenas.length, repetido: true } }

  const texto = cenas.map((c) => c.texto).join(' ').slice(0, 1500)
  const nicho = String((peca.guiao as any)?.nicho || '').slice(0, 80)

  // Via plano (MCP): só regista o pedido com tudo o que a rotina diária precisa para o gerar.
  if (via === 'mcp') {
    const look = lookDoPlano(cenas[0].plano, process.env.HEYGEN_AVATAR_ID?.trim() || null)
    const { data: m, error: em } = await db.from('estudio_geracoes').insert({
      tipo: 'falar',
      estado: 'aguarda_mcp',
      params: { aspecto: '9:16', texto, marca, peca_id: pecaId, cenas, apoio, look_id: look.id, voz_id: process.env.HEYGEN_VOICE_ID?.trim() || VOZ_RICARDO, titulo: nicho ? `MTM · ${nicho}` : `MTM · ${marca}` },
      origem: 'clone-reel',
      pedido_por: userId || peca.user_id,
      motor: 'heygen',
    }).select('id').single()
    if (em || !m) return { status: 500, corpo: { erro: 'Não consegui registar o pedido.' } }
    return { status: 200, corpo: { ok: true, id: m.id, estado: 'aguarda_mcp', cenas: cenas.length } }
  }
  const { data: g, error } = await db.from('estudio_geracoes').insert({
    tipo: 'falar',
    estado: 'fila',
    params: { aspecto: '9:16', texto, marca, peca_id: pecaId, cenas, apoio },
    origem: 'clone-reel',
    pedido_por: userId || peca.user_id,
    motor: 'heygen',
  }).select('id').single()
  if (error || !g) return { status: 500, corpo: { erro: 'Não consegui registar o pedido.' } }

  // A voz é a da Fish (a mesma dos reels e do LMS), uma faixa por cena; a HeyGen só mexe os lábios.
  // Se a Fish falhar numa cena, essa cena fica com a voz clonada da HeyGen.
  const vozes = await Promise.all(cenas.map((c, i) =>
    falarParaStorage(db, c.texto, `clone-reel/${pecaId}/${g.id}-${i + 1}.mp3`).catch(() => null)))
  vozes.forEach((v, i) => { if (v && v.ok) cenas[i].audio_url = v.url })
  const h = await enviarHeygen(cenas, '9:16', nicho ? `MTM · ${nicho}` : undefined)
  const agora = new Date().toISOString()
  if ('erro' in h) {
    await db.from('estudio_geracoes').update({ estado: 'erro', erro: h.erro, terminado_em: agora }).eq('id', g.id)
    return { status: 502, corpo: { ok: false, id: g.id, erro: h.erro } }
  }
  await db.from('estudio_geracoes').update({
    estado: 'a_gerar',
    reclamado_em: agora,
    params: { aspecto: '9:16', texto, marca, peca_id: pecaId, cenas, apoio, heygen_id: h.id },
  }).eq('id', g.id)
  return { status: 200, corpo: { ok: true, id: g.id, estado: 'a_gerar', cenas: cenas.length } }
}
