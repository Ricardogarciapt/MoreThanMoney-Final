/**
 * A GUARDA DO TELEFONE NO MARKETPLACE.
 *
 *   npx tsx lib/marketplace/telefone.check.ts
 *
 * Isto vive num caminho de DINHEIRO. A regra que importa não é «aceitar bons números» — é **nunca
 * travar uma compra por causa de um número**. Um telefone mal escrito não pode custar uma venda, e
 * é esse o caso que quase ninguém testa porque parece que não acontece.
 *
 * Prova-se contra o `normalizarE164` real, que é o que o código usa. Não há aqui uma segunda
 * limpeza de números: duas acabariam a discordar, e discordariam no caso difícil.
 */
import { normalizarE164 } from '../whatsapp-envio'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

/** A mesma função que `comprador.ts` usa — se um dia divergirem, este ficheiro fica a mentir. */
const util = (v: string | null | undefined) => normalizarE164(v).e164

// ── O que serve ─────────────────────────────────────────────────────────────
{
  teste('nove dígitos portugueses ganham o 351', util('912345678') === '+351912345678')
  teste('com espaços também', util('912 345 678') === '+351912345678')
  teste('com +351 fica igual', util('+351912345678') === '+351912345678')
  teste('com 00351 também', util('00351912345678') === '+351912345678')
  // Uma lista escrita à mão traz isto, e um cliente estrangeiro não se perde por causa de parênteses.
  teste('parênteses e traços caem', util('(+41) 76-633 55 10') === '+41766335510')
}

/**
 * ── O QUE NÃO SERVE NÃO PODE REBENTAR ───────────────────────────────────────
 *
 * Todos estes devolvem `null` — e `null` quer dizer «segue sem telefone», nunca «pára a compra».
 * É a diferença entre perder um contacto e perder uma venda.
 */
{
  for (const mau of ['', '   ', 'não tenho', '123', 'abc', '+', '000000000000000000000', '0912345678']) {
    teste(`«${mau || '(vazio)'}» devolve null em vez de rebentar`, util(mau) === null)
  }
  teste('null não rebenta', util(null) === null)
  teste('undefined não rebenta', util(undefined) === null)
}

// ── O campo é OPCIONAL, e isso tem de ficar provado no código ───────────────
{
  const fonte = require('fs').readFileSync('components/marketplace/ficha-produto.tsx', 'utf8') as string
  teste('o campo diz que é opcional', fonte.includes('Telemóvel (opcional)'))
  teste('e não é `required`', !/type="tel"[\s\S]{0,200}required/.test(fonte))
  /**
   * O MOTIVO TEM DE ESTAR À FRENTE. Um campo de telefone sem explicação num checkout parece
   * recolha para revender, e não se preenche — com razão. Esta linha é metade do valor da
   * alteração; sem ela fica um campo vazio que ninguém usa e que deixa a compra mais pesada.
   */
  teste('o motivo está escrito ao lado', fonte.includes('só para te avisarmos'))

  const rota = require('fs').readFileSync('app/api/marketplace/checkout/route.ts', 'utf8') as string
  // Se alguém um dia puser o telefone a decidir se a compra segue, isto cai.
  teste('o checkout não recusa por causa do telefone', !/telefone[\s\S]{0,120}status:\s*4\d\d/.test(rota))

  const comprador = require('fs').readFileSync('lib/marketplace/comprador.ts', 'utf8') as string
  teste('o comprador usa o normalizador da casa', comprador.includes("from '@/lib/whatsapp-envio'"))
  // Nunca se sobrepõe um número já confirmado por um escrito à pressa num checkout.
  teste('não substitui um telefone que já existia', comprador.includes('temPhone ? {} : { phone: tel }'))
}

if (falhas.length) {
  console.error(`marketplace/telefone: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('marketplace/telefone: opcional, com motivo à frente, e nunca trava uma compra ✓')
