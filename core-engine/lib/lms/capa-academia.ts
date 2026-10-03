/**
 * A CAPA DE UMA ACADEMIA — as decisões que, mal tomadas, erram em silêncio.
 *
 * Trocar a capa de uma academia é um gesto de dois tempos: primeiro sobe-se um ficheiro, depois
 * grava-se o URL dele. Entre os dois tempos há três maneiras de isto correr mal sem ninguém ver,
 * e as três moram aqui em vez de espalhadas pelo formulário e pela rota:
 *
 *  · O UPLOAD FALHA E A ACADEMIA FICA COM A CAPA ANTIGA. É a pior: o admin escolheu uma imagem
 *    nova, carregou em gravar, viu um «guardado» e a capa é a de ontem. `decidirCapa` recusa-se a
 *    gravar quando o upload falhou — não há cair para trás no valor antigo sem dizer nada.
 *  · O URL GRAVADO APONTA PARA NADA. Um campo de texto aceita tudo: espaços, a string literal
 *    "undefined" que vem de um `${x}` mal feito, um `javascript:`. Nada disso dá erro na base —
 *    dá uma academia sem capa que jura ter uma. `validarCapa` fecha isso, e `caminhoNoStorage`
 *    dá à rota o caminho para ir CONFIRMAR que o objecto existe mesmo no bucket.
 *  · A CAPA NÃO É 16:9 E DEFORMA A SECÇÃO. Uma imagem quadrada num espaço 16:9 sai esticada ou
 *    cortada ao meio, e ninguém recebe aviso porque tecnicamente está tudo bem. `avaliarRacio`
 *    mede e devolve o aviso — AVISO, não bloqueio: a decisão de publicar torta é do dono.
 */

/** O rácio da capa. A secção da academia é 16:9 e não é negociável. */
export const RACIO_CAPA = 16 / 9

/**
 * Quanto se tolera de desvio ao 16:9, em fracção do rácio.
 *
 * 4% deixa passar o que vem de um recorte à mão (1920x1081, 1280x725) e chumba o que de facto
 * deforma (quadrados, verticais, 4:3). Zero tolerância punia imagens boas por um pixel.
 */
export const TOLERANCIA_RACIO = 0.04

/** Valores de texto que NÃO são um URL, mas chegam ao campo como se fossem. */
const LIXO = new Set(['undefined', 'null', 'nan', 'false', '0', '[object object]'])

/**
 * Limpa o que vem do campo e devolve `null` quando não há capa.
 *
 * O `null` é de propósito e é o que vai para a base: a coluna é anulável, e gravar string vazia
 * daria uma academia com capa `""` — que passa qualquer `if (capa)` em sítios diferentes de
 * maneiras diferentes.
 */
export function normalizarCapa(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  if (!limpo) return null
  if (LIXO.has(limpo.toLowerCase())) return null
  return limpo
}

export type ResultadoCapa = { ok: true; url: string | null } | { ok: false; motivo: string }

/**
 * Isto é um URL de imagem que se pode pôr num `<img src>`?
 *
 * Aceita `https://`, `http://` e caminhos da própria casa (`/algo`). Recusa tudo o mais —
 * `javascript:` e `data:` em primeiro lugar, que num `src` vindo do painel são um buraco, e
 * qualquer coisa que não dê sequer para ler como URL.
 *
 * Não promete que o ficheiro existe: isso ninguém prova sem ir ver, e é o que a rota faz com o
 * `caminhoNoStorage`. Promete apenas que não se grava lixo.
 */
export function validarCapa(valor: unknown): ResultadoCapa {
  const url = normalizarCapa(valor)
  if (url === null) return { ok: true, url: null }

  if (url.startsWith('/')) {
    // Caminho da própria casa. `//host` não conta: é protocol-relative e sai daqui para fora.
    if (url.startsWith('//')) return { ok: false, motivo: 'Caminho inválido. Usa https:// ou /caminho.' }
    return { ok: true, url }
  }

  let protocolo: string
  try {
    protocolo = new URL(url).protocol
  } catch {
    return { ok: false, motivo: 'Não parece um endereço de imagem. Usa https://… ou carrega um ficheiro.' }
  }

  if (protocolo !== 'https:' && protocolo !== 'http:') {
    return { ok: false, motivo: `Protocolo não aceite (${protocolo}). Só https:// ou http://.` }
  }

  return { ok: true, url }
}

/**
 * Extrai o bucket e o caminho de um URL público do Supabase Storage.
 *
 * Serve para a rota poder CONFIRMAR que o objecto existe antes de gravar o URL. Sem isto, apagar
 * um ficheiro no storage deixa a academia a apontar para um 404 — e um 404 numa imagem não dá
 * erro em sítio nenhum: dá um rectângulo vazio.
 *
 * Devolve `null` para URLs que não são do nosso storage (uma imagem externa, um caminho local):
 * aí não há nada a confirmar, e não se recusa por isso.
 */
export function caminhoNoStorage(valor: unknown): { bucket: string; path: string } | null {
  const url = normalizarCapa(valor)
  if (!url) return null

  // Formato público do Supabase: /storage/v1/object/public/<bucket>/<caminho…>
  const marca = '/storage/v1/object/public/'
  const i = url.indexOf(marca)
  if (i === -1) return null

  const resto = url.slice(i + marca.length).split('?')[0].split('#')[0]
  const barra = resto.indexOf('/')
  if (barra <= 0) return null

  const bucket = resto.slice(0, barra)
  const path = decodeURIComponent(resto.slice(barra + 1))
  if (!bucket || !path) return null

  return { bucket, path }
}

export interface AvaliacaoRacio {
  racio: number
  /** Está dentro da tolerância do 16:9? */
  aceitavel: boolean
  /** O que dizer ao admin. `null` quando está bem — não se avisa quem acertou. */
  aviso: string | null
}

/**
 * Mede o rácio de uma imagem contra o 16:9.
 *
 * AVISA, não bloqueia. Bloquear obrigava a passar pelo Photoshop para trocar uma capa às pressas;
 * não avisar deixava publicar uma capa esticada sem ninguém perceber até um cliente ver. O aviso
 * diz o rácio que a imagem tem, para o admin saber o que recortar.
 */
export function avaliarRacio(largura: unknown, altura: unknown): AvaliacaoRacio {
  const l = Number(largura)
  const a = Number(altura)

  // Sem medidas não se inventa um veredicto: dimensões a zero ou ilegíveis dariam rácio NaN ou
  // Infinity, e um `aceitavel: false` aqui punia o que não se conseguiu medir.
  if (!Number.isFinite(l) || !Number.isFinite(a) || l <= 0 || a <= 0) {
    return { racio: 0, aceitavel: true, aviso: null }
  }

  const racio = l / a
  const desvio = Math.abs(racio - RACIO_CAPA) / RACIO_CAPA
  if (desvio <= TOLERANCIA_RACIO) return { racio, aceitavel: true, aviso: null }

  const alvo = Math.round((l / RACIO_CAPA) * 10) / 10
  return {
    racio,
    aceitavel: false,
    aviso:
      `Esta imagem é ${l}×${a} (${racio.toFixed(2)}:1) e a capa é 16:9 — vai sair cortada ou esticada. ` +
      `Para ${l} de largura, a altura certa é ${alvo}.`,
  }
}

export interface DecisaoCapa {
  /** Gravar na base? */
  gravar: boolean
  /** O que gravar, quando se grava. `null` significa «tirar a capa», e é um gesto legítimo. */
  valor: string | null
  /** Porque não se grava. `null` quando não há nada de errado — só nada a fazer. */
  motivo: string | null
}

/**
 * A decisão de gravar, ou não, uma capa nova.
 *
 * O caso que esta função existe para impedir: o upload falhou, o formulário ainda tem o URL
 * antigo em mão, e grava-se o antigo por cima do antigo com uma mensagem de sucesso. O admin sai
 * convencido de que trocou a capa. Aqui, upload falhado é SEMPRE recusa com motivo — nunca um
 * silencioso «fica como estava».
 */
export function decidirCapa(entrada: {
  capaAtual?: unknown
  capaEscolhida?: unknown
  /** O upload do ficheiro rebentou? Quem chama sabe; esta função só não deixa isso passar calado. */
  uploadFalhou?: boolean
}): DecisaoCapa {
  const atual = normalizarCapa(entrada.capaAtual)

  if (entrada.uploadFalhou) {
    return {
      gravar: false,
      valor: atual,
      motivo: 'O upload da imagem falhou — a capa NÃO foi trocada. Tenta carregar outra vez.',
    }
  }

  const validada = validarCapa(entrada.capaEscolhida)
  if (!validada.ok) return { gravar: false, valor: atual, motivo: validada.motivo }

  // Igual ao que já lá está: não é erro, é só não haver trabalho. Sem motivo, para não aparecer
  // um alarme vermelho a quem não fez nada de mal.
  if (validada.url === atual) return { gravar: false, valor: atual, motivo: null }

  return { gravar: true, valor: validada.url, motivo: null }
}
