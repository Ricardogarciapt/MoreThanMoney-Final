import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { modeloClaude } from '@/lib/modelo-claude'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O ASSISTENTE DE UM CLIQUE: de um tema a um carrossel pronto a sair.
 *
 * Fazia-se tudo à mão e por ordem certa — escrever o gancho, escolher a palavra do CTA, pedir o
 * fundo, esperar, gerar as lâminas, escrever a legenda. Seis esperas e seis decisões, e a
 * primeira decisão condiciona as outras cinco. É trabalho que a máquina faz melhor do que uma
 * pessoa a meio da tarde.
 *
 * Aqui dá-se um TEMA — ou nem isso — e sai tudo montado. O que continua a ser humano é a
 * decisão final: nada disto se publica sozinho.
 *
 * ── porque é que é tudo numa chamada ─────────────────────────────────────────
 *
 * Cada passo precisa do anterior: o gancho decide as lâminas, as lâminas decidem a legenda, o
 * tema decide o fundo. Partido em seis chamadas, o estúdio tinha de guardar estado entre elas e
 * qualquer falha a meio deixava metade feita sem forma de continuar. Numa só, ou sai inteiro ou
 * não sai — e o que falha diz-se.
 *
 * A imagem é a parte lenta (perto de um minuto) e é a ÚLTIMA a ser pedida, de propósito: se ela
 * falhar, o carrossel sai na mesma com a tipografia sozinha, que é um resultado utilizável.
 * Pedir primeiro a imagem era arriscar não ter nada por causa da parte mais frágil.
 */

interface Plano {
  hook: string
  cta: string
  laminas: string[]
  caption: string
  cenario: string
}

const SISTEMA = `És o director de conteúdo da More Than Money. Escreves carrosséis de Instagram
que param o dedo e acabam a pedir um comentário.

Devolves APENAS JSON, sem markdown à volta:
{"hook":"...","cta":"...","laminas":["...","..."],"caption":"...","cenario":"..."}

· HOOK — a capa. No máximo 7 palavras, sem ponto final. Tem de caber em duas metades de peso
  parecido, porque é assim que é desenhada: duas faixas de cor. Uma frase de uma palavra não
  funciona.
· CTA — UMA destas, a que encaixar no tema: SINAIS, APP, PREMIUM, DESAFIO, QUERO, MUDANCA, COPY.
· LAMINAS — as do MEIO, sem capa nem fecho. Uma ideia por lâmina, 12 a 25 palavras. Duas ideias
  juntas fazem a pessoa deslizar sem ler.
· CAPTION — a legenda da publicação. Até 6 linhas, acaba a pedir o comentário com a palavra do
  CTA em maiúsculas.
· CENARIO — uma frase em INGLÊS a descrever a fotografia de fundo da capa. Um lugar ou uma
  atmosfera, sem pessoas. É para um gerador de imagem.

REGRAS DURAS:
· Português de Portugal, tratamento por tu, primeira pessoa.
· NUNCA prometas lucro, retorno ou resultado. NUNCA inventes números, percentagens ou datas.
· Sem emojis, sem hashtags, sem aspas dentro do texto.`

async function planear(tema: string, quantas: number): Promise<Plano> {
  const chave = process.env.ANTHROPIC_API_KEY?.trim()
  if (!chave) throw new Error('ANTHROPIC_API_KEY em falta')

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: modeloClaude(process.env.CONTENT_DRAFT_MODEL),
      max_tokens: 2000,
      system: SISTEMA,
      messages: [
        {
          role: 'user',
          content: tema
            ? `Tema: ${tema}\nLâminas do meio: ${quantas}`
            : `Escolhe tu o tema, dentro do que a More Than Money ensina: mentalidade, ` +
              `disciplina, gestão de risco, os erros comuns de quem começa.\nLâminas do meio: ${quantas}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)

  const j = await r.json()
  const bruto = ((j?.content ?? []) as Array<{ type: string; text?: string }>)
    .filter((x) => x.type === 'text')
    .map((x) => x.text ?? '')
    .join('')
    .trim()
  // O modelo às vezes embrulha o JSON em ```json apesar de lhe dizerem que não.
  const limpo = bruto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  const p = JSON.parse(limpo) as Partial<Plano>
  if (!p.hook || !Array.isArray(p.laminas) || p.laminas.length < 2) {
    throw new Error('o plano veio incompleto')
  }
  return {
    hook: String(p.hook),
    cta: String(p.cta ?? 'QUERO').toUpperCase().replace(/[^A-Z]/g, ''),
    laminas: p.laminas.map(String),
    caption: String(p.caption ?? ''),
    cenario: String(p.cenario ?? 'a dark quiet office at dawn, screens glowing faintly'),
  }
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado

  const corpo = await req.json().catch(() => ({}))
  const tema = String(corpo?.tema ?? '').trim()
  const handle = String(corpo?.handle ?? 'ricardogarciapt').replace(/^@/, '')
  const formato = corpo?.formato === 'reel' ? 'reel' : 'post'
  const comImagem = corpo?.comImagem !== false
  const comRicardo = corpo?.comRicardo === true
  const quantas = Math.max(4, Math.min(Number(corpo?.laminas) || 4, 8))

  const passos: string[] = []

  try {
    // ── 1. o plano ──────────────────────────────────────────────────────────
    const plano = await planear(tema, quantas)
    passos.push(`plano escrito · ${plano.laminas.length + 2} lâminas`)

    // ── 2. as camadas ───────────────────────────────────────────────────────
    let fundo: string | undefined
    let destaque: string | undefined

    if (comImagem) {
      try {
        const { gerarImagem } = await import('@/lib/estudio/imagens')
        const { bytes } = await gerarImagem({ descricao: plano.cenario, camada: 'fundo', formato })
        fundo = await uploadBufferToBucket(bytes, 'image/png', 'estudio-ia')
        passos.push('fundo gerado')
      } catch (e) {
        // A imagem é a parte frágil e a menos essencial: o carrossel sai com a tipografia
        // sozinha, que é o estilo da casa e funciona. Dizer que falhou chega.
        passos.push(`fundo falhou (${e instanceof Error ? e.message.slice(0, 60) : 'erro'}) — segue sem ele`)
      }
    }

    if (comRicardo) {
      /**
       * O destaque vem da GALERIA, não de uma geração nova.
       *
       * São recortes das fotografias reais dele. Uma pessoa gerada parece-se com ele mas não é
       * ele, e num carrossel que fala na primeira pessoa isso nota-se — ainda por cima com os
       * recortes verdadeiros já ali à mão.
       */
      const { data } = await getSupabaseAdmin()
        .from('site_settings').select('value').eq('key', 'estudio_recortes').maybeSingle()
      try {
        const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
        const galeria = Array.isArray(v) ? (v as string[]) : []
        if (galeria.length) {
          destaque = galeria[Math.floor(Math.random() * galeria.length)]
          passos.push('destaque escolhido da galeria')
        } else {
          passos.push('sem recortes na galeria — segue sem destaque')
        }
      } catch {
        passos.push('não consegui ler a galeria — segue sem destaque')
      }
    }

    // ── 3. montar ───────────────────────────────────────────────────────────
    const textos = [plano.hook, ...plano.laminas, `${plano.hook.split(/\s+/)[0]} — comenta ${plano.cta}`]

    const { renderCarrossel } = await import('@/lib/social-card')
    const laminas = textos.map((texto, i) => ({
      papel: (i === 0 ? 'capa' : i === textos.length - 1 ? 'fim' : 'meio') as 'capa' | 'meio' | 'fim',
      texto,
      ...(i === textos.length - 1 ? { cta: plano.cta } : {}),
      // As imagens só na capa: repeti-las em todas rouba a legibilidade ao texto, que é o que
      // se vem cá ler.
      ...(i === 0 && fundo ? { fundo } : {}),
      ...(i === 0 && destaque ? { destaque, destaquePos: 'direita' as const, destaqueEscala: 0.9 } : {}),
    }))

    const pngs = await renderCarrossel(laminas, handle)
    const urls: string[] = []
    for (const png of pngs) urls.push(await uploadBufferToBucket(png, 'image/png', 'estudio'))
    passos.push(`${urls.length} imagens montadas`)

    return NextResponse.json({
      ok: true,
      urls,
      textos,
      hook: plano.hook,
      cta: plano.cta,
      caption: plano.caption,
      cenario: plano.cenario,
      fundo: fundo ?? null,
      destaque: destaque ?? null,
      passos,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : 'o assistente falhou', passos },
      { status: 500 },
    )
  }
}
