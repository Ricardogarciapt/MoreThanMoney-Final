import { tokenDoYoutube, subirShort } from '@/lib/videocliper/publicar'
import { juntarBloco, type LinguaYoutube } from '@/lib/youtube/descricao'
import { parecePortugues } from '@/lib/pt-pt'
import { publicCaption, IG_PERSONAL_ID } from '@/lib/instagram/publish'

/**
 * REEL → YOUTUBE SHORTS, no mesmo passo que o Instagram.
 *
 * Chamado pelo cron ig-publish logo a seguir a um REELS sair no Instagram. O reel já está
 * publicado e a linha já está marcada como «published» quando isto corre: um falhanço aqui
 * nunca reverte nem repete a publicação no Instagram — só fica registado no log.
 *
 * Regras:
 *  - Só o original: a «reserva» (reserva_de) é a cópia do mesmo vídeo e não sobe outra vez.
 *  - Título = 1.ª linha da legenda (sem o #Shorts, que o subirShort acrescenta).
 *  - Descrição = legenda PT/EN + bloco de CTAs da casa (lib/youtube/descricao.ts).
 *  - Reels do @ricardogarciapt levam uma linha a dizer quem fala, porque sobem para o canal da casa.
 *  - Interruptor de emergência: YOUTUBE_SHORTS_REELS=0 desliga sem mexer no código.
 *  - Orçamento de tempo: a ronda do cron tem 300 s; acima de 200 s já não entra mais nenhum upload.
 */

const LIMITE_RONDA_MS = 200_000

/** Quem é o dono do reel: a conta pessoal ou a da marca. */
export function ehReelPessoal(row: { ig_account_id?: string | null; created_by?: string | null }): boolean {
  return row.ig_account_id === IG_PERSONAL_ID || String(row.created_by ?? '').endsWith(':ricardo')
}

export function tituloReel(caption: string): string {
  const primeira = caption.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  const limpo = primeira.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim()
  return (limpo || 'Reel MTM').slice(0, 80)
}

export interface ResultadoShort {
  ok: boolean
  videoId?: string
  url?: string
  erro?: string
}

export async function publicarReelNoYoutube(
  row: { id: string; media_urls?: string[] | null; ig_account_id?: string | null; created_by?: string | null; reserva_de?: string | null },
  legenda: string,
  inicioRonda: number,
): Promise<ResultadoShort | null> {
  if (process.env.YOUTUBE_SHORTS_REELS === '0') return null
  if (row.reserva_de) return null
  const video = (row.media_urls ?? [])[0]
  if (!video) return null

  if (Date.now() - inicioRonda > LIMITE_RONDA_MS) {
    console.warn(`[ig-publish] shorts do reel ${row.id} adiado: ronda com pouco tempo`)
    return { ok: false, erro: 'adiado por falta de tempo na ronda' }
  }

  try {
    const texto = publicCaption(legenda)
    const lingua: LinguaYoutube = parecePortugues(texto) ? 'pt' : 'en'
    const pessoal = ehReelPessoal(row)
    const linhaDono = pessoal
      ? (lingua === 'pt' ? 'Conteúdo de Ricardo Garcia (@ricardogarciapt).' : 'Content by Ricardo Garcia (@ricardogarciapt).')
      : ''
    const corpo = [texto, linhaDono].filter(Boolean).join('\n\n')
    const descricao = juntarBloco(corpo, lingua)

    const token = await tokenDoYoutube()
    const resposta = await fetch(video)
    if (!resposta.ok) throw new Error(`o reel não se deixou ler (HTTP ${resposta.status})`)
    const bytes = Buffer.from(new Uint8Array((await resposta.arrayBuffer()) as ArrayBuffer))

    const { videoId } = await subirShort(token, bytes, tituloReel(texto), descricao)
    const url = `https://www.youtube.com/shorts/${videoId}`
    console.log(`[ig-publish] reel ${row.id} → Short ${url}`)
    return { ok: true, videoId, url }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'erro no YouTube'
    console.error(`[ig-publish] shorts do reel ${row.id} falhou:`, erro)
    return { ok: false, erro }
  }
}
