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

if (falhas.length) {
  console.error(`backoffice-rotas: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice-rotas: só admin escreve, retirar deixa rasto, e nenhuma password passa por aqui ✓')
