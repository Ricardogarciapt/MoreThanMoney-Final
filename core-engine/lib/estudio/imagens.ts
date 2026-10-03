/**
 * GERAR E RECORTAR IMAGENS — com o que já temos.
 *
 * Não há chave do Higgsfield em lado nenhum, e ficar à espera dela deixava metade do estúdio
 * por usar. O `OPENAI_API_KEY` está na Vercel há meses e o `gpt-image-1` faz as duas coisas de
 * que este estúdio precisa:
 *
 * · gera o CENÁRIO, escuro e vazio ao centro, para a frase assentar;
 * · gera a PESSOA já com `background: transparent` — um PNG com alfa, pronto a ser camada.
 *
 * Esse segundo ponto poupa uma viagem inteira: noutros serviços seria gerar e depois mandar
 * recortar, duas chamadas e duas esperas. Aqui o recorte não é um passo, é uma opção do pedido.
 *
 * A chave do Higgsfield continua a ser aceite e ganha quando existir — não por ser melhor, mas
 * porque foi o que o Ricardo pediu de início e um dia pode aparecer. Sem ela, nada disto fica
 * à espera.
 */

export type Camada = 'fundo' | 'destaque'

export interface PedidoImagem {
  descricao: string
  camada: Camada
  formato: 'post' | 'reel'
  /** Fotografia de referência, para a pessoa gerada se parecer com ele. */
  referencia?: string | null
}

/**
 * O tamanho que o `gpt-image-1` aceita, mais perto do que queremos.
 *
 * Ele só dá 1024×1024, 1024×1536 e 1536×1024. O cartão é 4:5 ou 9:16 — os dois são verticais,
 * por isso o retrato serve nos dois casos e o enquadramento final é do próprio cartão, que
 * estica a imagem ao quadro. Pedir quadrado dava uma cena que só enche metade do reel.
 */
const TAMANHO = '1024x1536'

/** O que se pede ao modelo. As duas camadas querem imagens opostas — ver o comentário do topo. */
export function promptDaCamada(p: PedidoImagem): string {
  if (p.camada === 'destaque') {
    return (
      `${p.descricao}. Full-body photograph of a person, sharp clean edges, even lighting, ` +
      'the entire body visible with margin around it, cut out with nothing behind. ' +
      'No scenery, no props, no shadow on the ground, no text, no watermark.'
    )
  }
  return (
    `${p.descricao}. Dark cinematic photograph, deep shadows, muted warm rim light. ` +
    'No people, no faces. The central third stays dark, low-contrast and uncluttered so that ' +
    'large typography can be laid over it. No text, no letters, no logos, no watermark.'
  )
}

export interface ImagemGerada {
  /** Os bytes, já no formato certo. PNG sempre — o destaque precisa de alfa. */
  bytes: Buffer
  motor: 'openai' | 'higgsfield'
}

/**
 * Gera a imagem. Devolve os BYTES e não um endereço, de propósito.
 *
 * Os endereços que estes serviços devolvem expiram em minutos. Um cartão guardado hoje com um
 * fundo que amanhã já não carrega é um cartão perdido — e só se dá por isso quando alguém o
 * abre, meses depois. Quem chama guarda-os na nossa gaveta antes de os usar.
 */
export async function gerarImagem(p: PedidoImagem): Promise<ImagemGerada> {
  const prompt = promptDaCamada(p)

  const higgs = process.env.HIGGSFIELD_API_KEY?.trim()
  if (higgs) {
    const r = await fetch('https://platform.higgsfield.ai/v1/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${higgs}` },
      body: JSON.stringify({
        model: 'gpt_image_2',
        prompt,
        aspect_ratio: p.formato === 'reel' ? '9:16' : '4:5',
        ...(p.referencia ? { reference_images: [p.referencia] } : {}),
      }),
      signal: AbortSignal.timeout(110_000),
    }).catch(() => null)

    if (r?.ok) {
      const j = (await r.json()) as Record<string, unknown>
      const url =
        (j.url as string) ?? (j.result_url as string) ?? ((j.images as Array<{ url?: string }>) ?? [])[0]?.url
      if (url) {
        const bin = await fetch(url).then((x) => x.arrayBuffer())
        return { bytes: Buffer.from(new Uint8Array(bin)), motor: 'higgsfield' }
      }
    }
    // Falhando, cai para a OpenAI em vez de devolver erro: o estúdio continua a servir.
  }

  const chave = process.env.OPENAI_API_KEY?.trim()
  if (!chave) throw new Error('sem OPENAI_API_KEY nem HIGGSFIELD_API_KEY — não há como gerar imagens')

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: TAMANHO,
      quality: 'high',
      // O alfa é o que torna a pessoa utilizável como camada. Num fundo seria desperdício —
      // um PNG transparente de um cenário é o mesmo cenário a pesar o dobro.
      ...(p.camada === 'destaque'
        ? { background: 'transparent', output_format: 'png' }
        : { output_format: 'png' }),
    }),
    signal: AbortSignal.timeout(170_000),
  })

  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const primeira = j.data?.[0]
  if (primeira?.b64_json) return { bytes: Buffer.from(primeira.b64_json, 'base64'), motor: 'openai' }
  if (primeira?.url) {
    const bin = await fetch(primeira.url).then((x) => x.arrayBuffer())
    return { bytes: Buffer.from(new Uint8Array(bin)), motor: 'openai' }
  }
  throw new Error('a geração não devolveu imagem')
}

/**
 * RECORTA uma fotografia que já existe — a real dele, sem o cenário.
 *
 * É o caminho preferido para o destaque: uma pessoa gerada parece-se com ele mas não é ele, e
 * num cartão que fala na primeira pessoa isso nota-se.
 *
 * Usa `images/edits` com `background: transparent`. Não é uma matting a sério — não guarda o
 * cabelo fio a fio — mas para uma silhueta que vai ficar meio tapada por tipografia gigante
 * chega, e é o que há hoje sem acrescentar um serviço novo.
 */
export async function recortarFotografia(url: string): Promise<Buffer> {
  const chave = process.env.OPENAI_API_KEY?.trim()
  if (!chave) throw new Error('sem OPENAI_API_KEY — não há como recortar')

  const origem = await fetch(url)
  if (!origem.ok) throw new Error(`a fotografia não se deixou ler (HTTP ${origem.status})`)
  const bytes = Buffer.from(new Uint8Array(await origem.arrayBuffer()))

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'origem.png')
  form.append(
    'prompt',
    'Keep only the person, exactly as they are — same face, same clothes, same pose. ' +
      'Remove everything else. Transparent background, clean edges, no shadow, no scenery.',
  )
  form.append('background', 'transparent')
  form.append('output_format', 'png')
  form.append('size', TAMANHO)

  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
    signal: AbortSignal.timeout(170_000),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`)

  const j = (await r.json()) as { data?: Array<{ b64_json?: string; url?: string }> }
  const primeira = j.data?.[0]
  if (primeira?.b64_json) return Buffer.from(primeira.b64_json, 'base64')
  if (primeira?.url) {
    const bin = await fetch(primeira.url).then((x) => x.arrayBuffer())
    return Buffer.from(new Uint8Array(bin))
  }
  throw new Error('o recorte não devolveu imagem')
}
