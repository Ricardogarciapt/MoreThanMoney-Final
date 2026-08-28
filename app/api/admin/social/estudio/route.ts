import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { factosParaCartao, getPipsProof, publicavel, RESSALVA_LEGAL } from '@/lib/pips-proof'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O estúdio: escrever, reescrever e gerar factos por conversa.
 *
 * A fila só deixava aprovar ou apagar. Pedir uma mudança — "mais curto", "tira o emoji", "põe o
 * ângulo da disciplina" — obrigava a reescrever à mão ou a apagar e esperar pelo cron do dia
 * seguinte. Aqui pede-se, e vem.
 *
 * ── A regra que não se negoceia ───────────────────────────────────────────────────────────────
 * Números só os que vêm dos factos REAIS. O modelo recebe-os na instrução e é proibido de
 * inventar outros — foi assim que a linha "675 trades · 63% · +7.060€" sobreviveu dois meses
 * depois de deixar de ser verdade: ninguém a tinha verificado porque parecia um número do
 * sistema. Quando não há amostra que chegue, escreve-se sem número nenhum.
 */

async function ehAdmin(request: NextRequest): Promise<boolean> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const db = getSupabaseAdmin()
  const { data } = await db.auth.getUser(token)
  if (!data.user) return false
  const { data: p } = await db.from('profiles').select('user_type').eq('id', data.user.id).maybeSingle()
  return p?.user_type === 'admin'
}

async function pedirAoModelo(sistema: string, pedido: string, maxTokens = 1400): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY em falta')
  const model = process.env.CONTENT_DRAFT_MODEL?.trim() || 'claude-sonnet-4-5'

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45_000)
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: sistema,
        messages: [{ role: 'user', content: pedido }],
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    return ((j?.content ?? []) as { type: string; text?: string }[])
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('')
      .trim()
  } finally {
    clearTimeout(timer)
  }
}

/** Os factos reais, prontos a entrar na instrução do modelo. */
async function contextoDeFactos(): Promise<string> {
  const prova = await getPipsProof()
  if (!publicavel(prova)) {
    return (
      'NÃO HÁ NÚMEROS PUBLICÁVEIS. Não uses número nenhum de desempenho — nem trades, nem ' +
      'percentagens, nem pips, nem euros. Escreve sobre o método e o que a comunidade faz.'
    )
  }
  const factos = factosParaCartao(prova)
  return (
    'FACTOS REAIS (os ÚNICOS números que podes usar, tal como estão):\n' +
    factos.map((f) => `- ${f}`).join('\n') +
    `\n\nRessalva legal obrigatória sempre que usares um número: "${RESSALVA_LEGAL}"`
  )
}

const VOZ =
  'Escreves para a MoreThanMoney, comunidade portuguesa de trading. Português de Portugal, ' +
  'tratamento por "tu", direto e sem hype. Nada de promessas de lucro, nada de "ganha X por mês", ' +
  'nada de urgência falsa. Frases curtas. Emojis com conta — no máximo dois por post.'

export async function POST(request: NextRequest) {
  if (!(await ehAdmin(request))) {
    return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  }

  const corpo = (await request.json().catch(() => ({}))) as {
    acao?: 'criar' | 'alterar' | 'factos' | 'testemunho'
    pedido?: string
    /** Na alteração: o texto atual, para o modelo mudar o que foi pedido e mais nada. */
    atual?: string
    /** Conteúdo próprio que o Ricardo quer aproveitar (um texto, uma ideia, um print). */
    material?: string
  }

  const pedido = String(corpo.pedido ?? '').trim()
  const factos = await contextoDeFactos()

  try {
    // ── Escrever de raiz ────────────────────────────────────────────────────────────────────
    if (corpo.acao === 'criar') {
      if (!pedido && !corpo.material) {
        return NextResponse.json({ error: 'Diz o que queres publicar' }, { status: 400 })
      }
      const texto = await pedirAoModelo(
        `${VOZ}\n\n${factos}\n\n` +
          'Devolve EXACTAMENTE neste formato, sem mais nada:\n' +
          'GANCHO: <uma linha, no máximo 90 caracteres>\n' +
          'CTA: <uma palavra em maiúsculas para o comentário, ex.: APP, SINAIS, PREMIUM>\n' +
          'LEGENDA:\n<a legenda completa, várias linhas>',
        (corpo.material ? `Material do Ricardo para aproveitar:\n"""${corpo.material}"""\n\n` : '') +
          `Pedido: ${pedido || 'transforma o material acima num post'}`,
      )
      return NextResponse.json({ ok: true, ...separarPost(texto) })
    }

    // ── Mudar o que já existe ───────────────────────────────────────────────────────────────
    if (corpo.acao === 'alterar') {
      if (!corpo.atual) return NextResponse.json({ error: 'Falta o texto atual' }, { status: 400 })
      const texto = await pedirAoModelo(
        `${VOZ}\n\n${factos}\n\n` +
          'Recebes um post e um pedido de alteração. Muda SÓ o que foi pedido — o resto fica ' +
          'como está. Devolve apenas a legenda final, sem preâmbulo nem aspas.',
        `Post atual:\n"""${corpo.atual}"""\n\nAlteração pedida: ${pedido}`,
      )
      return NextResponse.json({ ok: true, caption: texto })
    }

    // ── Factos à medida ─────────────────────────────────────────────────────────────────────
    if (corpo.acao === 'factos') {
      const prova = await getPipsProof()
      const base = factosParaCartao(prova)
      if (!base.length) {
        return NextResponse.json({
          ok: true,
          factos: [],
          nota:
            'Sem amostra que chegue para publicar números. Publicar meia dúzia de trades como ' +
            'prova é ruído com ar de prova — e quem verifica não volta a confiar.',
        })
      }
      // O modelo REESCREVE os factos, não os inventa: recebe-os prontos e só muda a forma.
      const texto = await pedirAoModelo(
        `${VOZ}\n\nRecebes factos VERDADEIROS já apurados. A tua tarefa é dar-lhes forma para um ` +
          'cartão: cada linha com 90 caracteres no máximo. NÃO alteres nenhum número, NÃO ' +
          'acrescentes nenhum, NÃO inventes contexto. Uma linha por facto, sem numeração.',
        `Factos:\n${base.map((f) => `- ${f}`).join('\n')}\n\n` +
          `Feitio pedido: ${pedido || 'diretos, para caber num cartão'}`,
      )
      const linhas = texto.split('\n').map((l) => l.replace(/^[-•\d.\s]+/, '').trim()).filter(Boolean)
      return NextResponse.json({ ok: true, factos: linhas.slice(0, 8), originais: base })
    }

    // ── Testemunhos: nunca inventados ───────────────────────────────────────────────────────
    if (corpo.acao === 'testemunho') {
      // Os testemunhos vivem no código (`lib/testimonials-service`), que é a lista curada — não
      // numa tabela onde qualquer coisa entra.
      const { getTestimonials } = await import('@/lib/testimonials-service')
      const data = getTestimonials()

      if (!data.length) {
        return NextResponse.json({
          ok: true,
          testemunhos: [],
          nota:
            'Não há testemunhos guardados. Um testemunho é a palavra de uma pessoa — não se ' +
            'gera, recolhe-se. Inventar um é falsificar uma prova, e é o tipo de coisa que ' +
            'destrói a confiança de uma vez.',
        })
      }

      // O modelo só ESCOLHE e formata os que existem.
      const texto = await pedirAoModelo(
        `${VOZ}\n\nRecebes testemunhos REAIS de clientes. Escolhe os que melhor servem o pedido e ` +
          'formata-os para publicação, MANTENDO as palavras de quem os escreveu — podes cortar, ' +
          'nunca reescrever nem melhorar. Uma linha por testemunho, no formato: "texto" — Nome.',
        `Testemunhos:\n${data.map((t) => `"${t.content}" — ${t.name}`).join('\n')}\n\n` +
          `Pedido: ${pedido || 'os mais fortes para um cartão'}`,
      )
      return NextResponse.json({
        ok: true,
        testemunhos: texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8),
      })
    }

    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Falhou' },
      { status: 500 },
    )
  }
}

function separarPost(texto: string): { hook: string; cta: string; caption: string } {
  const hook = (texto.match(/GANCHO:\s*([^\n]+)/i)?.[1] ?? '').trim()
  const cta = (texto.match(/CTA:\s*([^\n]+)/i)?.[1] ?? '').trim().toUpperCase()
  const caption = (texto.split(/LEGENDA:\s*/i)[1] ?? texto).trim()
  return { hook: hook.slice(0, 120), cta: cta.slice(0, 16), caption }
}
