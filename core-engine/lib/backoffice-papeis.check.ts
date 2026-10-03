/**
 * GUARDA do modelo de permissões do backoffice.
 *
 * Isto governa DINHEIRO e ACESSOS. A pergunta que estas verificações respondem não é «funciona?»
 * — é «o que é que se parte em silêncio quando alguém acrescentar um papel ou uma capacidade?».
 * O modo de falhar que interessa evitar é sempre o mesmo: alguém passar a ver o que não é dele e
 * ninguém repara, porque no ecrã aparecem linhas a mais, não um erro.
 *
 *   npx tsx lib/backoffice-papeis.check.ts
 */
import { readFileSync } from 'node:fs'
import {
  PAPEIS,
  CAPACIDADES,
  capacidadesDe,
  capacidadesDoPapel,
  pode,
  ambitoDeLeitura,
  podeVerLinhaDe,
  ehPapel,
  PAPEL_NOME,
  type Papel,
} from './backoffice-papeis'
import {
  AREAS_SITE,
  AREA_NOME,
  areaDoCaminho,
  areasPermitidas,
  podeVerCaminho,
  normalizarAreas,
} from './backoffice-acessos-site'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

// ── Negar por omissão ────────────────────────────────────────────────────────
// Quem não tem papéis não entra. Nem sendo membro pagante: cliente e equipa são coisas distintas.
const semPapeis = capacidadesDe([])
teste('sem papéis não se entra', !pode(semPapeis, 'bo.entrar'))
teste('sem papéis não há extracto', !pode(semPapeis, 'bo.extracto_proprio'))
teste('sem papéis não se gerem papéis', !pode(semPapeis, 'bo.papeis_gerir'))

// ── A separação entre colegas: o caso que motivou tudo isto ──────────────────
// Um setter não pode ver o que outro setter ganhou.
const setter = capacidadesDe(['setter'])
teste('setter vê o seu extracto', pode(setter, 'bo.extracto_proprio'))
teste('setter NÃO vê o extracto da equipa', !pode(setter, 'bo.extracto_equipa'))
teste('setter NÃO vê o extracto de todos', !pode(setter, 'bo.extracto_todos'))
const ambitoSetter = ambitoDeLeitura(setter, 'eu', 'extracto', ['colega-1', 'colega-2'])
teste('setter só se lê a si', ambitoSetter.ids.length === 1 && ambitoSetter.ids[0] === 'eu')
teste('setter não lê o colega', !podeVerLinhaDe(ambitoSetter, 'colega-1'))
teste('setter não lê tudo', ambitoSetter.todos === false)
// Mesmo que lhe cheguem liderados por engano, sem a capacidade de equipa eles são ignorados.
teste('liderados sem capacidade são ignorados', ambitoDeLeitura(setter, 'eu', 'leads', ['x']).ids.length === 1)

// ── Team leader: vê a equipa, mas só a equipa que lhe passarem ──────────────
const lider = capacidadesDe(['team_leader', 'closer']) // um leader normalmente também fecha
teste('leader acumula papéis', pode(lider, 'bo.pipeline_proprio') && pode(lider, 'bo.equipa_ver'))
const ambitoLider = ambitoDeLeitura(lider, 'eu', 'extracto', ['a', 'b'])
teste('leader lê os liderados', podeVerLinhaDe(ambitoLider, 'a') && podeVerLinhaDe(ambitoLider, 'b'))
teste('leader lê-se a si próprio', podeVerLinhaDe(ambitoLider, 'eu'))
teste('leader não lê quem não lidera', !podeVerLinhaDe(ambitoLider, 'estranho'))
// O CASO QUE FECHA A PORTA: se a lista de liderados não chegar (modelo de equipa ainda por
// construir, ou leitura falhada), o leader vê-se SÓ a si. Uma falha que mostra tudo era o desastre.
const ambitoSemEquipa = ambitoDeLeitura(lider, 'eu', 'extracto', [])
teste('leader sem equipa carregada só se vê a si', ambitoSemEquipa.ids.length === 1)
teste('leader sem equipa não vê tudo', ambitoSemEquipa.todos === false)
teste('ids vazios na lista não contam', ambitoDeLeitura(lider, 'eu', 'leads', ['', '']).ids.length === 1)

// ── O afiliado divulga, não trabalha contactos alheios ──────────────────────
const afiliado = capacidadesDe(['afiliado'])
teste('afiliado entra', pode(afiliado, 'bo.entrar'))
teste('afiliado tem material', pode(afiliado, 'bo.material'))
teste('afiliado NÃO tem pipeline', !pode(afiliado, 'bo.pipeline_proprio'))
teste('afiliado NÃO tem leads', !pode(afiliado, 'bo.leads_proprias'))
teste('afiliado não lê pipeline nenhum', ambitoDeLeitura(afiliado, 'eu', 'pipeline').ids.length === 0)

// ── O dono passa pelo MESMO caminho que todos ───────────────────────────────
// Não há `if (isAdmin)` espalhado pelas rotas: ser dono é uma linha em `capacidadesDe`.
const dono = capacidadesDe([], { admin: true })
teste('dono tem tudo', CAPACIDADES.every((c) => pode(dono, c)))
teste('dono lê tudo no extracto', ambitoDeLeitura(dono, 'eu', 'extracto').todos === true)
// E «tudo» no extracto não se confunde com «tudo» nas outras famílias sem capacidade própria.
teste('todos só aparece com extracto_todos', ambitoDeLeitura(lider, 'eu', 'extracto').todos === false)

// Os pares próprio/equipa de cada família, escritos à mão e não derivados: derivá-los de um nome
// daria a mesma resposta errada que o código que se quer testar.
const PARES_AMBITO = [
  ['bo.extracto_proprio', 'bo.extracto_equipa'],
  ['bo.leads_proprias', 'bo.leads_equipa'],
  ['bo.pipeline_proprio', 'bo.pipeline_equipa'],
  ['bo.tarefas_proprias', 'bo.tarefas_equipa'],
] as const

// ── Nenhum papel dá o que é só do dono ──────────────────────────────────────
// Esta é a verificação que apanha o engano futuro: acrescentar `bo.papeis_gerir` a um papel «para
// o leader poder ajudar» é dar-lhe a chave de casa.
for (const p of PAPEIS) {
  const caps = capacidadesDe([p])
  teste(`${p} não gere papéis`, !caps.has('bo.papeis_gerir'))
  teste(`${p} não vê o extracto de todos`, !caps.has('bo.extracto_todos'))
  teste(`${p} entra no backoffice`, caps.has('bo.entrar'))
  teste(`${p} tem nome apresentável`, typeof PAPEL_NOME[p] === 'string' && PAPEL_NOME[p].length > 0)
  // Ninguém vê a equipa sem também ver o próprio: um âmbito de equipa sem âmbito próprio seria um
  // buraco (via `ambitoDeLeitura`, a falta do próprio fecha tudo — e passaria por bug de ecrã).
  for (const [proprio, equipa] of PARES_AMBITO) {
    teste(`${p}/${equipa}: equipa nunca sem próprio`, !caps.has(equipa) || caps.has(proprio))
  }
}

// Só papéis do catálogo entram.
teste('papel inventado é recusado', !ehPapel('dono'))
teste('papel válido é aceite', ehPapel('closer' satisfies Papel))
teste('capacidade de papel inexistente é vazia', capacidadesDoPapel('nao_existe' as Papel).length === 0)

// ── Acessos ao SITE: a lista só aperta ──────────────────────────────────────
const membro = { user_type: 'member', member_category: 'premium', is_active: true, subscription_plan: 'premium' as const }
teste('membro sem restrição vê tudo', areasPermitidas(membro, null).size === AREAS_SITE.length)
teste('lista vazia não é restrição', areasPermitidas(membro, []).size === AREAS_SITE.length)
teste('lista escolhe de entre o que havia', areasPermitidas(membro, ['sinais']).size === 1)

// O NÃO-CLIENTE: um afiliado criado de raiz tem backoffice e NADA do site, mesmo com áreas marcadas.
const naoCliente = { user_type: 'pending', is_active: false }
teste('não-cliente não vê áreas', areasPermitidas(naoCliente, null).size === 0)
teste('marcar áreas não dá produto a quem não paga', areasPermitidas(naoCliente, ['sinais', 'lms']).size === 0)
teste('não-cliente não entra no /member-area', !podeVerCaminho(naoCliente, ['member_area'], '/member-area'))
// ...mas o papel continua a valer: entrar no backoffice não passa por aqui.
teste('o papel do não-cliente sobrevive', pode(capacidadesDe(['afiliado']), 'bo.entrar'))

// Bloqueado pelo portão de activação: as marcas ficam, inofensivas, até pagar.
const bloqueado = {
  user_type: 'member', member_category: 'premium', is_active: true, subscription_plan: 'premium' as const,
  profile_data: { activation: { required: true, since: new Date().toISOString(), decision: 'pay' } },
}
teste('activação pendente fecha as áreas', areasPermitidas(bloqueado, ['sinais']).size === 0)

// Caminhos que esta lista não governa continuam abertos: não se fecha a homepage por engano.
teste('caminho não governado passa', podeVerCaminho(naoCliente, ['sinais'], '/new-landing'))
teste('/upgrade fica sempre aberto', podeVerCaminho(naoCliente, [], '/upgrade'))
teste('area do caminho reconhece prefixo', areaDoCaminho('/member-area/perfil') === 'member_area')
teste('prefixo parcial não conta', areaDoCaminho('/member-area-falso') === null)
teste('raiz não é área', areaDoCaminho('/') === null)
for (const a of AREAS_SITE) teste(`${a} tem nome apresentável`, typeof AREA_NOME[a] === 'string')

// Lixo do admin não entra na base.
teste('área inventada é limpa', normalizarAreas(['sinais', 'xpto']).length === 1)
teste('repetidos são limpos', normalizarAreas(['sinais', 'sinais']).length === 1)
teste('não-array dá vazio', normalizarAreas('sinais').length === 0)

// ── E o modelo é o ÚNICO sítio onde se decide ──────────────────────────────
// Se uma rota do backoffice voltar a perguntar «é setter?» em vez de «pode?», a porta seguinte que
// alguém abrir vai esquecer-se de um papel e ninguém dá por isso.
const papeisLib = readFileSync('lib/backoffice-papeis.ts', 'utf8')
teste('o modelo é puro (sem base de dados)', !/supabase|createClient|from\(/.test(papeisLib))
teste('o modelo não importa next', !/from ['"]next/.test(papeisLib))

if (falhas.length) {
  console.error(`backoffice-papeis: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice-papeis: nega por omissão, um setter não vê o colega, e o papel não dá produto pago ✓')
