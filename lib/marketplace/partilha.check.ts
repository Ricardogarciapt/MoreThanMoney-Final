/**
 * A GUARDA DO CARTÃO DE PARTILHA.
 *
 *   npx tsx lib/marketplace/partilha.check.ts
 *
 * O caso mau é o que não dá erro nenhum: uma imagem RELATIVA num `og:image`. O link abre bem, o
 * cartão sai sem imagem, e ninguém percebe porquê — era exactamente o estado em que a ficha de
 * produto estava.
 */
import { cartaoDoProduto, imagemAbsoluta, origemDoSite } from './partilha'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }
const SITE = 'https://www.morethanmoney.pt'

// ── O CASO MAU: caminho relativo ────────────────────────────────────────────
{
  const abs = imagemAbsoluta('/marketplace/bootcamp/capa.png', SITE)
  teste('a capa relativa passa a absoluta', abs === 'https://www.morethanmoney.pt/marketplace/bootcamp/capa.png')
  teste('e nunca sai relativa', !String(abs).startsWith('/'))

  // `///capa.png` fica de fora: os browsers não concordam sobre o que significa, e um endereço
  // ambíguo não vai para um cartão que outra gente vai ler.
  teste('«///» ambíguo não entra no cartão', imagemAbsoluta('///capa.png', SITE) === null)
  teste('origem com barra no fim não duplica',
    imagemAbsoluta('/capa.png', 'https://www.morethanmoney.pt/') === 'https://www.morethanmoney.pt/capa.png')
}

// ── O que já é absoluto fica como está ──────────────────────────────────────
{
  const u = 'https://iwscxotvmtkphajmasof.supabase.co/storage/v1/object/public/x.png'
  teste('um endereço absoluto não se mexe', imagemAbsoluta(u, SITE) === u)
}

// ── Sem imagem é melhor do que imagem partida ───────────────────────────────
{
  teste('sem capa, não se inventa nenhuma', imagemAbsoluta(null, SITE) === null)
  teste('vazio não é imagem', imagemAbsoluta('   ', SITE) === null)
  /**
   * `//outro-sitio.com/x.png` é relativo ao PROTOCOLO: aponta para fora. Num cartão de partilha
   * punha a imagem de outro domínio por baixo do nome da MTM.
   */
  teste('«//outro-sitio» não entra no cartão', imagemAbsoluta('//evil.com/x.png', SITE) === null)
}

// ── O cartão ────────────────────────────────────────────────────────────────
{
  const c = cartaoDoProduto({
    slug: 'bootcamp-morethanmoney',
    titulo: 'Bootcamp MoreThanMoney',
    subtitulo: '30 horas · do zero ao método, com certificado',
    imagem_url: '/marketplace/bootcamp/capa.png',
    imagens: ['/marketplace/bootcamp/modulos.webp', '/marketplace/bootcamp/aulas.png'],
  }, SITE)

  teste('o título nomeia a casa', c.titulo === 'Bootcamp MoreThanMoney · MoreThanMoney')
  teste('o endereço é o da ficha', c.url === `${SITE}/marketplace/bootcamp-morethanmoney`)
  teste('todas as imagens são absolutas', c.imagens.every((i) => i.startsWith('https://')))
  /**
   * A CAPA PRIMEIRO. As redes anunciam o link com a PRIMEIRA imagem da lista — ter a grelha de
   * módulos à frente fazia o produto ser apresentado por uma captura de ecrã em vez do cartaz.
   */
  teste('a capa vem à frente das imagens de apoio',
    c.imagens[0] === `${SITE}/marketplace/bootcamp/capa.png` && c.imagens.length === 3)
}

// ── Sem subtítulo, usa a descrição; e corta em palavra inteira ──────────────
{
  const longa = 'Bootcamp MoreThanMoney são 30 horas que te levam de «não sei por onde começar» a saber abrir, gerir e fechar uma posição com um plano por trás, e depois vem muito mais texto que não cabe num cartão de partilha nenhum.'
  const c = cartaoDoProduto({ slug: 'x', titulo: 'X', subtitulo: null, descricao: longa }, SITE)
  teste('a descrição cabe no cartão', c.descricao.length <= 201)
  teste('e não acaba a meio de uma palavra', /[…]$/.test(c.descricao) && !/\s…$/.test(c.descricao))

  const semNada = cartaoDoProduto({ slug: 'x', titulo: 'X' }, SITE)
  teste('sem texto nenhum, há na mesma uma frase', semNada.descricao.length > 10)
  teste('e sem imagens, a lista vem vazia e não com um buraco', semNada.imagens.length === 0)
}

// ── A origem ────────────────────────────────────────────────────────────────
{
  teste('a origem nunca acaba em barra', !origemDoSite().endsWith('/'))
  teste('a origem é absoluta', /^https?:\/\//.test(origemDoSite()))
}

if (falhas.length) {
  console.error(`marketplace/partilha: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('marketplace/partilha: a capa vai primeiro e sempre em endereço absoluto ✓')
