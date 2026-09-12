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

  if (descricao.length < 8) {
    return NextResponse.json({ ok: false, erro: 'descreve o fundo em duas palavras que sejam' }, { status: 400 })
  }

  const chave = process.env.HIGGSFIELD_API_KEY?.trim()
  if (!chave) {
    return NextResponse.json(
      { ok: false, erro: 'HIGGSFIELD_API_KEY em falta — sem ela não há geração de imagem' },
      { status: 503 },
    )
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
  const prompt =
    `${descricao}. Dark cinematic photograph, deep shadows, muted gold rim light. ` +
    (comRicardo
      ? 'Featuring the man from the reference photograph, same face and build, natural and candid. '
      : 'No people, no faces. ') +
    'Composition leaves the central third dark, low-contrast and uncluttered so large typography ' +
    'can be laid over it. No text, no letters, no logos, no watermark.'

  const r = await fetch('https://platform.higgsfield.ai/v1/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: 'gpt_image_2',
      prompt,
      aspect_ratio: formato === 'reel' ? '9:16' : '4:5',
      ...(retrato ? { reference_images: [retrato] } : {}),
    }),
    signal: AbortSignal.timeout(110_000),
  }).catch(() => null)

  if (!r || !r.ok) {
    return NextResponse.json(
      { ok: false, erro: `a geração falhou${r ? ` (HTTP ${r.status})` : ''}` },
      { status: 502 },
    )
  }

  const j = (await r.json()) as Record<string, unknown>
  const gerada =
    (j.url as string) ?? (j.result_url as string) ??
    ((j.images as Array<{ url?: string }>) ?? [])[0]?.url ?? null
  if (!gerada) return NextResponse.json({ ok: false, erro: 'a geração não devolveu imagem' }, { status: 502 })

  /**
   * A imagem gerada é copiada para a NOSSA gaveta.
   *
   * O endereço que o gerador devolve expira. Um cartão guardado hoje com um fundo que amanhã já
   * não carrega é um cartão perdido — e só se dá por isso quando alguém o abre.
   */
  const bin = await fetch(gerada).then((x) => x.arrayBuffer())
  const url = await uploadBufferToBucket(Buffer.from(bin), 'image/png', 'estudio-ia')

  return NextResponse.json({ ok: true, url, comRicardo })
}

/** O retrato guardado, para o estúdio saber se já pode oferecer «com o Ricardo». */
export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const { data } = await getSupabaseAdmin()
    .from('site_settings').select('value').eq('key', CHAVE_RETRATO).maybeSingle()
  try {
    const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
    return NextResponse.json({ retrato: (v?.url as string) ?? null, temIA: Boolean(process.env.HIGGSFIELD_API_KEY?.trim()) })
  } catch {
    return NextResponse.json({ retrato: null, temIA: Boolean(process.env.HIGGSFIELD_API_KEY?.trim()) })
  }
}
