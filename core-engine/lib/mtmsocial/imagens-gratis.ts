/**
 * IMAGENS PARA OS MEMBROS — sempre por vias gratuitas, nunca pelas chaves da MTM.
 *
 * O estúdio do admin gera com a chave da OpenAI da casa. Aqui não pode: cada membro que carregue
 * em «gerar» estaria a gastar dinheiro nosso, e basta uma dúzia de pessoas entusiasmadas com o
 * botão para a conta do mês não fazer sentido nenhum. Foi o Ricardo que o disse, e é a decisão
 * certa por si só.
 *
 * Por isso esta camada é deliberadamente OUTRA, e não um parâmetro da outra: se fosse a mesma
 * função com uma bandeira, mais cedo ou mais tarde alguém esquecia a bandeira e o custo passava
 * para nós sem ninguém dar por isso. Duas portas, e a dos membros não conhece a chave.
 *
 * ── o que se usa ─────────────────────────────────────────────────────────────
 *
 * A Pollinations serve modelos de difusão sem chave e sem conta. É gratuita e não pede nada em
 * troca — e paga-se noutra moeda: pode estar lenta, pode falhar, e não há a quem reclamar. O
 * código trata isso como normal, porque é.
 */

export type CamadaSocial = 'fundo' | 'destaque' | 'capa'

export interface PedidoGratis {
  descricao: string
  camada: CamadaSocial
  /** A proporção do cartão. Só muda o tamanho pedido. */
  formato?: 'post' | 'reel'
  /** Para a mesma descrição não dar sempre a mesma imagem. */
  semente?: number
}

// A base MUDOU a 29/09/2026: `image.pollinations.ai/prompt/` passou a `gen.pollinations.ai/image/`.
// A antiga é que devolvia 402 a tudo — não era só a conta que faltava, era o endereço.
//
// O modelo `flux` continua a ser um alias válido: o catálogo passou a `publisher/model`
// (`black-forest-labs/flux.1-schnell`) mas mantém os aliases antigos nos pedidos.
const BASE = 'https://gen.pollinations.ai/image/'

/**
 * O que se pede muda com a camada — exactamente como no estúdio do admin.
 *
 * O fundo é FUNDO: a tipografia vai por cima, e uma imagem cheia de detalhe ao centro deixa a
 * frase ilegível. O destaque é uma pessoa sozinha, para poder ser recortada.
 *
 * A CAPA é o caso que faltava, e a falta dele deu uma imagem preta. O marketplace pedia capas com
 * `camada: 'fundo'`, e o prompt do fundo manda «the centre of the frame stays dark and
 * uncluttered» — depois o marketplace acrescentava «escuro, dourado e preto» por cima. Duas
 * instruções de escuro empilhadas, e o gerador fez exactamente o que lhe pediram: um rectângulo
 * quase preto. Não era a API nem a chave; era o pedido.
 *
 * Uma capa não é um pano de fundo: é o que aparece num cartão de 300px e tem de se perceber ao
 * relance. Tem assunto ao centro, contraste, e é escura porque a marca é escura — não porque o
 * centro tenha de estar vazio.
 */
function prompt(p: PedidoGratis): string {
  if (p.camada === 'capa') {
    return (
      `${p.descricao}, striking product cover artwork, the subject is clearly visible and centred, ` +
      `rich contrast with a luminous focal point against a deep charcoal background, warm gold accents, ` +
      `cinematic lighting, reads clearly as a small thumbnail, no text, no letters, no numbers, no watermark`
    )
  }
  if (p.camada === 'destaque') {
    return (
      `${p.descricao}, full body portrait of a person, isolated on a plain flat white background, ` +
      `sharp clean edges, even studio lighting, whole body visible with margin around it, ` +
      `no scenery, no props, no text, no watermark`
    )
  }
  return (
    `${p.descricao}, dark cinematic photograph, deep shadows, soft warm rim light, ` +
    `the centre of the frame stays dark and uncluttered with plenty of empty space, ` +
    `no people, no text, no letters, no logos, no watermark`
  )
}

export interface ResultadoGratis {
  bytes: Buffer
  contentType: string
}

/**
 * Gera a imagem. Lança com uma mensagem que se possa mostrar a quem carregou no botão.
 *
 * Sem chave nenhuma: o endereço É o pedido. Isso também quer dizer que não há como saber se o
 * serviço está em baixo antes de tentar — daí o tempo limite generoso e a mensagem em linguagem
 * de gente quando ele acaba.
 */
export async function gerarImagemGratis(p: PedidoGratis): Promise<ResultadoGratis> {
  const largura = 1024
  const altura = p.formato === 'reel' ? 1536 : 1280
  const semente = p.semente ?? Math.floor(Math.random() * 1_000_000)

  const url =
    BASE +
    encodeURIComponent(prompt(p)) +
    `?width=${largura}&height=${altura}&seed=${semente}&nologo=true&model=flux`

  // Dois minutos: o serviço é gratuito e põe os pedidos numa fila. Um tecto curto recusava
  // imagens que estavam apenas à espera da vez.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)
  try {
    // O token é OBRIGATÓRIO desde 29/09/2026: «all generation requests require an API key»
    // (gen.pollinations.ai/docs). Continua a ser a via gratuita — o nível sem custo é o «Quest
    // Pollen», que vem com a conta. O que não se faz aqui é cair para a chave PAGA da casa.
    //
    // Sem token nem se tenta: um pedido que se sabe que vai dar 401 só serve para gastar dois
    // minutos de espera e devolver um erro que não diz o que fazer.
    const token = process.env.POLLINATIONS_TOKEN?.trim()
    if (!token) {
      throw new Error(
        'falta o POLLINATIONS_TOKEN — a geração de imagens passou a exigir uma conta (continua sem custo: enter.pollinations.ai/keys)',
      )
    }
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      // 402 MEDIDO A 29/09/2026, e é o que interessa contar aqui: a Pollinations deixou de servir
      // pedidos ANÓNIMOS. Responde 402 com o corpo `{}` a qualquer modelo (default, flux, turbo),
      // com ou sem referrer. O acesso passou a precisar de uma conta e de um token.
      //
      // A mensagem diz isto por extenso em vez de «respondeu 402» porque as duas levam a acções
      // opostas: um número leva alguém a clicar outra vez durante meia hora, e a frase leva à
      // decisão que é preciso tomar — registar um token do lado gratuito, ou escolher outra via.
      // A via PAGA da casa não é a saída óbvia daqui: ver o cabeçalho deste ficheiro.
      throw new Error(
        r.status === 429
          ? 'o gerador gratuito está com muita gente agora — tenta daqui a um minuto'
          : r.status === 401
            ? 'o POLLINATIONS_TOKEN foi recusado (401) — confirma que é a chave certa em enter.pollinations.ai/keys'
            : r.status === 402
              ? 'a conta da Pollinations ficou sem saldo (402) — o nível gratuito («Quest Pollen») esgotou-se'
            : `o gerador gratuito respondeu ${r.status}`,
      )
    }
    const tipo = r.headers.get('content-type') ?? 'image/jpeg'
    if (!tipo.startsWith('image/')) throw new Error('o gerador não devolveu uma imagem')

    const bytes = Buffer.from(new Uint8Array(await r.arrayBuffer()))
    // Uma resposta minúscula é uma página de erro disfarçada de imagem.
    if (bytes.length < 2048) throw new Error('a imagem veio vazia — tenta outra vez')

    return { bytes, contentType: tipo }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('o gerador gratuito demorou demasiado — tenta outra vez')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/**
 * RECORTAR uma fotografia, também de graça.
 *
 * Não há aqui uma alternativa gratuita à altura do que a OpenAI faz — e não vale a pena fingir
 * que há. Quem quiser um recorte limpo carrega um PNG que já tenha fundo transparente, que é o
 * que sai de qualquer ferramenta de telemóvel hoje em dia.
 *
 * Esta função existe para o dizer com clareza em vez de o botão falhar sem explicação.
 */
export function porqueNaoHaRecorteGratis(): string {
  return (
    'O recorte automático não está disponível nesta app. Usa uma foto que já tenha fundo ' +
    'transparente (PNG) — o teu telemóvel faz isso em dois toques na Galeria.'
  )
}
