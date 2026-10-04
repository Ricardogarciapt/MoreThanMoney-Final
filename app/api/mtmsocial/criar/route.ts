import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { renderCarrossel, renderElemento, socialCardElement, type Lamina } from '@/lib/social-card'
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * CRIAR a peça — cartão, carrossel ou capa de reel, com a marca do membro.
 *
 * O mesmo motor do estúdio do admin, com uma diferença que é toda a diferença: a assinatura, a
 * cor e o logótipo vêm da marca de quem está a criar. Sem isso, a peça de um membro saía
 * assinada com a conta da casa — pôr a marca da MTM em conteúdo que não é da MTM.
 *
 * A escrita dos textos e da legenda vai pela porta única da IA (`chamarIA`: Groq → Gemini →
 * Ollama → OpenAI → Anthropic) — grátis primeiro, desde 04/10, quando a Anthropic ficou sem
 * crédito e isto deixou de escrever. A IMAGEM continua a não usar IA paga, porque essa custa a
 * sério — ver `lib/mtmsocial/imagens-gratis`.
 */

interface Marca {
  nome: string
  arroba: string | null
  cor: string
  logo: string
  logo_url: string | null
}

const LOGOS_DA_CASA: Record<string, string> = {
  mtm: '/logo-mtm-transparent.png',
  mtm_auto: '/images/mtm/logo-mtm-auto.png',
  mtm_funded: '/mtmfunded/logo-mtm-funded-v2.png',
}

/**
 * O logótipo tem de ser um endereço ABSOLUTO.
 *
 * O Satori desenha fora do browser e não sabe o que é `/logo.png` — sem domínio à frente, a
 * imagem não aparece e não há erro nenhum a dizer porquê.
 */
function logoAbsoluto(marca: Marca | null): string | null {
  if (!marca) return null
  const rel = marca.logo === 'proprio' ? marca.logo_url : (LOGOS_DA_CASA[marca.logo] ?? null)
  if (!rel) return null
  if (rel.startsWith('http')) return rel
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/+$/, '')
  return `${base}${rel.startsWith('/') ? '' : '/'}${rel}`
}

/** Escreve as lâminas e a legenda. Falha com a mensagem honesta da cadeia em vez de inventar. */
async function escrever(
  tema: string,
  cta: string,
  quantas: number,
  marca: string,
): Promise<{ hook: string; laminas: string[]; caption: string } | { erro: string }> {
  try {
    const r = await chamarIA({
      tarefa: 'mtmsocial',
      maxTokens: 1800,
      json: true,
      preferencia: 'qualidade',
      sistema:
        `Escreves carrosséis de Instagram para a marca «${marca}».\n\n` +
        'Devolves APENAS JSON: {"hook":"...","laminas":["..."],"caption":"..."}\n\n' +
        '· HOOK — a capa, no máximo 7 palavras, sem ponto final. Tem de caber em duas metades ' +
        'de peso parecido: é assim que é desenhada, em duas faixas de cor.\n' +
        '· LAMINAS — as do meio. Uma ideia por lâmina, 12 a 25 palavras.\n' +
        '· CAPTION — a legenda, até 6 linhas, a acabar a pedir o comentário.\n\n' +
        'Português de Portugal, tratamento por tu. NUNCA prometas lucro nem inventes números, ' +
        'percentagens ou datas. Sem emojis, sem hashtags, sem aspas dentro do texto.',
      mensagens: [{ role: 'user', content: `Tema: ${tema}\nPalavra do CTA: ${cta}\nLâminas do meio: ${quantas}` }],
    })
    const o = JSON.parse(r.texto) as { hook?: string; laminas?: string[]; caption?: string }
    if (!o.hook || !Array.isArray(o.laminas)) return { erro: `a IA (${r.fornecedor}) respondeu sem hook ou sem lâminas` }
    return { hook: o.hook, laminas: o.laminas.map(String), caption: String(o.caption ?? '') }
  } catch (e) {
    return { erro: mensagemIndisponivel(e) }
  }
}

export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const corpo = await request.json().catch(() => ({}))
  const tipo = ['cartao', 'carrossel', 'capa_reel'].includes(String(corpo?.tipo))
    ? String(corpo.tipo) as 'cartao' | 'carrossel' | 'capa_reel'
    : 'cartao'

  // ── a marca de quem assina ────────────────────────────────────────────────
  const { data: marca } = corpo?.marcaId
    ? await db.from('mtm_social_marcas')
        .select('nome, arroba, cor, logo, logo_url')
        .eq('id', String(corpo.marcaId)).eq('user_id', userId).maybeSingle()
    : await db.from('mtm_social_marcas')
        .select('nome, arroba, cor, logo, logo_url')
        .eq('user_id', userId).eq('ativa', true).maybeSingle()

  if (!marca) {
    return NextResponse.json(
      { erro: 'Ainda não tens marca nenhuma. Cria uma com o teu nome e o teu @ antes de começar.' },
      { status: 400 },
    )
  }

  const m = marca as Marca
  const daMarca = {
    nome: m.nome,
    arroba: m.arroba,
    cor: m.cor,
    logoUrl: logoAbsoluto(m),
  }

  const cta = String(corpo?.cta ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 16)
  const formato = tipo === 'capa_reel' ? 'reel' : 'post'

  // ── os textos ─────────────────────────────────────────────────────────────
  let hook = String(corpo?.hook ?? '').trim()
  let textos: string[] = Array.isArray(corpo?.textos) ? corpo.textos.map(String).filter(Boolean) : []
  let caption = String(corpo?.caption ?? '').trim()

  // Com textos já escritos (a reaplicar posições, por exemplo), não se volta a escrever nada:
  // seria pagar outra chamada e, pior, mudar o texto debaixo de quem só queria mover o texto.
  if (corpo?.comIA === true && !textos.length && !hook) {
    const escrito = await escrever(String(corpo?.tema ?? hook), cta, Math.max(3, Number(corpo?.laminas) || 4), m.nome)
    if ('erro' in escrito) {
      return NextResponse.json({ erro: `não consegui escrever os textos — ${escrito.erro}` }, { status: 502 })
    }
    hook = escrito.hook
    caption = escrito.caption
    textos = [escrito.hook, ...escrito.laminas, `${escrito.hook.split(/\s+/)[0]} — comenta ${cta || 'JÁ'}`]
  }

  if (!hook && !textos.length) {
    return NextResponse.json({ erro: 'sem texto nenhum para pôr no cartão' }, { status: 400 })
  }

  /**
   * As posições arrastadas, se o editor as mandou.
   *
   * Vêm em fracções de 0 a 1 e viajam até ao desenho sem conversão nenhuma. Sem elas, o cartão
   * usa as posições da casa — as que o fazem parecer feito sem ninguém lhe tocar.
   */
  const posicoes = corpo?.posicoes && typeof corpo.posicoes === 'object' ? corpo.posicoes : undefined

  const camadas = {
    fundo: String(corpo?.fundo ?? '').trim() || undefined,
    destaque: String(corpo?.destaque ?? '').trim() || undefined,
    destaquePos: (corpo?.destaquePos ?? 'direita') as 'esquerda' | 'centro' | 'direita',
    destaqueEscala: Number(corpo?.destaqueEscala) || 0.92,
  }

  // ── desenhar ──────────────────────────────────────────────────────────────
  const urls: string[] = []

  if (tipo === 'carrossel' && textos.length >= 3) {
    const laminas: Lamina[] = textos.map((texto, i) => ({
      papel: i === 0 ? 'capa' : i === textos.length - 1 ? 'fim' : 'meio',
      texto,
      ...(i === textos.length - 1 && cta ? { cta } : {}),
      // As imagens só na capa: repeti-las em todas rouba a legibilidade ao texto.
      ...(i === 0 ? { ...camadas, posicoes } : {}),
    }))
    // A marca viaja em cada lâmina através do `handle`, que o motor usa para escolher o estilo.
    const pngs = await renderCarrossel(
      laminas.map((l) => ({ ...l, marca: daMarca })),
      m.arroba ?? m.nome,
    )
    for (const png of pngs) urls.push(await uploadBufferToBucket(png, 'image/png', `social/${userId.slice(0, 8)}`))
  } else {
    const png = await renderElemento(
      socialCardElement({
        hook: hook || textos[0],
        cta,
        handle: m.arroba ?? m.nome,
        proof: false,
        formato,
        marca: daMarca,
        posicoes,
        ...camadas,
      }),
      1080,
      formato === 'reel' ? 1920 : 1350,
    )
    urls.push(await uploadBufferToBucket(png, 'image/png', `social/${userId.slice(0, 8)}`))
  }

  // ── guardar, para se poder reabrir ────────────────────────────────────────
  //
  // Uma peça que só existe enquanto o separador está aberto perde-se com um refrescar — e o
  // trabalho todo com ela.
  const conteudo = { hook, textos, cta, ...camadas, posicoes: posicoes ?? null }
  const pecaId = String(corpo?.pecaId ?? '').trim()

  /**
   * Mexer numa peça ACTUALIZA-A; não cria outra.
   *
   * Arrastar o texto três vezes deixava três peças quase iguais na galeria, e a certa altura
   * ninguém sabia qual era a boa. Quem edita quer a mesma peça melhor, não uma cópia.
   */
  if (pecaId) {
    const { data } = await db.from('mtm_social_pecas')
      .update({ titulo: (hook || textos[0] || '').slice(0, 80), conteudo, urls, caption, updated_at: new Date().toISOString() })
      .eq('id', pecaId).eq('user_id', userId).select('id').maybeSingle()
    if (data) return NextResponse.json({ ok: true, id: data.id, urls, textos, hook, caption })
    // A peça desapareceu entretanto: cria-se, em vez de perder o trabalho.
  }

  const { data: peca } = await db.from('mtm_social_pecas').insert({
    user_id: userId,
    marca_id: corpo?.marcaId ?? null,
    tipo,
    titulo: (hook || textos[0] || '').slice(0, 80),
    conteudo,
    urls,
    caption,
  }).select('id').single()

  return NextResponse.json({ ok: true, id: peca?.id ?? null, urls, textos, hook, caption })
}
