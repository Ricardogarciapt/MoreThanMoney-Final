import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * AS IMAGENS DO ESTÚDIO: as que vêm do computador e as que se pedem à IA.
 *
 * O campo do fundo era um endereço escrito à mão. Quem tem a fotografia no ambiente de trabalho
 * tinha de a pôr algures na internet primeiro só para poder colar aqui o link — e ninguém faz
 * isso a meio de escrever um post. Arrastar é o gesto natural, e é este o sítio onde a foto
 * arrastada passa a ter um endereço.
 *
 * POST multipart → sobe um ficheiro e devolve o endereço.
 * POST json      → gera um fundo com IA e devolve o endereço.
 *
 * As duas coisas na mesma rota porque o resultado é o mesmo — um URL para pôr no campo do fundo —
 * e separá-las obrigava o estúdio a saber de dois sítios para resolver uma só necessidade.
 */

/** 12 MB: uma fotografia de telemóvel cabe à vontade e um vídeo arrastado por engano não passa. */
const TAMANHO_MAXIMO = 12 * 1024 * 1024

const TIPOS_ACEITES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

/** Onde fica guardado o retrato de referência do Ricardo. */
const CHAVE_RETRATO = 'estudio_retrato_referencia'

/** A galeria de recortes já feitos — para não se repetir o trabalho a cada cartão. */
const CHAVE_RECORTES = 'estudio_recortes'

/** Guarda um recorte na galeria. Recortar a mesma fotografia outra vez é pagar duas vezes. */
async function guardarNaGaleria(url: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_RECORTES).maybeSingle()
  let galeria: string[] = []
  try {
    const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
    galeria = Array.isArray(v) ? (v as string[]) : []
  } catch {
    galeria = []
  }
  await db.from('site_settings').upsert(
    { key: CHAVE_RECORTES, value: JSON.stringify([url, ...galeria].slice(0, 40)), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const tipo = req.headers.get('content-type') ?? ''

  // ── ficheiro arrastado ────────────────────────────────────────────────────
  if (tipo.includes('multipart/form-data')) {
    const form = await req.formData()
    const ficheiro = form.get('ficheiro')
    if (!(ficheiro instanceof File)) {
      return NextResponse.json({ ok: false, erro: 'sem ficheiro' }, { status: 400 })
    }
    if (ficheiro.size > TAMANHO_MAXIMO) {
      return NextResponse.json(
        { ok: false, erro: `imagem demasiado grande (${Math.round(ficheiro.size / 1024 / 1024)} MB, máximo 12)` },
        { status: 400 },
      )
    }
    if (!TIPOS_ACEITES.has(ficheiro.type)) {
      return NextResponse.json({ ok: false, erro: `tipo não aceite: ${ficheiro.type || 'desconhecido'}` }, { status: 400 })
    }

    const buf = Buffer.from(await ficheiro.arrayBuffer())
    const url = await uploadBufferToBucket(buf, ficheiro.type, 'estudio')

    /**
     * O retrato de referência guarda-se, para não voltar a ser pedido.
     *
     * É a MESMA fotografia que serve de fundo agora e de referência para as imagens geradas
     * depois. Guardá-la aqui evita a pergunta «manda-me outra vez a tua foto» de cada vez que se
     * quer um carrossel com ele.
     */
    if (String(form.get('comoRetrato') ?? '') === '1') {
      await getSupabaseAdmin().from('site_settings').upsert(
        { key: CHAVE_RETRATO, value: JSON.stringify({ url, guardadoEm: new Date().toISOString() }), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    }

    return NextResponse.json({ ok: true, url })
  }

  // ── fundo pedido à IA ─────────────────────────────────────────────────────
  const corpo = await req.json().catch(() => ({}))
  const descricao = String(corpo?.descricao ?? '').trim()
  const formato = corpo?.formato === 'reel' ? 'reel' : 'post'
  const comRicardo = corpo?.comRicardo === true
  /**
   * QUE CAMADA se está a pedir. As duas querem imagens opostas:
   *
   * · `fundo`    — cenário, sem gente, escuro e vazio ao centro para o texto assentar.
   * · `destaque` — uma pessoa inteira, recortada, sem cenário nenhum.
   *
   * Pedir as duas com o mesmo prompt dava um fundo com uma pessoa a tapar a frase, ou um
   * recorte com um quarto agarrado às costas.
   */
  const camada = corpo?.camada === 'destaque' ? 'destaque' : 'fundo'
  // Recortar uma fotografia que já existe, em vez de gerar uma nova.
  const recortarUrl = String(corpo?.recortar ?? '').trim()

  /**
   * RECORTAR uma fotografia que já temos.
   *
   * É o caminho normal para o destaque: a fotografia real dele, sem o fundo. Uma pessoa gerada
   * parece-se com ele mas não é ele, e num cartão que fala na primeira pessoa isso nota-se.
   */
  if (recortarUrl) {
    try {
      const { recortarFotografia } = await import('@/lib/estudio/imagens')
      const png = await recortarFotografia(recortarUrl)
      // PNG e não JPEG: a transparência é o ponto todo, e um JPEG devolve-a como fundo branco.
      const url = await uploadBufferToBucket(png, 'image/png', 'estudio-recorte')
      await guardarNaGaleria(url)
      return NextResponse.json({ ok: true, url, camada: 'destaque' })
    } catch (e) {
      return NextResponse.json(
        { ok: false, erro: e instanceof Error ? e.message : 'o recorte falhou' },
        { status: 502 },
      )
    }
  }

  if (descricao.length < 8) {
    return NextResponse.json({ ok: false, erro: 'descreve em duas palavras que sejam' }, { status: 400 })
  }

  let retrato: string | null = null
  if (comRicardo) {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', CHAVE_RETRATO).maybeSingle()
    try {
      const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
      retrato = (v?.url as string) ?? null
    } catch {
      retrato = null
    }
    if (!retrato) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            'ainda não há retrato de referência. Arrasta uma fotografia tua para o estúdio e marca ' +
            '«guardar como referência» — depois disso, todas as imagens com o Ricardo saem dela.',
        },
        { status: 409 },
      )
    }
  }

  /**
   * O fundo é FUNDO: a tipografia vai por cima.
   *
   * Uma imagem gerada cheia de detalhe no centro deixa a frase ilegível — e a frase é a razão do
   * cartão existir. Pede-se de propósito pouco contraste no meio e espaço negativo, para o texto
   * ter onde assentar.
   */
  try {
    const { gerarImagem } = await import('@/lib/estudio/imagens')
    const { bytes, motor } = await gerarImagem({
      descricao,
      camada,
      formato,
      referencia: comRicardo ? retrato : null,
    })
    const url = await uploadBufferToBucket(
      bytes,
      'image/png',
      camada === 'destaque' ? 'estudio-recorte' : 'estudio-ia',
    )
    // Uma pessoa gerada é logo camada: fica na galeria ao lado dos recortes das fotografias reais.
    if (camada === 'destaque') await guardarNaGaleria(url)
    return NextResponse.json({ ok: true, url, comRicardo, camada, motor })
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : 'a geração falhou' },
      { status: 502 },
    )
  }
}

/** O retrato guardado, para o estúdio saber se já pode oferecer «com o Ricardo». */
export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const db = getSupabaseAdmin()
  const [{ data: r }, { data: g }] = await Promise.all([
    db.from('site_settings').select('value').eq('key', CHAVE_RETRATO).maybeSingle(),
    db.from('site_settings').select('value').eq('key', CHAVE_RECORTES).maybeSingle(),
  ])
  const ler = (v: unknown) => {
    try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return null }
  }
  const retrato = ler(r?.value) as { url?: string } | null
  const recortes = ler(g?.value)

  return NextResponse.json({
    retrato: retrato?.url ?? null,
    recortes: Array.isArray(recortes) ? recortes : [],
    // Basta UMA das chaves. A OpenAI é a que existe hoje; o Higgsfield ganha se aparecer.
    temIA: Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.HIGGSFIELD_API_KEY?.trim()),
  })
}
