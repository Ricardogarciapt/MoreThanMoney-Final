/**
 * MAPA DOS GRUPOS — o que este teste trava.
 *
 * Duas coisas, e as duas custam caro quando falham em silêncio:
 *
 *   1. O grupo NOSSO onde o bot não está tem de ficar no topo da lista. É o caso que paga tudo:
 *      audiência que já é nossa, sem boas-vindas, sem radar, sem um lead a sair de lá. Se a
 *      ordenação mudar e esses grupos caírem para o meio, deixam de ser vistos — e ninguém dá por
 *      isso, porque a lista continua a parecer cheia.
 *
 *   2. As conversas privadas não podem entrar no mapa, em circunstância nenhuma. É a única porta
 *      por onde entraria informação pessoal de quem nunca nos falou.
 *
 *   npx tsx lib/__tests__/dialogos.check.ts
 */
import assert from 'node:assert/strict'
import {
  classificarDialogos,
  normalizarDialogos,
  resumoDoMapa,
  type Dialogo,
  type PresencaDoBot,
} from '../prospecao/dialogos'

const AGORA = Date.parse('2026-09-24T12:00:00Z')
const hDias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString()

function d(m: Partial<Dialogo>): Dialogo {
  return { chatId: '-100', titulo: 'grupo', tipo: 'supergroup', souAdmin: false, membros: 100, ...m }
}

// ── 1. O formato real do serviço: id · titulo · tipo · sou_admin · membros ──
// São estes cinco campos e mais nenhum. Se o serviço deixar de mandar `sou_admin`, todos os
// grupos passam a "terceiros" e o mapa mente — por isso lê-se explicitamente.
{
  const lidos = normalizarDialogos({
    dialogos: [
      { id: -1002424441843, titulo: 'MoreThanMoney Premium Signals', tipo: 'supergroup', sou_admin: true, membros: 420 },
      { id: -100777, titulo: 'Trading PT', tipo: 'supergroup', sou_admin: false, membros: null },
    ],
  })
  assert.equal(lidos.length, 2)
  assert.equal(lidos[0].chatId, '-1002424441843', 'o id tem de vir como string — não é número, é chave')
  assert.equal(lidos[0].souAdmin, true)
  assert.equal(lidos[0].membros, 420)
  assert.equal(lidos[1].membros, null, 'membros em falta é null, nunca zero')

  // Uma resposta nua (array) ou vazia não pode rebentar nada.
  assert.equal(normalizarDialogos([]).length, 0)
  assert.equal(normalizarDialogos(null).length, 0)
  assert.equal(normalizarDialogos({ erro: 'x' }).length, 0)
  assert.equal(normalizarDialogos([{ titulo: 'sem id' }]).length, 0, 'sem id não é um diálogo')
}

// ── 2. As conversas privadas NUNCA entram no mapa ──
{
  const mapa = classificarDialogos(
    [
      d({ chatId: '111', tipo: 'user', titulo: 'Alguém' }),
      d({ chatId: '222', tipo: 'private', titulo: 'Outro alguém' }),
      d({ chatId: '333', tipo: 'bot', titulo: 'Um bot' }),
      d({ chatId: '-1', tipo: 'supergroup', souAdmin: true }),
    ],
    [],
    AGORA,
  )
  assert.equal(mapa.length, 1)
  assert.equal(mapa[0].chatId, '-1')
}

// ── 3. "Nosso" decide-se por sou_admin, não pelo título ──
// Há grupos nossos sem a sigla no nome (GOLD DID, GOLDEN MOVES) e grupos de terceiros que falam
// de nós. Ser administrador é um facto; um título é uma opinião.
{
  const mapa = classificarDialogos(
    [
      d({ chatId: '-1', titulo: 'GOLD DID 💸🏆', souAdmin: true }),
      d({ chatId: '-2', titulo: 'Fãs do MTM System', souAdmin: false }),
    ],
    [],
    AGORA,
  )
  assert.equal(mapa.find((g) => g.chatId === '-1')?.papel, 'nosso')
  assert.equal(mapa.find((g) => g.chatId === '-2')?.papel, 'terceiros')
}

// ── 4. O grupo NOSSO sem o bot vai para o topo — é o caso que paga a lista toda ──
{
  const presenca: PresencaDoBot[] = [
    { chatId: '-activo', ultimaMensagemIso: hDias(1) },
    { chatId: '-parado', ultimaMensagemIso: hDias(40) },
  ]
  const mapa = classificarDialogos(
    [
      d({ chatId: '-activo', souAdmin: true, membros: 300 }),
      d({ chatId: '-parado', souAdmin: true, membros: 300 }),
      d({ chatId: '-sembot', souAdmin: true, membros: 300 }),
      d({ chatId: '-terceiros', souAdmin: false, membros: 3000 }),
    ],
    presenca,
    AGORA,
  )
  assert.equal(mapa[0].chatId, '-sembot', 'o grupo nosso sem bot tem de ser o primeiro')
  assert.equal(mapa[0].botPresente, false)
  assert.match(mapa[0].oQueFazer, /startgroup|põe o bot/i)
  assert.equal(mapa[1].chatId, '-parado', 'a seguir, o nosso que está a esfriar')
  assert.equal(mapa[mapa.length - 1].chatId, '-terceiros')

  // E entre dois grupos nossos sem bot, ganha o que tem mais gente.
  const porTamanho = classificarDialogos(
    [d({ chatId: '-pequeno', souAdmin: true, membros: 5 }), d({ chatId: '-grande', souAdmin: true, membros: 800 })],
    [],
    AGORA,
  )
  assert.equal(porTamanho[0].chatId, '-grande')
}

// ── 5. Nenhuma acção sugerida pode ser extrair membros ou mandar mensagem a estranhos ──
// O serviço nem sequer devolve participantes; se alguma sugestão aqui o pedir, é um convite a
// construir por fora aquilo que faz banir a conta pessoal do dono.
{
  const mapa = classificarDialogos(
    [
      d({ chatId: '-a', souAdmin: true }),
      d({ chatId: '-b', souAdmin: false, membros: 9000 }),
      d({ chatId: '-c', souAdmin: false, membros: 500 }),
      d({ chatId: '-d', souAdmin: false, membros: 12 }),
    ],
    [{ chatId: '-a', ultimaMensagemIso: hDias(1) }],
    AGORA,
  )
  for (const g of mapa) {
    assert.doesNotMatch(
      g.oQueFazer.toLowerCase(),
      /extrair membros(?! nem)|exportar membros|mandar dm|mensagem a todos|adicionar ao nosso grupo/,
      `acção proibida sugerida em ${g.chatId}: "${g.oQueFazer}"`,
    )
    assert.ok(g.leitura.length > 10 && g.oQueFazer.length > 10)
  }
}

// ── 6. O resumo conta o que interessa ──
{
  const mapa = classificarDialogos(
    [
      d({ chatId: '-1', souAdmin: true }),
      d({ chatId: '-2', souAdmin: true }),
      d({ chatId: '-3', souAdmin: false, membros: 1000 }),
      d({ chatId: '-4', souAdmin: false, membros: 500 }),
    ],
    [{ chatId: '-1', ultimaMensagemIso: hDias(30) }],
    AGORA,
  )
  const r = resumoDoMapa(mapa)
  assert.equal(r.nossos, 2)
  assert.equal(r.terceiros, 2)
  assert.equal(r.nossosSemBot, 1, 'o -2 é nosso e o bot não está lá')
  assert.equal(r.nossosParados, 1, 'o -1 tem o bot mas está parado há 30 dias')
  assert.equal(r.alcanceTerceiros, 1500)
}

console.log('✅ dialogos: o mapa não vê pessoas, e o grupo nosso sem bot fica no topo')
