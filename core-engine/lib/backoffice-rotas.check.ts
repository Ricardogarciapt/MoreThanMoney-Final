/**
 * GUARDA das rotas que dão e tiram papéis, e do portão que as outras rotas do backoffice usam.
 *
 * Estas rotas decidem quem entra e quem recebe dinheiro. O que se verifica aqui é o que NÃO se vê
 * numa revisão rápida: uma rota nova copiada de outra e que se esqueceu do `verifyAdminAccess`
 * parece igual às outras e responde 200 a qualquer pessoa.
 *
 *   npx tsx lib/backoffice-rotas.check.ts
 */
import { readFileSync } from 'node:fs'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }
const ler = (p: string) => readFileSync(p, 'utf8')

const ROTAS_ADMIN = [
  'app/api/admin/backoffice/papeis/route.ts',
  'app/api/admin/backoffice/acessos-site/route.ts',
  'app/api/admin/backoffice/afiliado/route.ts',
]

for (const caminho of ROTAS_ADMIN) {
  const src = ler(caminho)
  const nome = caminho.split('/').slice(-2)[0]

  // TODOS os verbos exportados verificam admin. Contar é mais honesto do que procurar uma vez: uma
  // rota com GET protegido e POST esquecido passava num teste que só perguntasse «usa admin?».
  const verbos = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1])
  const verificacoes = [...src.matchAll(/verifyAdminAccess\(\)/g)].length
  teste(`${nome}: tem verbos exportados`, verbos.length > 0)
  teste(`${nome}: cada verbo verifica admin (${verbos.length} verbos, ${verificacoes} verificações)`, verificacoes >= verbos.length)
  // A verificação tem de RECUSAR, não só correr. Um `verifyAdminAccess` cujo resultado se ignora é
  // pior do que nenhum: dá a sensação de estar protegido.
  teste(`${nome}: recusa quem não é admin`, /if \(!auth\.isAdmin/.test(src))
  teste(`${nome}: responde 403`, /status: 403/.test(src))
  // Nada vindo do cliente decide quem é: o autor da acção vem sempre de `auth.userId`.
  teste(`${nome}: não aceita admin_id do corpo`, !/body\.admin_id|body\.atribuido_por|body\.definido_por/.test(src))
}

// ── Papéis ───────────────────────────────────────────────────────────────────
const papeis = ler('app/api/admin/backoffice/papeis/route.ts')
// Quem atribui fica gravado. Um papel sem autor é indistinguível de um papel que alguém se deu a si.
teste('papéis: grava quem atribuiu', /atribuido_por: auth\.userId/.test(papeis))
teste('papéis: grava quem retirou', /retirado_por: auth\.userId/.test(papeis))
// RETIRAR NÃO APAGA. Quando alguém disser «eu era closer em Outubro», a resposta está na base.
teste('papéis: retirar é um update, não um delete', /retirado_at: new Date\(\)/.test(papeis))
teste('papéis: nunca apaga linhas', !/\.delete\(\)/.test(papeis))
// Só papéis do catálogo. Duas fechaduras (aqui e o `check` da base) porque uma muda com um deploy.
teste('papéis: valida o papel pelo catálogo', /ehPapel\(/.test(papeis))
// Retirar zero linhas não pode responder sucesso: o dono clicou para fechar uma porta e tem de saber
// se ela fechou.
teste('papéis: retirar nada dá 404', /Nenhum papel activo correspondente/.test(papeis))
// E repetir a atribuição não reinicia a antiguidade no papel, que é um facto.
teste('papéis: atribuir duas vezes é inofensivo', /ja_tinha/.test(papeis))

// ── Criar de raiz ────────────────────────────────────────────────────────────
const afiliado = ler('app/api/admin/backoffice/afiliado/route.ts')
// A conta nasce SEM ser cliente: é isto que faz «ter papel» não dar produto pago.
teste('afiliado: nasce como pending', /user_type: 'pending'/.test(afiliado))
teste('afiliado: nasce inactivo no site', /is_active: false/.test(afiliado))
teste('afiliado: fica marcada como só-backoffice', /backoffice_only: true/.test(afiliado))
// NENHUMA password passa por aqui — nem recebida, nem inventada. Só um link de definição.
teste('afiliado: não recebe password', !/body\.password/.test(afiliado))
teste('afiliado: não inventa password', !/randomBytes|Math\.random|generatePassword/.test(afiliado))
teste('afiliado: usa link de definição', /generateLink/.test(afiliado))
// Email repetido para antes de criar: um auth user órfão impedia a segunda tentativa, sem mensagem.
teste('afiliado: recusa email repetido antes de criar', /status: 409/.test(afiliado))
// E se o perfil falhar, o login é desfeito: melhor não existir do que existir sem perfil.
teste('afiliado: desfaz o login se o perfil falhar', /deleteUser\(userId\)/.test(afiliado))

// ── Acessos ao site ──────────────────────────────────────────────────────────
const acessos = ler('app/api/admin/backoffice/acessos-site/route.ts')
// A rota GUARDA a escolha; a regra de que ela só APERTA vive na lib, num sítio só, porque a leitura
// acontece em quatro superfícies e uma regra repetida quatro vezes divergia.
teste('acessos: normaliza pelo catálogo', /normalizarAreas\(/.test(acessos))
teste('acessos: distingue vazio de bloqueado', /sem_restricao/.test(acessos))
teste('acessos: diz o que ignorou', /ignoradas/.test(acessos))

// ── O portão das rotas do backoffice ─────────────────────────────────────────
const sessao = ler('lib/backoffice-sessao.ts')
// 401 sem sessão, 403 com sessão e sem papel. A distinção diz ao cliente se manda entrar ou se
// explica que não há acesso — e é a diferença entre um ecrã de login e um beco.
teste('portão: 401 sem sessão', /status: 401/.test(sessao))
teste('portão: 403 sem capacidade', /status: 403/.test(sessao))
// `bo.entrar` é condição de base de tudo: mesmo que um dia alguém dê uma capacidade sem ela.
teste('portão: exige sempre bo.entrar', /pode\(ctx\.capacidades, 'bo\.entrar'\)/.test(sessao))
// Devolve o CONTEXTO e não um booleano: quem escreve a rota fica com o âmbito de leitura na mão, que
// é onde está o filtro. Uma rota que só pergunta «pode?» consulta a base sem filtro e passa o teste.
teste('portão: devolve o contexto', /Promise<ContextoBackoffice \| NextResponse>/.test(sessao))
// Admin desactivado não é admin — mesma regra do `verifyAdminAccess`, escrita no mesmo sítio.
teste('portão: admin inactivo não é admin', /user_type === 'admin' && perfil\?\.is_active === true/.test(sessao))
// A id nunca vem do cliente: vem de `userIdDoPedido`, que valida token ou cookie.
teste('portão: a id vem da sessão', /userIdDoPedido/.test(sessao))
teste('portão: não lê user_id do corpo', !/body\.user_id/.test(sessao))

// ── O painel do admin não toca no MLM que já paga ────────────────────────────
// O MLM binário paga hoje. Acrescenta-se ao lado; uma avaria no painel novo não pode parar a árvore.
const painel = ler('components/admin/backoffice-equipa.tsx')
teste('painel: não mexe em mlm_nodes', !/mlm_nodes|mlm_commissions/.test(painel))
teste('painel: só fala com as rotas do backoffice', !/\/api\/admin\/mlm\//.test(painel))
// O erro aparece: uma lista vazia por falha de leitura é indistinguível de «não há ninguém».
teste('painel: mostra o erro de leitura', /setErro\(res\.error/.test(painel))
// Tirar um papel pede confirmação: um clique distraído numa lista comprida fecha o acesso ao dinheiro.
teste('painel: confirma antes de tirar papel', /confirm\(/.test(painel))

// ── As PÁGINAS do backoffice usam a mesma fechadura das rotas ────────────────
//
// Uma página que decidisse com um `if (pode(...))` escrito à mão criava uma SEGUNDA definição de
// «pode entrar» — e a que fosse corrigida um dia seria uma só. Por isso todas passam por
// `abrirPagina`, que chama o mesmo `exigirCapacidade`.
const PAGINAS: Array<[string, string]> = [
  ['app/backoffice/extracto/page.tsx', 'bo.extracto_proprio'],
  ['app/backoffice/pipeline/page.tsx', 'bo.pipeline_proprio'],
  ['app/backoffice/tarefas/page.tsx', 'bo.tarefas_proprias'],
  // A equipa abre com `bo.equipa_ver` — a MESMA capacidade com que o menu mostra o link. Abrir
  // com outra deixava no menu um link para uma página que recusa.
  ['app/backoffice/equipa/page.tsx', 'bo.equipa_ver'],
  ['app/backoffice/material/page.tsx', 'bo.material'],
]
for (const [caminho, capacidade] of PAGINAS) {
  const src = ler(caminho)
  const nome = caminho.split('/').slice(-2)[0]
  teste(`página ${nome}: exige a capacidade ${capacidade}`, src.includes(`abrirPagina('${capacidade}')`))
  // E RECUSA. Uma página que chama a fechadura e ignora o resultado parece protegida e não está.
  teste(`página ${nome}: recusa quem não pode`, /if \(!acesso\.ok\)/.test(src) && /<SemAcesso/.test(src))
  // O âmbito é uma LISTA, e é essa lista que filtra. Um `if (é team leader)` esquece-se do filtro.
  if (['extracto', 'pipeline', 'tarefas'].includes(nome)) {
    // O âmbito vem por `ambitoDaPagina`, que resolve a equipa e a capacidade na ordem certa. Uma
    // página que voltasse a chamar `ambitoDeLeitura` à mão passava ao lado dos liderados — que é
    // exactamente o estado em que isto esteve depois da migração 131.
    teste(`página ${nome}: filtra pelo âmbito da equipa`, /ambitoDaPagina\(/.test(src))
    teste(`página ${nome}: não monta o âmbito à mão`, !/ambitoDeLeitura\(/.test(src))
    teste(`página ${nome}: não adivinha a equipa`, !/mlm_tree|team_leader_id.*===.*userId/.test(src))
    // DE QUEM É A LINHA. Com a equipa ligada, estas páginas passaram a mostrar linhas de outras
    // pessoas — e uma lista dessas sem nome é uma lista que o responsável não consegue usar: vê
    // que há trabalho, não sabe a quem ir falar. Os nomes vêm por `nomesDe`, que só resolve os ids
    // que já estão no âmbito; uma página a ler `profiles` por sua conta acabava, um dia, a resolver
    // um id vindo de outro sítio.
    teste(`página ${nome}: diz de quem é a linha`, /nomesDe\(/.test(src))
    teste(`página ${nome}: não lê profiles por sua conta`, !/from\('profiles'\)/.test(src))
  }
}

// ── As escritas das tarefas ──────────────────────────────────────────────────
//
// Criar, riscar, reabrir, cancelar e mudar o prazo. O dono verifica-se NA CONSULTA e pela LISTA do
// âmbito (`.in('responsavel_id', ids)`), não por um `if (tarefa.responsavel_id !== ctx.userId)` —
// que faria o mesmo até alguém reordenar o código — e não por um `.eq(ctx.userId)`, que fechava o
// responsável de equipa fora das tarefas da equipa dele.
const tarefas = ler('app/api/backoffice/tarefas/route.ts')
teste('tarefas: passa pelo portão das capacidades', /exigirCapacidade\(request, 'bo\.tarefas_proprias'\)/.test(tarefas))
teste('tarefas: recusa devolvendo a resposta do portão', /if \(ctx instanceof NextResponse\) return ctx/.test(tarefas))
teste('tarefas: o âmbito vem da equipa, não de um `if`', /ambitoDaEquipa\(supabase, ctx, 'tarefas'\)/.test(tarefas))
teste('tarefas: o dono entra na consulta pela lista', /\.in\('responsavel_id', ids\)/.test(tarefas))
// A lista entra na LEITURA e na ESCRITA. Filtrar só a leitura deixava o update a confiar no id do
// corpo, e um id de outra pessoa passava.
teste('tarefas: a lista filtra leitura e escrita', (tarefas.match(/\.in\('responsavel_id', ids\)/g) ?? []).length >= 2)
// Um âmbito vazio não pergunta nada à base: `.in(..., [])` devolveria vazio, mas essa decisão é
// nossa e não do PostgREST.
teste('tarefas: âmbito vazio não consulta', /!ambito\.todos && ids\.length === 0/.test(tarefas))
// Dar trabalho a outra pessoa é de quem responde pela equipa, e a regra vive na lib (testável sem
// base). A rota tem de a chamar, e passar-lhe a capacidade — não decidir por si.
teste('tarefas: quem é responsável decide-se na lib', /validarTarefaNova\(/.test(tarefas))
teste('tarefas: a rota não aceita o responsável às cegas', /temAmbitoEquipa: pode\(ctx\.capacidades, 'bo\.tarefas_equipa'\)/.test(tarefas))
teste('tarefas: nada de dono vindo do corpo', !/body\.user_id|body\.pessoa|body\.criado_por/.test(tarefas))
// Ligar uma tarefa a um negócio prova-se contra o âmbito do PIPELINE: pendurar tarefas em negócios
// alheios fazia aparecer trabalho no ecrã de quem os trabalha.
teste('tarefas: o negócio ligado é do âmbito de quem cria', /podeMexerNoNegocio\(/.test(tarefas))
// Só o estado da tarefa se toca. Uma rota do backoffice que escrevesse noutra tabela era uma porta
// nova no meio do dinheiro.
{
  const tabelas = [...new Set([...tarefas.matchAll(/\.from\('([^']+)'\)/g)].map((m) => m[1]))]
  // `vendas_negocios` entra aqui, mas só para LER: é a prova de que o negócio a que se pendura a
  // tarefa é do âmbito de quem a cria.
  teste('tarefas: só fala com as tabelas das tarefas e dos negócios', tabelas.every((t) => t === 'vendas_tarefas' || t === 'vendas_negocios'))
  const negocioSoLeitura = tarefas
    .split("from('vendas_negocios')")
    .slice(1)
    .every((depois) => /^\s*\.select\(/.test(depois) && !/\.(update|insert|upsert|delete)\(/.test(depois.slice(0, 400)))
  teste('tarefas: nunca escreve no negócio', negocioSoLeitura)
}
teste('tarefas: nunca apaga', !/\.delete\(\)/.test(tarefas))
// Id de outra pessoa dá 404 e não 403: 403 confirmava que a tarefa existe.
teste('tarefas: tarefa alheia dá 404', /status: 404/.test(tarefas) && !/status: 403/.test(tarefas))

// ── E as páginas NÃO escrevem ────────────────────────────────────────────────
// O que é dinheiro mostra-se; aprovar e pagar é um acto humano e faz-se no admin.
for (const [caminho] of PAGINAS) {
  const src = ler(caminho)
  const nome = caminho.split('/').slice(-2)[0]
  teste(`página ${nome}: não escreve na base`, !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(src))
}
// A página dos materiais é a excepção declarada: cria o código de referral da PRÓPRIA pessoa se ele
// ainda não existir. É na linha dela, com a id da sessão, e sem isso a página que existe para lhe
// dar o link seria a página que lhe diz que não tem link.
const material = ler('app/backoffice/material/page.tsx')
teste('materiais: o código é o do próprio, pela id da sessão', /getOrCreateReferralCode\(getSupabaseAdmin\(\), ctx\.userId\)/.test(material))
teste('materiais: não inventa um segundo código de afiliado', !/randomCode|novo_codigo/.test(material))

// ── O gerador de materiais: a revisão manda, e mora no servidor ──────────────
//
// As regras da marca postas no cliente seriam regras que qualquer pessoa lê no JavaScript da página
// e contorna com um pedido à mão. E a revisão tem de RECUSAR: mostrar o texto reprovado <<para a
// pessoa decidir>> transforma a guarda num aviso, e um aviso resolve-se com um copiar-colar.
const rotaMaterial = ler('app/api/backoffice/material/route.ts')
teste('gerador: passa pelo portão das capacidades', /exigirCapacidade\(request, 'bo\.material'\)/.test(rotaMaterial))
teste('gerador: revê o que o modelo escreveu', /revistarMaterial\(/.test(rotaMaterial))
teste('gerador: texto reprovado não é devolvido', /status: 422/.test(rotaMaterial) && !/texto,\s*problemas/.test(rotaMaterial))
teste('gerador: a prova só entra se for publicável', /publicavel\(prova\)/.test(rotaMaterial))
teste('gerador: não escreve na base', !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(rotaMaterial))
teste('gerador: tem travão por pessoa', /status: 429/.test(rotaMaterial))
const geradorCliente = ler('app/backoffice/material/gerador.tsx')
teste('gerador: o cliente não conhece preços nem regras de marca', !/escada-precos|pips-proof|NUNCA/.test(geradorCliente))

if (falhas.length) {
  console.error(`backoffice-rotas: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice-rotas: só admin dá papéis, as páginas usam a mesma fechadura, e a equipa só escreve no que o âmbito dela contém ✓')
