/**
 * A GUARDA DA PORTA — prova que um setter, um closer, um prospector, um afiliado ou um team leader
 * NÃO chegam aos comandos de administração. Nem pela lista, nem escrevendo o comando à mão.
 *
 * O dono foi textual: «essas funções são só para mim como admin». Uma promessa num comentário não
 * prende nada — o que prende é isto, que falha a build de quem a quebrar.
 *
 * Prova-se em cinco frentes, porque há cinco maneiras diferentes de isto se estragar:
 *
 *  1. NOMES — as duas listas de comandos são disjuntas. Ninguém serve um `/pipeline` da equipa que
 *     tape o `/pipeline` do dono (nem o contrário).
 *  2. RESOLUÇÃO — `comandoPor('/admin')` é `null`, com argumentos e com sufixo `@bot`. Mesmo que um
 *     dia alguém mude a ordem dos `else if` no webhook e o lado da equipa veja o comando primeiro,
 *     não o serve.
 *  3. CAPACIDADES — nenhum comando da equipa exige uma capacidade que só o dono tem, e a lista de
 *     cada papel real não contém nenhum comando do dono.
 *  4. CÓDIGO — varredura aos ficheiros: o lado da equipa não importa o lado do admin, não chama
 *     `handleAdminAction` e não conhece `chatDeAdminDoAmbiente`. Sem isto, as três provas de cima
 *     continuavam verdade e alguém podia chamar o painel por dentro.
 *  5. DINHEIRO — a lista dos comandos que ESCREVEM está presa. Um comando novo que escreva obriga
 *     a mexer aqui, e é aí que se olha para o que se está a deixar fazer pelo telemóvel.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CAPACIDADES, PAPEIS, capacidadesDe, type Capacidade } from './backoffice-papeis'
import {
  CAPACIDADES_SO_DO_DONO,
  COMANDOS_DO_DONO,
  COMANDOS_EQUIPA,
  ESCRITAS_PERMITIDAS,
  PREFIXO_BOTAO_DONO,
  PREFIXO_BOTAO_EQUIPA,
  argumentoDe,
  comandoPor,
  comandosPara,
  ehComandoDoDono,
  podeComando,
  primeiroToken,
  textoDeAjudaEquipa,
} from './backoffice-telegram-comandos'
import {
  TAMANHO_CODIGO,
  TENTATIVAS_MAXIMAS,
  VALIDADE_MINUTOS,
  contarTentativa,
  ehCodigoBemFormado,
  estadoDoCodigo,
  expiracaoDe,
  gerarCodigo,
  normalizarCodigo,
  resumoDoCodigo,
  tentativasExcedidas,
} from './backoffice-telegram-codigo'

const nomesEquipa = COMANDOS_EQUIPA.map((c) => c.nome)
const nomesDono = COMANDOS_DO_DONO as readonly string[]

// ── 1. Nomes: higiene e disjunção ───────────────────────────────────────────

assert.equal(new Set(nomesEquipa).size, nomesEquipa.length, 'comando da equipa repetido')
for (const c of COMANDOS_EQUIPA) {
  assert.match(c.nome, /^\/[a-z]+$/, `nome de comando estranho: ${c.nome}`)
  assert.ok(c.descricao.length > 8, `comando sem descrição útil: ${c.nome}`)
}
for (const nome of nomesEquipa) {
  assert.ok(!nomesDono.includes(nome), `COLISÃO: ${nome} é comando do dono e está na lista da equipa`)
}
assert.notEqual(PREFIXO_BOTAO_EQUIPA, PREFIXO_BOTAO_DONO)
assert.ok(!PREFIXO_BOTAO_EQUIPA.startsWith(PREFIXO_BOTAO_DONO) && !PREFIXO_BOTAO_DONO.startsWith(PREFIXO_BOTAO_EQUIPA))

// ── 2. Resolução: o lado da equipa nunca serve um comando do dono ────────────

for (const nome of nomesDono) {
  assert.equal(comandoPor(nome), null, `${nome} resolveu para um comando da equipa`)
  assert.equal(comandoPor(`${nome} 123`), null, `${nome} com argumento resolveu`)
  assert.equal(comandoPor(`${nome}@MoreThanMoney_aibot`), null, `${nome} com sufixo de bot resolveu`)
  assert.equal(comandoPor(nome.toUpperCase()), null, `${nome} em maiúsculas resolveu`)
  assert.ok(ehComandoDoDono(`${nome} seja o que for`), `${nome} não foi reconhecido como do dono`)
}
// E um comando da equipa continua a resolver — a guarda não pode passar por fechar tudo.
assert.equal(comandoPor('/hoje')?.nome, '/hoje')
assert.equal(comandoPor('/FEITO 2')?.nome, '/feito')
assert.equal(comandoPor('/feito@MoreThanMoney_aibot 2')?.nome, '/feito')
assert.equal(comandoPor('/inventado'), null)
assert.equal(comandoPor('bom dia'), null)
assert.equal(primeiroToken('/ligar AB23CD34'), '/ligar')
assert.equal(argumentoDe('/ligar AB23CD34'), 'AB23CD34')
assert.equal(argumentoDe('/hoje'), '')

// ── 3. Capacidades: por papel, e sem as do dono ─────────────────────────────

for (const c of COMANDOS_EQUIPA) {
  if (c.capacidade === null) continue
  assert.ok((CAPACIDADES as readonly string[]).includes(c.capacidade), `capacidade inventada em ${c.nome}`)
  assert.ok(
    !CAPACIDADES_SO_DO_DONO.includes(c.capacidade),
    `${c.nome} exige ${c.capacidade}, que é uma capacidade só do dono`,
  )
}
// Exactamente UMA porta sem capacidade, e é a de ligar a conta. Mais do que uma é um comando
// esquecido sem autorização nenhuma.
const portas = COMANDOS_EQUIPA.filter((c) => c.capacidade === null).map((c) => c.nome)
assert.deepEqual(portas, ['/ligar'])

for (const papel of PAPEIS) {
  const caps = capacidadesDe([papel])
  /**
   * Os papéis vão na chamada de propósito. Desde que existem bancadas com `papel` (o `/setter`, o
   * `/closer`…), uma varredura que não os passasse testava a pessoa errada: via só os comandos sem
   * papel e dizia «nenhum papel chega ao lado do dono» sem ter olhado para metade da lista.
   * Quem prova o contrário — que o papel de outro NÃO abre — é `backoffice-telegram-papeis.check.ts`.
   */
  const lista = comandosPara(caps, [papel]).map((c) => c.nome)
  for (const proibido of nomesDono) {
    assert.ok(!lista.includes(proibido), `${papel} chegou a ${proibido}`)
  }
  // Nada aparece a quem não tem a capacidade — e a lista nunca inventa nomes fora do registo.
  for (const nome of lista) assert.ok(nomesEquipa.includes(nome), `${papel} recebeu um comando fora do registo: ${nome}`)
  for (const c of COMANDOS_EQUIPA) {
    assert.equal(lista.includes(c.nome), podeComando(caps, c, [papel]), `${papel}: lista e podeComando discordam em ${c.nome}`)
  }
  // O texto de ajuda é o que a pessoa VÊ. Se um comando do dono aparecer aqui, alguém vai tentar.
  const ajuda = textoDeAjudaEquipa(caps, { papeis: [papel] })
  for (const proibido of nomesDono) {
    assert.ok(!ajuda.includes(proibido), `a ajuda de ${papel} menciona ${proibido}`)
  }
  assert.ok(!/admin/i.test(ajuda), `a ajuda de ${papel} fala de administração`)
}

// Cada papel vê o que é dele, e não o dos outros. É o pedido do dono escrito como teste.
const afiliado = comandosPara(capacidadesDe(['afiliado']), ['afiliado']).map((c) => c.nome)
assert.ok(afiliado.includes('/extracto') && afiliado.includes('/link'))
assert.ok(!afiliado.includes('/hoje'), 'o afiliado divulga e recebe — não tem tarefas de pipeline')
assert.ok(!afiliado.includes('/negocios'), 'dar o pipeline ao afiliado é dar-lhe os contactos de quem os trabalhou')
assert.ok(!afiliado.includes('/minhaequipa'))

const setter = comandosPara(capacidadesDe(['setter']), ['setter']).map((c) => c.nome)
assert.ok(setter.includes('/hoje') && setter.includes('/feito') && setter.includes('/negocios'))
assert.ok(!setter.includes('/minhaequipa'), 'um setter não vê a equipa')

const prospector = comandosPara(capacidadesDe(['prospector']), ['prospector']).map((c) => c.nome)
assert.ok(prospector.includes('/hoje'))
assert.ok(!prospector.includes('/negocios'), 'o prospector trabalha leads, não o pipeline de fecho')

const leader = comandosPara(capacidadesDe(['team_leader']), ['team_leader']).map((c) => c.nome)
assert.ok(leader.includes('/minhaequipa') && leader.includes('/negocios') && leader.includes('/hoje'))

// Quem ainda não ligou a conta (ou ficou sem papéis) fica com a porta e mais nada.
const semNada = comandosPara(new Set<Capacidade>()).map((c) => c.nome)
assert.deepEqual(semNada, ['/ligar'])
// Mesmo a fingir os cinco papéis: sem `bo.entrar` não há comando nenhum. Um papel não é uma chave.
assert.deepEqual(comandosPara(new Set<Capacidade>(), [...PAPEIS]).map((c) => c.nome), ['/ligar'])
assert.match(textoDeAjudaEquipa(new Set<Capacidade>()), /\/ligar/)

// ── 4. Varredura ao código: o lado da equipa não conhece o lado do admin ────

/**
 * Lê o ficheiro SEM comentários. Os comentários desta casa explicam precisamente o que se decidiu
 * não fazer («nunca `capacidadesDe(..., { admin: true })`»), e uma varredura que não os descarte
 * acusa o comentário em vez do código — o que treina quem vier a apagar a explicação para calar o
 * teste, que é o contrário do que isto serve.
 */
const lerLib = (f: string) =>
  readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

for (const f of ['./backoffice-telegram-comandos.ts', './backoffice-telegram.ts']) {
  const fonte = lerLib(f)
  assert.ok(
    !/from ['"]@\/lib\/telegram-admin/.test(fonte) && !/import\(['"]@\/lib\/telegram-admin/.test(fonte),
    `${f} importa o lado do admin — o painel do dono deixou de estar só dele`,
  )
  assert.ok(!/handleAdminAction/.test(fonte), `${f} chama handleAdminAction`)
  assert.ok(!/chatDeAdminDoAmbiente|TELEGRAM_ADMIN_CHAT_ID/.test(fonte), `${f} conhece o chat do dono`)
  // `capacidadesDe(..., { admin: true })` daria a um chat da equipa TODAS as capacidades — é a
  // única linha que transformava um setter em dono sem mexer em nada do painel.
  assert.ok(!/admin:\s*true/.test(fonte), `${f} constrói capacidades de admin`)
}

// A lista dos comandos do dono tem de continuar a descrever a realidade do webhook: se um deles
// deixar de lá estar, esta lista passou a mentir e as provas de disjunção deixam de valer.
const rota = readFileSync(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8')
for (const nome of nomesDono) {
  assert.ok(rota.includes(nome.slice(1)), `${nome} não aparece no webhook — a lista do dono está desactualizada`)
}
// E o lado da equipa está de facto ligado, por UM sítio só.
assert.ok(rota.includes('tratarComandoDeEquipa'), 'o webhook não encaminha os comandos da equipa')
assert.ok(rota.includes('ehChatDeAdmin'), 'o webhook deixou de gatear os comandos do dono')

// ── 5. Dinheiro: o que escreve está preso ──────────────────────────────────

const escrevem = COMANDOS_EQUIPA.filter((c) => c.escreve).map((c) => c.nome)
assert.deepEqual(
  escrevem,
  [...ESCRITAS_PERMITIDAS],
  'entrou (ou saiu) um comando que escreve — confirma que não mexe em dinheiro e actualiza ESCRITAS_PERMITIDAS',
)
for (const c of COMANDOS_EQUIPA) {
  if (!c.escreve) continue
  assert.ok(
    !/pag|aprov|estorn|comiss|transfer/i.test(c.nome),
    `${c.nome} escreve e tem nome de dinheiro — aprovar e pagar é do dono, no /admin`,
  )
}
// O extracto existe e LÊ. É a única coisa de dinheiro que a equipa vê pelo bot.
const extracto = COMANDOS_EQUIPA.find((c) => c.nome === '/extracto')
assert.ok(extracto && !extracto.escreve, 'o /extracto passou a escrever')

// ── 6. O código de ligação ─────────────────────────────────────────────────

const codigo = gerarCodigo()
assert.ok(ehCodigoBemFormado(codigo), `código gerado não passa a própria validação: ${codigo}`)
assert.equal(codigo.length, TAMANHO_CODIGO)
// Sem caracteres que se confundam ao copiar de um ecrã para uma conversa.
for (const mau of ['0', 'O', '1', 'I', 'L']) {
  assert.ok(!codigo.includes(mau), `o alfabeto deixou entrar ${mau}`)
}
// Dois códigos seguidos não podem ser iguais — um gerador preso dava a mesma chave a toda a equipa.
assert.notEqual(gerarCodigo(), gerarCodigo())

assert.equal(normalizarCodigo(' ab23-cd34 '), 'AB23CD34')
assert.ok(ehCodigoBemFormado(normalizarCodigo('ab23cd34')))
assert.ok(!ehCodigoBemFormado('AB23CD3'), 'tamanho a menos passou')
assert.ok(!ehCodigoBemFormado('AB23CD3O'), 'caractere fora do alfabeto passou')

// O resumo é estável e não devolve o código. É o que torna uma fuga da tabela um não-acontecimento.
assert.equal(resumoDoCodigo('AB23CD34'), resumoDoCodigo('AB23CD34'))
assert.notEqual(resumoDoCodigo('AB23CD34'), resumoDoCodigo('AB23CD35'))
assert.match(resumoDoCodigo('AB23CD34'), /^[0-9a-f]{64}$/)
assert.ok(!resumoDoCodigo('AB23CD34').includes('AB23CD34'))

const agora = new Date('2026-09-26T10:00:00Z')
assert.equal(estadoDoCodigo({ expiraEm: expiracaoDe(agora) }, agora), 'valido')
assert.equal(estadoDoCodigo({ expiraEm: new Date(agora.getTime() - 1) }, agora), 'expirado')
// Usado ganha a expirado: as duas situações pedem respostas diferentes à pessoa, e dizer a errada
// põe alguém a gerar códigos novos quando o problema é que a conta já está ligada noutro sítio.
assert.equal(estadoDoCodigo({ expiraEm: new Date(agora.getTime() - 1), usadoEm: agora }, agora), 'usado')
assert.equal(estadoDoCodigo({ expiraEm: 'isto-não-é-uma-data' }, agora), 'expirado')
assert.ok(VALIDADE_MINUTOS > 0 && VALIDADE_MINUTOS <= 60, 'um código que dura horas acaba num screenshot')

// Tentativas: contam dentro da janela, esquecem-se fora dela.
let t = contarTentativa(null, agora)
assert.equal(t.contagem, 1)
assert.ok(!tentativasExcedidas(t, agora))
for (let i = 1; i < TENTATIVAS_MAXIMAS; i++) t = contarTentativa(t, agora)
assert.equal(t.contagem, TENTATIVAS_MAXIMAS)
assert.ok(tentativasExcedidas(t, agora), 'a força bruta não foi travada')
const bemDepois = new Date(agora.getTime() + 60 * 60_000)
assert.ok(!tentativasExcedidas(t, bemDepois), 'quem errou há uma hora não está a atacar')
assert.equal(contarTentativa(t, bemDepois).contagem, 1, 'a janela tinha de reiniciar')

console.log('backoffice-telegram-comandos: nenhum papel chega aos comandos do dono, cada um só vê o seu, e nada aqui mexe em dinheiro ✓')
