/**
 * A OFERTA — o que este teste trava.
 *
 *  1. NENHUM PREÇO ESCRITO À MÃO. Os números vivem em `lib/escada-precos.ts` e mais lado nenhum.
 *     Cinco guiões já divergiram por causa disto (o desenhador de funis ainda anunciava «300 $»
 *     meses depois de o mínimo ter passado a 350). O teste procura euros e dólares no ficheiro.
 *  2. NÃO SE LIDERA COM O GRÁTIS, E NÃO SE VENDE A QUEM JÁ TEM. Quem já tem acesso pela corretora
 *     não ouve falar de mensalidade; quem já paga ouve falar do degrau de cima; quem está à porta
 *     ouve falar do Membro.
 *  3. O BOT NÃO FALA PRIMEIRO. A quem nunca lhe escreveu não há mensagem para mandar — há um
 *     impedimento escrito, para ele saber que a abordagem tem de ser dele.
 *
 *   npx tsx lib/__tests__/telegram-admin-oferta.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIN_DEPOSIT, NOME_DEGRAU_TOPO, PRECO_MEMBRO, PRECO_PREMIUM, PRECO_TOPO } from '../escada-precos'
import { ofertaMostravel, ofertaParaPessoa, tecladoOferta, textoOferta, type EstadoDaPessoa } from '../telegram-admin-oferta'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const base: EstadoDaPessoa = {
  pagante: false,
  plano: null,
  acessoCorretora: false,
  uidConfirmado: false,
  temConta: false,
  falouEmPrivado: true,
  cupaoEmitido: null,
}

// ── 1. cada degrau na sua vez ──────────────────────────────────────────────
{
  sim('ninguém conhecido → Membro', ofertaParaPessoa(base).degrau === 'membro')
  sim('com conta e sem pagar → Premium', ofertaParaPessoa({ ...base, temConta: true }).degrau === 'premium')
  sim('já paga → o degrau de cima', ofertaParaPessoa({ ...base, pagante: true, temConta: true }).degrau === 'topo')
  sim('UID confirmado → fechar pela corretora', ofertaParaPessoa({ ...base, uidConfirmado: true }).degrau === 'corretora')

  // A que mais importa: a quem já tem tudo não se vende nada.
  const tem = ofertaParaPessoa({ ...base, acessoCorretora: true })
  sim('acesso libertado → nada a oferecer', tem.degrau === 'nada')
  sim('e não há mensagem para mandar', tem.mensagem === null)
  sim('e diz-se porquê', /já tem/i.test(String(tem.impedimento)))
}

// ── 2. os preços vêm da escada, e só de lá ────────────────────────────────
{
  const membro = ofertaParaPessoa(base)
  sim('o Membro traz o preço da escada', String(membro.mensagem).includes(PRECO_MEMBRO))
  sim('o Premium traz o preço da escada', String(ofertaParaPessoa({ ...base, temConta: true }).mensagem).includes(PRECO_PREMIUM))
  const topo = ofertaParaPessoa({ ...base, pagante: true })
  sim('o topo traz o preço da escada', String(topo.mensagem).includes(PRECO_TOPO))
  sim('e o nome do pacote', topo.titulo.includes(NOME_DEGRAU_TOPO))
  sim('a corretora traz o mínimo da escada', String(ofertaParaPessoa({ ...base, uidConfirmado: true }).mensagem).includes(String(MIN_DEPOSIT)))

  /*
   * A prova de que não há números escritos à mão: procura-se no FICHEIRO por um valor em euros ou
   * um «350$» literal. Os únicos números que aqui podem aparecer são os que vêm por import.
   */
  const fonte = readFileSync(join(__dirname, '..', 'telegram-admin-oferta.ts'), 'utf8')
  const linhasDeCodigo = fonte
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
    .join('\n')
  const precosAMao = linhasDeCodigo.match(/\d+[.,]?\d*\s*(€|\$|EUR|USD)\b/g) ?? []
  sim(`nenhum preço escrito à mão (${precosAMao.join(', ')})`, precosAMao.length === 0)
}

// ── 3. o bot não fala primeiro ─────────────────────────────────────────────
{
  const mudo = ofertaMostravel({ ...base, falouEmPrivado: false })
  sim('nunca escreveu ao bot → sem mensagem', mudo.mensagem === null)
  sim('e diz que a abordagem tem de ser dele', /tem de ser tua/.test(String(mudo.impedimento)))

  const teclado = tecladoOferta('123', mudo, [{ text: '⬅️', callback_data: 'admin:menu' }])
  sim('e não há botão de mandar', !teclado.inline_keyboard.flat().some((b) => b.callback_data?.startsWith('admin:of?')))
}

// ── 4. mandar é sempre dois toques ────────────────────────────────────────
{
  const o = ofertaMostravel(base)
  const teclado = tecladoOferta('123', o, [{ text: '⬅️', callback_data: 'admin:menu' }])
  const mandar = teclado.inline_keyboard.flat().find((b) => b.text.includes('Mandar'))
  sim('há botão de mandar', !!mandar)
  sim('mas só pergunta (?)', mandar?.callback_data === 'admin:of?123')
}

// ── 5. um cupão já emitido diz-se, para não se prometer duas vezes ────────
{
  const t = textoOferta('João', { ...base, cupaoEmitido: 'MTM-BROKER-123' }, ofertaMostravel({ ...base, cupaoEmitido: 'MTM-BROKER-123' }))
  sim('o cupão emitido aparece', t.includes('MTM-BROKER-123'))
  sim('e avisa para não emitir outro', /não emitas outro/i.test(t))
}

if (falhas.length) {
  console.error(`telegram-admin-oferta: ${ok} ok, ${falhas.length} falharam`)
  for (const f of falhas) console.error('  ✗', f)
  process.exit(1)
}
console.log(`telegram-admin-oferta: ${ok} ok, 0 falharam`)
