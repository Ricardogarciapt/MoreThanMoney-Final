/**
 * A GUARDA DAS BANCADAS POR PAPEL — prova as duas coisas que o dono pediu por palavras dele:
 *
 *   «acessos a cada função, mas apenas para quem tem o papel dessa função»
 *   «deves impedir que leads tenham acesso a estes comandos»
 *
 * PORQUE É QUE ISTO É UM FICHEIRO À PARTE
 * `backoffice-telegram-comandos.check.ts` prova que a EQUIPA não chega ao lado do DONO. O que se
 * prova aqui é outra fronteira: que dentro da própria equipa cada função só vê a sua bancada, e que
 * quem nunca fez `/ligar` não vê nada. São duas perguntas diferentes, e um ficheiro que respondesse
 * às duas dizia no fim «passou» sem se saber qual das duas ainda está a ser verificada.
 *
 * AS QUATRO FRENTES
 *  1. PAPEL APERTA, NÃO SUBSTITUI — todo o comando com `papel` tem também `capacidade`, e falha
 *     se lhe faltar uma das duas. O setter e o closer têm as MESMAS capacidades: se o papel deixar
 *     de ser verificado, um vê a bancada do outro e ninguém dá por isso pelo ecrã.
 *  2. CADA FUNÇÃO SÓ A SUA — cruzam-se os cinco papéis com os cinco comandos e exige-se a diagonal.
 *  3. LEADS NÃO ENTRAM — um chat que existe em `telegram_leads` e NÃO existe em
 *     `backoffice_contactos` manda `/setter` e não obtém a bancada. Corre-se o despacho a sério
 *     (`tratarComandoDeEquipa`) contra uma base falsa, porque provar isto só ao nível das
 *     capacidades era provar a metade fácil.
 *  4. EVOLUTIVO — o registo aceita um papel que ainda não existe como comando sem nada deixar de
 *     funcionar, e nenhum `papel` declarado é inventado.
 */
import assert from 'node:assert/strict'
import { PAPEIS, capacidadesDe, type Capacidade, type Papel } from './backoffice-papeis'
import {
  COMANDOS_EQUIPA,
  ESCRITAS_PERMITIDAS,
  PAPEL_OU_IB_NOME,
  comandosPara,
  podeComando,
  textoDeAjudaEquipa,
  type PapelOuIb,
} from './backoffice-telegram-comandos'
import { tratarComandoDeEquipa, trabalhadorDoChat } from './backoffice-telegram'

const BANCADAS: Record<string, PapelOuIb> = {
  '/prospector': 'prospector',
  '/setter': 'setter',
  '/closer': 'closer',
  '/ib': 'ib',
  '/afiliado': 'afiliado',
}

// ── 1. O papel APERTA a capacidade, nunca a substitui ───────────────────────

for (const c of COMANDOS_EQUIPA) {
  if (!c.papel) continue
  assert.ok(
    c.capacidade !== null,
    `${c.nome} tem papel e não tem capacidade — o papel é um aperto sobre a capacidade, não uma alternativa a ela`,
  )
  assert.ok(PAPEL_OU_IB_NOME[c.papel], `${c.nome} exige um papel que não existe: ${c.papel}`)
  // Ter a capacidade e NÃO ter o papel tem de fechar. É este o caso que a versão anterior do
  // registo não sabia distinguir, e é a razão de o campo existir.
  const caps = capacidadesDe(PAPEIS as readonly Papel[])
  assert.ok(!podeComando(caps, c, []), `${c.nome} abriu sem o papel, só com as capacidades`)
  // E ter o papel sem a capacidade também fecha — o piso continua a ser o piso.
  assert.ok(!podeComando(new Set<Capacidade>(), c, [c.papel]), `${c.nome} abriu só com o papel, sem capacidade`)
  assert.ok(!podeComando(new Set<Capacidade>(['bo.entrar']), c, [c.papel]) || c.capacidade === 'bo.entrar',
    `${c.nome} abriu sem a sua capacidade própria`)
  // Com os dois, abre. A guarda não pode passar por fechar tudo.
  assert.ok(podeComando(caps, c, [c.papel]), `${c.nome} não abre a quem tem papel e capacidade`)
}

// Esquecer os papéis na chamada FECHA (negar por omissão), nunca abre.
const todasCaps = capacidadesDe(PAPEIS as readonly Papel[])
for (const nome of Object.keys(BANCADAS)) {
  assert.ok(!comandosPara(todasCaps).some((c) => c.nome === nome), `${nome} apareceu a quem não declarou papéis`)
}
// E o resto do bot continua a aparecer — a omissão não pode ter fechado o `/hoje` de ninguém.
assert.ok(comandosPara(todasCaps).some((c) => c.nome === '/hoje'))

// ── 2. Cada função só vê a sua bancada ──────────────────────────────────────

for (const papel of PAPEIS) {
  const caps = capacidadesDe([papel])
  const lista = comandosPara(caps, [papel]).map((c) => c.nome)
  for (const [nome, exigido] of Object.entries(BANCADAS)) {
    const devia = exigido === papel
    assert.equal(
      lista.includes(nome),
      devia,
      devia ? `${papel} não recebeu a sua bancada ${nome}` : `${papel} chegou à bancada ${nome}, que é de ${exigido}`,
    )
  }
  // O que a pessoa VÊ é o texto de ajuda. Se a bancada de outro aparecer aqui, ela vai escrevê-la.
  const ajuda = textoDeAjudaEquipa(caps, { papeis: [papel] })
  for (const [nome, exigido] of Object.entries(BANCADAS)) {
    if (exigido === papel) continue
    assert.ok(!ajuda.includes(nome), `a ajuda de ${papel} anuncia ${nome}`)
  }
}

// O caso que motivou o campo: setter e closer têm capacidades IDÊNTICAS e bancadas trocadas.
const capsSetter = capacidadesDe(['setter'])
const capsCloser = capacidadesDe(['closer'])
assert.deepEqual([...capsSetter].sort(), [...capsCloser].sort(), 'setter e closer deixaram de ter as mesmas capacidades — a prova de baixo perdeu o sentido, confirma-a')
assert.ok(podeComando(capsSetter, COMANDOS_EQUIPA.find((c) => c.nome === '/setter')!, ['setter']))
assert.ok(!podeComando(capsCloser, COMANDOS_EQUIPA.find((c) => c.nome === '/setter')!, ['closer']), 'o closer chegou à bancada do setter')
assert.ok(!podeComando(capsSetter, COMANDOS_EQUIPA.find((c) => c.nome === '/closer')!, ['setter']), 'o setter chegou à bancada do closer')

// O IB não é papel: quem acumula papéis todos e NÃO está em `ib_membros` não vê a rede.
const ibComando = COMANDOS_EQUIPA.find((c) => c.nome === '/ib')!
assert.ok(!podeComando(todasCaps, ibComando, [...PAPEIS]), 'a rede de IBs abriu a quem só tem papéis de vendas')
assert.ok(podeComando(capacidadesDe(['setter']), ibComando, ['setter', 'ib']), 'um IB com papel não vê a sua rede')

// Nenhuma bancada escreve. O dono pediu leitura primeiro, e isto prende-o.
for (const nome of Object.keys(BANCADAS)) {
  const c = COMANDOS_EQUIPA.find((x) => x.nome === nome)!
  assert.ok(!c.escreve, `${nome} passou a escrever`)
  assert.ok(!(ESCRITAS_PERMITIDAS as readonly string[]).includes(nome), `${nome} entrou em ESCRITAS_PERMITIDAS`)
}

// ── 3. OS LEADS NÃO ENTRAM ──────────────────────────────────────────────────

/**
 * Uma base falsa com o que interessa: há um lead em `telegram_leads` e NÃO há linha nenhuma em
 * `backoffice_contactos`. É o retrato exacto de quem falou com o bot e nunca fez `/ligar`.
 *
 * Corre-se o despacho verdadeiro em vez de se replicar a lógica no teste. A razão é a de sempre:
 * um teste que reescreve a regra passa a provar a cópia dele, e a cópia nunca é a que está em
 * produção.
 */
const CHAT_DE_LEAD = '987654321'
const lida: string[] = []

/** A casca de uma consulta: encadeia tudo e resolve sempre no mesmo resultado. */
interface ConsultaFalsa {
  select: (...a: unknown[]) => ConsultaFalsa
  eq: (...a: unknown[]) => ConsultaFalsa
  is: (...a: unknown[]) => ConsultaFalsa
  in: (...a: unknown[]) => ConsultaFalsa
  or: (...a: unknown[]) => ConsultaFalsa
  not: (...a: unknown[]) => ConsultaFalsa
  gte: (...a: unknown[]) => ConsultaFalsa
  lte: (...a: unknown[]) => ConsultaFalsa
  order: (...a: unknown[]) => ConsultaFalsa
  limit: (...a: unknown[]) => ConsultaFalsa
  maybeSingle: () => Promise<unknown>
  single: () => Promise<unknown>
  then: <T>(r: (v: unknown) => T) => Promise<T>
}

function baseSemNinguemLigado(): { from: (tabela: string) => ConsultaFalsa } {
  const consulta = (tabela: string): ConsultaFalsa => {
    lida.push(tabela)
    const resultado =
      tabela === 'telegram_leads'
        ? { data: [{ chat_id: CHAT_DE_LEAD, stage: 'interessado' }] }
        : { data: null }
    const api: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'in', 'or', 'not', 'gte', 'lte', 'order', 'limit']) {
      api[m] = () => api
    }
    api.maybeSingle = async () => resultado
    api.single = async () => resultado
    api.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r)
    return api as unknown as ConsultaFalsa
  }
  return { from: (tabela: string) => consulta(tabela) }
}

const base = baseSemNinguemLigado()
// `as never` porque as funções verdadeiras querem o cliente Supabase inteiro e isto é a casca com
// os quatro métodos que elas chamam. A base falsa fica acessível por `base` para a premissa abaixo.
const db = base as never

/**
 * Em função e não em `await` de topo porque o `tsx` desta casa compila para CommonJS. A promessa é
 * encadeada no fim do ficheiro com um `catch` que sai com código diferente de zero — sem isso uma
 * asserção falhada aqui dentro virava um aviso e o teste dizia «passou».
 */
async function provaDosLeads() {
// A PREMISSA, verificada e não assumida: este chat É um lead do funil do bot. Sem isto, o teste
// abaixo provava apenas que um número ao acaso não tem acesso — o que é verdade e não é o pedido.
const { data: lead } = (await base.from('telegram_leads').select('chat_id, stage').eq('chat_id', CHAT_DE_LEAD)) as {
  data: Array<{ chat_id: string }> | null
}
assert.equal(lead?.[0]?.chat_id, CHAT_DE_LEAD, 'o caso de teste deixou de ser um chat de lead')
lida.length = 0

const naoEhNinguem = await trabalhadorDoChat(db, CHAT_DE_LEAD)
assert.equal(naoEhNinguem, null, 'um chat de lead foi reconhecido como trabalhador da equipa')

for (const nome of [...Object.keys(BANCADAS), '/hoje', '/extracto', '/negocios', '/minhaequipa']) {
  const r = await tratarComandoDeEquipa(db, CHAT_DE_LEAD, nome)
  assert.ok(r, `${nome} devolveu null — o webhook ia tratá-lo como outra coisa`)
  /**
   * A resposta é a de comando desconhecido, e é assim de propósito: a quem não tem acesso não se
   * confirma que a bancada existe. Dizer «não tens permissão» ensina a pessoa a pedi-la, e ensina
   * um estranho que há ali algo para atacar.
   */
  assert.match(r!.texto, /Não conheço esse comando/, `${nome} respondeu algo a um chat de lead: ${r!.texto.slice(0, 80)}`)
  // E o mais importante: nada de dados. Nenhuma bancada chegou a consultar uma tabela de negócio.
  for (const proibida of ['vendas_negocios', 'vendas_extracto', 'ib_contas', 'referrals', 'vendas_tarefas']) {
    assert.ok(!lida.includes(proibida), `${nome} leu ${proibida} para um chat de lead`)
  }
}
// A única coisa que se leu foi quem é o chat — e ninguém era.
assert.ok(lida.every((t) => t === 'backoffice_contactos'), `leu tabelas a mais: ${[...new Set(lida)].join(', ')}`)
}

// E ao nível dos dados, o mesmo: sem `bo.entrar` não há bancada nenhuma, com ou sem papéis.
const semNada = new Set<Capacidade>()
for (const nome of Object.keys(BANCADAS)) {
  const c = COMANDOS_EQUIPA.find((x) => x.nome === nome)!
  assert.ok(!podeComando(semNada, c, [...PAPEIS, 'ib']), `${nome} abriu a um chat sem bo.entrar`)
}
assert.deepEqual(comandosPara(semNada, [...PAPEIS, 'ib']).map((c) => c.nome), ['/ligar'])

// ── 4. Evolutivo: um papel novo não obriga a mexer em handler nenhum ────────

/**
 * O registo é DADOS: um papel que ainda não tem bancada continua a receber o resto, e um comando
 * novo com um papel novo aparece só a quem o tem — sem se tocar em `podeComando`, em `comandosPara`
 * nem no `switch` do despacho (que só ganha um `case`).
 */
const inventado = { nome: '/futuro', capacidade: 'bo.entrar' as Capacidade, papel: 'team_leader' as PapelOuIb, descricao: 'bancada que ainda não existe', escreve: false }
assert.ok(podeComando(capacidadesDe(['team_leader']), inventado, ['team_leader']))
assert.ok(!podeComando(capacidadesDe(['setter']), inventado, ['setter']))
// `team_leader` não tem bancada própria hoje, e isso não lhe tira nada do que já tinha.
const leader = comandosPara(capacidadesDe(['team_leader']), ['team_leader']).map((c) => c.nome)
assert.ok(leader.includes('/minhaequipa') && leader.includes('/hoje') && leader.includes('/negocios'))
assert.ok(!Object.keys(BANCADAS).some((n) => leader.includes(n)), 'o team_leader recebeu uma bancada que não é dele')

provaDosLeads()
  .then(() =>
    console.log(
      'backoffice-telegram-papeis: cada função só vê a sua bancada, o IB não é papel, e um chat de lead não obtém nada ✓',
    ),
  )
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
