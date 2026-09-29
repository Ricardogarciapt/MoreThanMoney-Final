/**
 * O FLYER DE UM PRODUTO — uma imagem 1080×1350 pronta a publicar, com download.
 *
 * GET /api/marketplace/ia/flyer?id=<produtoId>[&fundo=<url>]
 *
 * ── PORQUE É QUE O TEXTO NÃO É GERADO POR IA ──────────────────────────────────────────────
 *
 * A imagem de FUNDO é (ou pode ser) gerada por IA — pela via gratuita, como todo o resto do
 * marketplace (ver `lib/marketplace/ia.ts`). O TEXTO em cima dela não: é o título, o preço e o
 * autor, lidos da base de dados.
 *
 * A razão é que um modelo de difusão não sabe escrever. Pedir-lhe um flyer «com o título e o
 * preço» devolve tipografia deformada e números inventados — e um flyer com um preço errado é
 * publicidade enganosa, não um erro gráfico. O `prompt` da capa até lhe pede explicitamente «sem
 * texto, sem letras, sem números», por isto mesmo.
 *
 * Por isso o flyer é composto: fundo por IA, texto por `next/og` (Satori), que desenha exactamente
 * o que lhe damos. É a mesma máquina que já faz o flyer semanal de resultados e os cartões sociais.
 *
 * ── QUEM PODE VER ISTO ────────────────────────────────────────────────────────────────────
 *
 * O dono do produto ou um admin, e mais ninguém. Não é uma rota pública como o flyer semanal: um
 * flyer mostra o preço e o autor de um produto que pode ainda estar em rascunho, e um rascunho é
 * material não publicado de outra pessoa. O `?fundo=` só aceita imagens do nosso próprio
 * armazenamento — ver a nota mais abaixo.
 */

import { ImageResponse } from 'next/og'
import { NextResponse, type NextRequest } from 'next/server'
import { nomeDaCategoria, euros, precoEfectivo } from '@/lib/marketplace/regras'
import { produtoSobGestao } from '@/lib/marketplace/gestao'
import { mapaDeAutores } from '@/lib/marketplace/servidor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const OURO = '#D2A63C'
const CINZA = '#bdbdbd'

/**
 * Um `?fundo=` arbitrário faria desta rota um buscador de URLs à escolha de quem a chama — o
 * servidor a ir buscar o que lhe mandarem, a partir da nossa rede. Por isso só se aceita o nosso
 * próprio armazenamento, que é de onde as imagens do marketplace vêm.
 */
function fundoAceitavel(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const anfitriaoSupa = supa ? new URL(supa).host : ''
    return u.host === anfitriaoSupa ? u.toString() : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  // A mesma guarda de sempre: devolve o produto só a quem tem direito a ele.
  const r = await produtoSobGestao(id)
  if (!r.produto) {
    return NextResponse.json(
      { error: r.motivo === 'sem_sessao' ? 'Sessão necessária' : 'Produto não encontrado' },
      { status: r.motivo === 'sem_sessao' ? 401 : 404 },
    )
  }
  const p = r.produto

  const autores = await mapaDeAutores([p.educator_id])
  const autor = p.educator_id ? autores.get(p.educator_id)?.display_name ?? null : 'MoreThanMoney'

  // O preço SEM perfil: um flyer é material público e não pode mostrar o desconto de membro de
  // ninguém em particular. Mostra o preço de tabela e, se houver campanha para todos, essa.
  const preco = precoEfectivo(p, new Date().toISOString(), null)

  const fundo = fundoAceitavel(request.nextUrl.searchParams.get('fundo') ?? p.imagem_url)

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1350,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: '#0a0a0a',
          position: 'relative',
        }}
      >
        {fundo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fundo}
            alt=""
            width={1080}
            height={1350}
            style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 1350, objectFit: 'cover' }}
          />
        ) : null}

        {/* O degradê não é decoração: sem ele, um fundo claro deixa o texto branco ilegível, e o
            fundo vem de um modelo de difusão que não nos diz de que cor vai ser. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 1080,
            height: 1350,
            background: 'linear-gradient(to bottom, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0.75) 55%, rgba(10,10,10,0.97) 100%)',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', padding: 72, gap: 22, zIndex: 1 }}>
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: 4, color: OURO, textTransform: 'uppercase' }}>
            {nomeDaCategoria(p.tipo)}
          </div>

          <div style={{ display: 'flex', fontSize: 82, fontWeight: 700, color: '#fff', lineHeight: 1.05 }}>
            {p.titulo.slice(0, 80)}
          </div>

          {p.subtitulo ? (
            <div style={{ display: 'flex', fontSize: 36, color: CINZA, lineHeight: 1.3 }}>
              {p.subtitulo.slice(0, 140)}
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginTop: 16 }}>
            {preco.emCampanha ? (
              <div style={{ display: 'flex', fontSize: 44, color: CINZA, textDecoration: 'line-through' }}>
                {euros(preco.baseCents, preco.moeda)}
              </div>
            ) : null}
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, color: OURO, lineHeight: 1 }}>
              {preco.baseCents === 0 ? 'Grátis' : euros(preco.cents, preco.moeda)}
            </div>
            {p.recorrente ? (
              <div style={{ display: 'flex', fontSize: 38, color: CINZA, paddingBottom: 12 }}>/mês</div>
            ) : null}
          </div>

          {preco.emCampanha ? (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                fontSize: 32,
                fontWeight: 700,
                color: '#0a0a0a',
                background: OURO,
                borderRadius: 12,
                padding: '10px 22px',
              }}
            >
              {`−${preco.descontoPct}%`}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 28,
              paddingTop: 28,
              borderTop: `1px solid rgba(210,166,60,0.35)`,
            }}
          >
            <div style={{ display: 'flex', fontSize: 34, color: '#fff' }}>{autor ?? ''}</div>
            <div style={{ display: 'flex', fontSize: 30, color: OURO }}>morethanmoney.pt</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  )
}
