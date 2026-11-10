import { NextRequest, NextResponse } from 'next/server'
import { ehMotor, quemPede } from '@/lib/conteudo-magnetico/acesso'
import { fundoComoDataUri, publicoComoDataUri, renderPeca } from '@/lib/conteudo-magnetico/desenho'
import { FORMATOS, MARCAS, marcasPermitidas, resolverMarca, type Formato, type Marca } from '@/lib/conteudo-magnetico/marcas'
import { normalizarLamina } from '@/lib/conteudo-magnetico/guiao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Desenha UMA peça em PNG (capa, lâmina do meio ou fecho).
 *
 * Quem chama: o ecrã (sessão de membro) e o motor de vídeo (Bearer CRON_SECRET), que pede os
 * cartões dos segmentos do reel. POST para o corpo levar o texto sem ir parar a logs de URL.
 */
export async function POST(request: NextRequest) {
  const motor = ehMotor(request)
  const quem = motor ? null : await quemPede(request)
  if (!motor && !quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const b = await request.json().catch(() => ({}))
  const formato = (b.formato in FORMATOS ? b.formato : 'carrossel') as Formato
  // O motor manda a marca já resolvida (vem do trabalho na fila, que já foi validado).
  let marca: Marca
  if (motor && b.marcaResolvida && typeof b.marcaResolvida === 'object') {
    const base = MARCAS[b.marcaResolvida.id as keyof typeof MARCAS] ?? MARCAS.propria
    marca = { ...base, ...b.marcaResolvida }
  } else {
    const id = String(b.marca || 'propria')
    if (!marcasPermitidas(!!quem?.admin).includes(id as never)) {
      return NextResponse.json({ erro: 'Essa marca é só da casa.' }, { status: 403 })
    }
    marca = resolverMarca(id, b.propria)
  }
  const dims = FORMATOS[formato]
  const total = Math.min(Math.max(Number(b.total) || 1, 1), 10)
  const indice = Math.min(Math.max(Number(b.indice) || 0, 0), total - 1)
  const lamina = normalizarLamina(b.lamina, indice === 0 ? 'capa' : indice === total - 1 ? 'fim' : 'meio')

  try {
    const png = await renderPeca({
      lamina,
      marca,
      largura: dims.largura,
      altura: dims.altura,
      indice,
      total,
      fundo: await fundoComoDataUri(lamina.fundo_url || b.fundo_url),
      logo: publicoComoDataUri(marca.logo),
      palavraChave: typeof b.palavra_chave === 'string' ? b.palavra_chave.slice(0, 20) : undefined,
      aviso: b.aviso !== false,
      semAssinatura: b.assinatura === false,
    })
    return new NextResponse(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=60' },
    })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Falhou o desenho.' }, { status: 500 })
  }
}
