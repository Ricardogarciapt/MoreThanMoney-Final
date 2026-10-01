/**
 * A GUARDA DOS PILARES PÚBLICOS.
 *
 *   npx tsx lib/pilares.check.ts
 *
 * Dois casos maus, e nenhum deles dá erro no ecrã:
 *   · mandar um visitante para uma sala VIP logo no primeiro clique;
 *   · escrever «a abrir» numa área que o dono considera pronta.
 */
import {
  AREAS, PERCURSO_ORGANIZADO, PILARES, aberturaDe, areasDoPilar, hrefDaSala, montarArea,
  salaDeEntrada, type SalaPublica,
} from './pilares'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// ── A SALA DE ENTRADA ───────────────────────────────────────────────────────
{
  // As quatro salas do Ricardo, tal como estão na base.
  const DO_RICARDO: SalaPublica[] = [
    { id: 'vip-1', title: 'Live Trading VIP', access_tier: 'vip' },
    { id: 'vip-2', title: 'Mentoria VIP', access_tier: 'vip' },
    { id: 'basics', title: 'MoreThanMoney Basics', access_tier: 'app_member' },
    { id: 'live', title: 'Live Trading', access_tier: 'free' },
  ]

  /**
   * O CASO MAU. A escolha ingénua — a primeira da lista — era a «Live Trading VIP», e o primeiro
   * clique de um visitante batia num cadeado. Não dá erro: a pessoa conclui que isto não é para
   * ela e vai-se embora.
   */
  teste('escolhe a sala mais aberta, não a primeira', salaDeEntrada(DO_RICARDO)?.id === 'live')
  teste('e o caminho é o da sala', hrefDaSala(salaDeEntrada(DO_RICARDO)) === '/live-sessions/live')

  // Sem nenhuma aberta, abre a menos fechada — mas nunca inventa uma.
  const sóVip: SalaPublica[] = [
    { id: 'a', title: 'Mentoria VIP', access_tier: 'vip' },
    { id: 'b', title: 'Sala Premium', access_tier: 'premium' },
  ]
  teste('só com salas fechadas, escolhe a menos fechada', salaDeEntrada(sóVip)?.id === 'b')

  teste('sem salas, não há caminho', salaDeEntrada([]) === null && hrefDaSala(null) === null)
  teste('sala sem id não conta', salaDeEntrada([{ id: '', title: 'X' }]) === null)

  // Empate: desempata pelo nome, para a ligação não mudar sozinha quando entra uma sala nova.
  const empate: SalaPublica[] = [
    { id: 'z', title: 'Zulu', access_tier: 'free' },
    { id: 'a', title: 'Alfa', access_tier: 'free' },
  ]
  teste('empate desfaz-se pelo nome, não pela ordem de chegada', salaDeEntrada(empate)?.id === 'a')
  teste('e é estável quando a lista vem ao contrário',
    salaDeEntrada([...empate].reverse())?.id === 'a')

  // Um nível desconhecido é tratado como o mais fechado: nunca se promove o que não se percebe.
  teste('nível desconhecido é o mais fechado', aberturaDe('inventado') > aberturaDe('vip'))
  teste('free é o mais aberto', aberturaDe('free') === 0)
  teste('nulo não passa à frente do free', aberturaDe(null) > aberturaDe('free'))
}

// ── «A ABRIR» NÃO EXISTE ────────────────────────────────────────────────────
{
  const semEducador = montarArea(AREAS[0], [], {})
  teste('área sem educador diz como se acompanha', semEducador.comoSeAcompanha === PERCURSO_ORGANIZADO)
  /**
   * A regra do dono, em código. Uma página que diz o que falta vende a casa a menos do que ela é —
   * e a frase proibida entra sempre por um `?? 'em breve'` escrito à pressa.
   */
  for (const proibida of ['a abrir', 'em breve', 'em preparação', 'brevemente', 'sem educador', 'por abrir']) {
    teste(`«${proibida}» não aparece em área nenhuma`,
      !AREAS.some((a) => `${a.titulo} ${a.descricao}`.toLowerCase().includes(proibida)) &&
      !semEducador.comoSeAcompanha.toLowerCase().includes(proibida))
  }
  // E a plataforma de terceiros não se nomeia.
  teste('a plataforma de terceiros não é nomeada',
    !AREAS.some((a) => /skool/i.test(`${a.titulo} ${a.descricao}`)) && !/skool/i.test(PERCURSO_ORGANIZADO))
}

// ── Montar com educadores ───────────────────────────────────────────────────
{
  const forex = AREAS.find((a) => a.academias.includes('forex'))!
  const ricardo = { id: 'rg', display_name: 'Ricardo Garcia', specialty: 'Regressão de Tendências e Scanners' }
  const montada = montarArea(forex, [ricardo], {
    rg: [
      { id: 'vip', title: 'Mentoria VIP', access_tier: 'vip' },
      { id: 'livre', title: 'Live Trading', access_tier: 'free' },
    ],
  })
  teste('com educador, a linha é o nome dele', montada.comoSeAcompanha === 'Ricardo Garcia')
  teste('e a ligação vai para a sala aberta', montada.educadores[0].href === '/live-sessions/livre')

  // Dois educadores na mesma área: aparecem os dois, não só o primeiro.
  const dois = montarArea(forex, [ricardo, { id: 'x', display_name: 'Outra Pessoa' }], { rg: [], x: [] })
  teste('dois educadores aparecem ambos', dois.educadores.length === 2)
  teste('e a linha nomeia os dois', dois.comoSeAcompanha === 'Ricardo Garcia · Outra Pessoa')
  // Educador sem sala nenhuma não inventa ligação — o cartão dele fica sem botão.
  teste('educador sem sala não tem ligação', dois.educadores[1].href === null)
}

// ── Os pilares ──────────────────────────────────────────────────────────────
{
  teste('dois pilares, com caminho próprio',
    PILARES.markets.href === '/mtmmarkets' && PILARES.content.href === '/contentbussiness')
  teste('a definição do MTM Markets é a do dono',
    PILARES.markets.definicao.startsWith('Os mercados e o dinheiro:'))
  teste('todas as áreas pertencem a um pilar que existe',
    AREAS.every((a) => Boolean(PILARES[a.pilar])))
  teste('os dois pilares têm áreas', areasDoPilar('markets').length > 0 && areasDoPilar('content').length > 0)
  teste('são oito áreas ou mais, nunca menos', AREAS.length >= 8)
  teste('o Faceless Marketing entrou no Content',
    areasDoPilar('content').some((a) => a.titulo === 'Faceless Marketing'))
  teste('o Fitness fica de fora das páginas públicas',
    !AREAS.some((a) => /fitness/i.test(a.titulo)))
  teste('nenhuma área se repete', new Set(AREAS.map((a) => a.titulo)).size === AREAS.length)
}

if (falhas.length) {
  console.error(`pilares: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('pilares: a sala de entrada é a mais aberta, e nenhuma área diz o que lhe falta ✓')
