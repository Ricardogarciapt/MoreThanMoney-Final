/**
 * O CARTÃO QUE APARECE QUANDO ALGUÉM PARTILHA UM PRODUTO.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * A ficha de produto (`app/marketplace/[slug]/page.tsx`) nasceu cliente e SEM metadados nenhuns.
 * Resultado: um link colado no WhatsApp, no Telegram ou no Instagram aparecia como texto seco —
 * sem imagem, sem título, sem preço. E a ficha existe em metade para ser partilhada: é o que o
 * próprio cabeçalho dela diz.
 *
 * Nada disto dava erro. O link abria bem; só não vendia nada antes de ser aberto.
 *
 * ═══ O QUE FALHA EM SILÊNCIO AQUI ══════════════════════════════════════════════════════════
 *
 * A capa está gravada como caminho RELATIVO (`/marketplace/bootcamp/capa.png`), porque é assim
 * que o `<img>` da página a quer. Mas um cartão de partilha é lido por um servidor do outro lado
 * do mundo, que não sabe de que site é aquele caminho: uma imagem relativa num `og:image` não dá
 * erro — simplesmente não aparece imagem nenhuma, que é exactamente o defeito que isto vem
 * corrigir. Por isso tudo o que sai daqui é ABSOLUTO.
 */

/** A origem pública do site. Uma só, e com o mesmo valor por omissão do resto da casa. */
export function origemDoSite(): string {
  const bruto = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').trim()
  const url = bruto || 'https://www.morethanmoney.pt'
  return url.replace(/\/+$/, '')
}

/**
 * Transforma a capa num endereço que um servidor de fora consegue ir buscar.
 *
 * Devolve `null` quando não há imagem — e `null` é melhor do que um endereço inventado: o cartão
 * sai sem imagem, mas sem imagem PARTIDA, que é o que acontece quando se aponta para um ficheiro
 * que não existe.
 */
export function imagemAbsoluta(caminho: string | null | undefined, origem = origemDoSite()): string | null {
  const s = String(caminho ?? '').trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  // `//outro-sitio.com` é relativo ao protocolo e aponta para FORA. Num cartão de partilha isso
  // punha a imagem de outro domínio por baixo do nome da MTM. `///x` entra aqui de propósito:
  // os browsers não concordam sobre o que ele significa, e um endereço ambíguo não vai para um
  // cartão que outra gente vai ler.
  if (s.startsWith('//')) return null
  // A origem normaliza-se TAMBÉM quando vem por argumento, e não só quando vem do ambiente. Sem
  // isto, uma origem com barra no fim produzia `https://site//capa.png` — que serve em quase todo
  // o lado e falha nalguns servidores de pré-visualização, que é o pior tipo de defeito: o que só
  // aparece em metade das partilhas.
  const base = String(origem ?? '').trim().replace(/\/+$/, '')
  return `${base}/${s.replace(/^\/+/, '')}`
}

export interface ProdutoParaPartilha {
  slug: string
  titulo: string
  subtitulo?: string | null
  descricao?: string | null
  imagem_url?: string | null
  imagens?: unknown
}

export interface CartaoDePartilha {
  titulo: string
  descricao: string
  url: string
  imagens: string[]
}

/** Corta um texto no espaço mais próximo, para o cartão não acabar a meio de uma palavra. */
function resumir(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const corte = limpo.slice(0, limite)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`
}

/**
 * O cartão de um produto.
 *
 * A CAPA VEM PRIMEIRO, sempre. As redes mostram a primeira imagem da lista, e ter a grelha de
 * módulos à frente da capa fazia o link ser anunciado por uma captura de ecrã em vez do cartaz
 * do curso.
 */
export function cartaoDoProduto(produto: ProdutoParaPartilha, origem = origemDoSite()): CartaoDePartilha {
  const capa = imagemAbsoluta(produto.imagem_url, origem)
  const resto = (Array.isArray(produto.imagens) ? produto.imagens : [])
    .map((i) => imagemAbsoluta(typeof i === 'string' ? i : null, origem))
    .filter((i): i is string => Boolean(i) && i !== capa)

  const texto = String(produto.subtitulo ?? '').trim() || String(produto.descricao ?? '').trim()
  return {
    titulo: `${String(produto.titulo ?? '').trim() || 'Produto'} · MoreThanMoney`,
    // 200 caracteres: é o que as redes mostram antes de cortarem elas. Cortar aqui, numa palavra
    // inteira, lê-se melhor do que o corte a meio que elas fazem.
    descricao: resumir(texto, 200) || 'Um produto da MoreThanMoney.',
    url: `${origem}/marketplace/${String(produto.slug ?? '').trim()}`,
    imagens: capa ? [capa, ...resto] : resto,
  }
}
