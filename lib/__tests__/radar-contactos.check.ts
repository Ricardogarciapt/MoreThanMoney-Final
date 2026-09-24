/**
 * RADAR DE CONTACTOS — o que este teste trava.
 *
 * A tentação, daqui a um mês, vai ser sempre a mesma: «já que temos a lista, porque não mandamos
 * mensagem a toda a gente?». A resposta está em duas paredes que não se contornam com código —
 * um bot não pode escrever a quem nunca lhe escreveu, e o MTProto corre na conta pessoal do dono.
 * Por isso este teste trata `comoAbordar` como parte do contrato: nenhuma abordagem sugerida pode
 * ser «o bot envia».
 *
 * Trava também a diferença entre «não há ninguém» e «o bot está cego», que é onde se perdem
 * semanas a olhar para uma lista vazia.
 *
 *   npx tsx lib/__tests__/radar-contactos.check.ts
 */
import assert from 'node:assert/strict'
import {
  comoAbordar,
  diagnosticoDeCobertura,
  listaPrioritaria,
  pontuarContacto,
  type ContactoVisto,
} from '../prospecao/radar-contactos'

const AGORA = Date.parse('2026-09-24T12:00:00Z')
const hDias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

const base = (m: Partial<ContactoVisto>): ContactoVisto => ({
  tgUserId: '1',
  username: null,
  firstName: null,
  grupos: ['-1004352255256'],
  mensagens: 0,
  entradas: 1,
  saidas: 0,
  primeiroVistoIso: hDias(1),
  ultimoVistoIso: hDias(1),
  estado: 'novo',
  ...m,
})

// ── 1. Falar vale mais do que estar ──
// Quem escreveu uma pergunta expôs-se: tem uma dúvida com nome e um fio onde a resposta cabe.
// Quem só está no grupo pode nem o ter aberto.
{
  const calado = pontuarContacto(base({}), AGORA)
  const falou = pontuarContacto(base({ mensagens: 3 }), AGORA)
  assert.ok(falou.pontos > calado.pontos)
  assert.match(falou.porque, /escreveu/i)
}

// ── 2. Quem saiu não é lixo — é o único sítio onde se aprende o que afasta as pessoas ──
{
  const saiu = pontuarContacto(base({ saidas: 1 }), AGORA)
  const ficou = pontuarContacto(base({}), AGORA)
  assert.ok(saiu.pontos > ficou.pontos, 'quem sai tem um motivo, e o motivo vale mais do que o silêncio')
  assert.match(saiu.porque, /objeção|saiu/i)
}

// ── 3. O tempo manda: quem apareceu hoje continua uma conversa, quem apareceu há dois meses começa do nada ──
{
  const hoje = pontuarContacto(base({ mensagens: 2, ultimoVistoIso: hDias(1) }), AGORA)
  const velho = pontuarContacto(base({ mensagens: 2, ultimoVistoIso: hDias(90) }), AGORA)
  assert.ok(hoje.pontos > velho.pontos)
  assert.match(velho.porque, /já não se lembra/i)
}

// ── 4. Quem já está no funil sai da prospeção ──
// Senão a lista de "gente nova para abordar" enche-se de gente que já está a ser seguida, e
// deixa de ser lida — que é o mesmo que não existir.
{
  const dentro = pontuarContacto(base({ mensagens: 5, estado: 'no_funil' }), AGORA)
  assert.equal(dentro.pontos, 0)
  const lista = listaPrioritaria([base({ mensagens: 5, estado: 'no_funil' })], { agoraMs: AGORA })
  assert.equal(lista.length, 0)
}

// ── 5. NENHUMA abordagem sugerida pode ser o bot a enviar ──
// Este é o teste que interessa. Se cair, alguém escreveu uma sugestão que a API do Telegram
// recusa — ou que a aceita e faz banir a conta.
{
  const cenarios: ContactoVisto[] = [
    base({ mensagens: 4 }),
    base({ saidas: 1 }),
    base({ grupos: ['-1', '-2', '-3'] }),
    base({}),
  ]
  for (const c of cenarios) {
    const texto = comoAbordar(c)
    assert.ok(texto.length > 20, 'a abordagem tem de ser concreta')
    assert.doesNotMatch(
      texto.toLowerCase(),
      /o bot (manda|envia|escreve-lhe)|mensagem autom|enviar a todos|dm em massa/,
      `abordagem proibida sugerida: "${texto}"`,
    )
  }
  // E quem nunca falou tem de ouvir explicitamente que o bot não lhe pode escrever primeiro.
  assert.match(comoAbordar(base({})), /não lhe pode escrever primeiro/i)
}

// ── 6. A lista vem ordenada, cortada no mínimo, e cada linha diz porquê ──
{
  const lista = listaPrioritaria(
    [
      base({ tgUserId: 'a', mensagens: 6, grupos: ['-1', '-2'] }),
      base({ tgUserId: 'b' }),
      base({ tgUserId: 'c', saidas: 1, mensagens: 1 }),
      base({ tgUserId: 'd', ultimoVistoIso: hDias(200) }),
    ],
    { agoraMs: AGORA, minimo: 20 },
  )
  assert.ok(lista.length >= 2)
  for (let i = 1; i < lista.length; i++) assert.ok(lista[i - 1].pontuacao >= lista[i].pontuacao)
  for (const l of lista) {
    assert.ok(l.porque.length > 3, 'uma linha sem motivo é um número mágico')
    assert.ok(l.comoAbordar.length > 3)
  }
  assert.equal(lista[0].tgUserId, 'a')
  assert.ok(!lista.some((l) => l.tgUserId === 'd'), 'o que desapareceu há 200 dias fica abaixo do mínimo')
}

// ── 7. Lista vazia: dizer PORQUÊ, senão confunde-se "não há ninguém" com "o bot está cego" ──
{
  assert.equal(diagnosticoDeCobertura({ contactos: 0, comMensagens: 0, comEntradas: 0, gruposVistos: 0 }).ok, false)

  const cego = diagnosticoDeCobertura({ contactos: 40, comMensagens: 0, comEntradas: 40, gruposVistos: 6 })
  assert.equal(cego.ok, false)
  assert.match(cego.aviso ?? '', /privacy mode/i)
  assert.match(cego.aviso ?? '', /BotFather/i)

  assert.equal(diagnosticoDeCobertura({ contactos: 40, comMensagens: 12, comEntradas: 30, gruposVistos: 6 }).ok, true)
}

console.log('✅ radar-contactos: prioriza quem já nos tocou e nunca sugere que o bot escreva primeiro')
