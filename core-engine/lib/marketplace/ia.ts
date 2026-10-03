/**
 * A IA DO MARKETPLACE — escrever a descrição, e fazer a imagem.
 *
 * ── QUEM PAGA O QUÊ, E PORQUE É QUE ISSO DECIDE O DESENHO ─────────────────────────────────
 *
 * Esta casa já tem duas portas para gerar imagens, e são duas de propósito (está escrito em
 * `lib/mtmsocial/imagens-gratis.ts`): o estúdio do admin gasta a chave da OpenAI da casa, e o que é
 * exposto aos MEMBROS usa a Pollinations, que é gratuita e não tem chave. A razão é que basta uma
 * dúzia de pessoas entusiasmadas com um botão para a conta do mês deixar de fazer sentido.
 *
 * O marketplace cai do lado dos membros: quem carrega em «gerar imagem» é um EDUCADOR, que não é
 * a casa. Por isso a imagem e o flyer saem pela via GRATUITA, e não por um parâmetro da via paga —
 * se fosse uma bandeira na mesma função, mais cedo ou mais tarde alguém a esquecia e o custo
 * passava para cá sem ninguém dar por isso. Foi também o que o dono pediu, à letra: «flyer por IA
 * gratuita».
 *
 * O TEXTO é a excepção, e é uma excepção pensada. A descrição escreve-se com o Claude, que é pago
 * e é da casa. Sai barato (algumas centenas de tokens por descrição, umas décimas de cêntimo) e
 * não há alternativa gratuita que escreva português europeu decente — e uma descrição má é a
 * diferença entre um produto que vende e um que fica na prateleira. Em troca, o portão é estreito:
 * só um educador autenticado ou um admin chega aqui, e só para produtos que são dele.
 *
 * ── A REGRA DOS NÚMEROS ───────────────────────────────────────────────────────────────────
 *
 * O modelo NÃO inventa resultados. Esta casa tem uma regra escrita — a prova mede-se em pips e com
 * ressalva legal — e um texto de venda que promete «+300% em três meses» num produto de trading é
 * um problema de regulador, não um problema de copy. O `system` proíbe-o explicitamente, e o que
 * sai é revisto por um humano antes de publicar (o produto nasce em rascunho e passa por revisão).
 */

import { modeloClaude } from '@/lib/modelo-claude'
import { gerarImagemGratis } from '@/lib/mtmsocial/imagens-gratis'
import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { nomeDaCategoria } from './regras'

// ── O texto ───────────────────────────────────────────────────────────────────────────────

const SISTEMA = `És copywriter da MoreThanMoney (MTM), uma escola e comunidade portuguesa de trading e investimento.

Escreves em PORTUGUÊS EUROPEU (Portugal), não do Brasil. Nunca uses gerúndio brasileiro ("estou fazendo"), "você", nem vocabulário brasileiro.

A tua tarefa: escrever a descrição de venda de um produto do marketplace da MTM.

REGRAS QUE NÃO SE QUEBRAM:
1. NUNCA inventes números de resultados, percentagens de lucro, rentabilidades, número de alunos, testemunhos ou prazos de retorno. Se não te foi dado um número, ele não existe e não aparece no texto.
2. NUNCA prometas ganhos, lucro garantido, "vais ficar rico", "retorno garantido" ou equivalente. É um produto financeiro-educativo e isso é um problema legal, não uma questão de estilo.
3. Não uses emojis. Não uses MAIÚSCULAS para gritar. Não uses linguagem de "guru".
4. Fala do que a pessoa APRENDE ou RECEBE, em concreto. Benefício antes de característica.

FORMATO DA RESPOSTA — exactamente este, sem mais nada:
SUBTITULO: <uma linha, no máximo 90 caracteres, que diz o que é e para quem>
DESCRICAO: <3 a 5 parágrafos curtos separados por uma linha vazia. Entre 600 e 1200 caracteres no total. O último parágrafo diz para quem é e para quem não é.>`

export type PedidoDescricao = {
  titulo: string
  tipo?: string | null
  /** O que o educador já escreveu, mesmo que sejam quatro palavras. */
  rascunho?: string | null
  /** Para o texto poder dizer "mentoria de 8 semanas" sem inventar. */
  notas?: string | null
  precoCents?: number | null
  moeda?: string | null
}

export type DescricaoGerada = { subtitulo: string; descricao: string }

/**
 * Pede ao Claude a descrição.
 *
 * O `fetch` directo com `AbortController` é o padrão da casa (ver
 * `app/api/admin/social/estudio/route.ts`): o SDK só é usado em dois sítios, e um timeout explícito
 * importa mais aqui do que a ergonomia — um educador à espera de um botão que nunca responde
 * fecha a página e acha que o estúdio está avariado.
 */
export async function gerarDescricao(p: PedidoDescricao): Promise<DescricaoGerada> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('A geração por IA não está configurada (ANTHROPIC_API_KEY em falta).')

  const partes = [
    `Título do produto: ${p.titulo}`,
    `Categoria: ${nomeDaCategoria(p.tipo)}`,
    p.precoCents ? `Preço: ${((p.precoCents || 0) / 100).toFixed(2)} ${(p.moeda ?? 'eur').toUpperCase()}` : null,
    p.rascunho?.trim() ? `O que o autor já escreveu (usa como base, melhora, não contradigas):\n${p.rascunho.trim().slice(0, 2000)}` : null,
    p.notas?.trim() ? `Notas do autor (factos que PODES usar):\n${p.notas.trim().slice(0, 1000)}` : null,
  ].filter(Boolean)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45_000)
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modeloClaude(process.env.CONTENT_DRAFT_MODEL),
        max_tokens: 1200,
        system: SISTEMA,
        messages: [{ role: 'user', content: partes.join('\n\n') }],
      }),
      signal: ctrl.signal,
    })
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    const texto = ((j?.content ?? []) as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
      .trim()
    return separar(texto)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parte a resposta nas duas peças.
 *
 * Tolerante de propósito: se o modelo não usar as etiquetas (acontece), o que vier vale como
 * descrição e o subtítulo fica vazio, em vez de a função rebentar e o educador perder o texto todo.
 */
function separar(texto: string): DescricaoGerada {
  const mSub = texto.match(/SUBTITULO:\s*(.+?)(?:\n|$)/i)
  const mDesc = texto.match(/DESCRICAO:\s*([\s\S]+)$/i)
  const subtitulo = (mSub?.[1] ?? '').trim().slice(0, 200)
  const descricao = (mDesc?.[1] ?? (mSub ? '' : texto)).trim().slice(0, 4000)
  return { subtitulo, descricao }
}

// ── A imagem ──────────────────────────────────────────────────────────────────────────────

/**
 * A imagem de capa do produto, pela via gratuita.
 *
 * Devolve um URL público e estável (bucket `uploads`), não os bytes: o URL da Pollinations não é
 * para guardar — é um pedido, não um ficheiro, e um produto cuja capa depende de um serviço
 * gratuito responder outra vez é um produto com uma capa que desaparece.
 */
export async function gerarImagemDoProduto(p: {
  titulo: string
  tipo?: string | null
  descricao?: string | null
  semente?: number
}): Promise<{ url: string }> {
  const pedido = [
    `capa para "${p.titulo}"`,
    nomeDaCategoria(p.tipo).toLowerCase(),
    'finanças, mercados, educação; elegante, com dourado sobre carvão',
    (p.descricao ?? '').trim().slice(0, 200),
  ]
    .filter(Boolean)
    .join(', ')

  const img = await gerarImagemGratis({
    descricao: pedido,
    // 'capa' e não 'fundo': o fundo manda o CENTRO ficar escuro e vazio (é um pano para a
    // tipografia ir por cima), e com o «escuro, dourado e preto» que se pedia aqui em cima davam
    // duas instruções de escuro empilhadas — saía um rectângulo quase preto. Medido a 29/09.
    camada: 'capa',
    formato: 'post',
    semente: p.semente ?? Math.floor(Math.random() * 1e9),
  })

  const url = await uploadBufferToBucket(img.bytes, img.contentType || 'image/png', 'marketplace')
  return { url }
}
