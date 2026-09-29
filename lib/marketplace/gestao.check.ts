/**
 * Guarda da separação de papéis no marketplace.
 *
 *   npx tsx lib/marketplace/gestao.check.ts
 *
 * O que está aqui preso é uma frase do dono: «o educador pode ser admin dos produtos DELE APENAS».
 *
 * Quase tudo aqui testa o caso MAU, e é de propósito. Um teste que só prova que o educador A mexe
 * no produto do educador A passa com `return true` no corpo da função — não prova nada. O que
 * interessa é o educador A a tentar mexer no produto do educador B, porque é esse o caso que
 * custa dinheiro e confiança a alguém quando passa.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CAMPOS_DO_EDUCADOR,
  CAMPOS_SO_DO_ADMIN,
  camposPermitidos,
  podeGerir,
  type Quem,
} from './gestao'

const RAIZ = join(__dirname, '..', '..')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const EDUCADOR_A: Quem = { papel: 'educador', adminId: null, educatorId: 'edu-A' }
const EDUCADOR_B: Quem = { papel: 'educador', adminId: null, educatorId: 'edu-B' }
const ADMIN: Quem = { papel: 'admin', adminId: 'admin-1', educatorId: null }

const PRODUTO_DE_A = { educator_id: 'edu-A', dono: 'educador' }
const PRODUTO_DE_B = { educator_id: 'edu-B', dono: 'educador' }
const PRODUTO_DA_CASA = { educator_id: null, dono: 'casa' }

// ══════════════ 1. O CASO BOM, UMA VEZ ══════════════

sim('o educador mexe no produto dele', podeGerir(EDUCADOR_A, PRODUTO_DE_A))
sim('o admin mexe no produto de um educador', podeGerir(ADMIN, PRODUTO_DE_A))
sim('o admin mexe no produto da casa', podeGerir(ADMIN, PRODUTO_DA_CASA))

// ══════════════ 2. OS CASOS MAUS — é para isto que este ficheiro existe ══════════════

assert.ok(
  !podeGerir(EDUCADOR_A, PRODUTO_DE_B),
  'UM EDUCADOR NÃO MEXE NO PRODUTO DE OUTRO. É a frase do dono e é a razão deste ficheiro existir.',
)
sim('e ao contrário também não', !podeGerir(EDUCADOR_B, PRODUTO_DE_A))

assert.ok(
  !podeGerir(EDUCADOR_A, PRODUTO_DA_CASA),
  'um educador não mexe num produto da casa — facturava um scanner da MTM',
)

// Um produto da casa marcado (por engano ou de propósito) com o educator_id dele continua fechado:
// o `dono` manda mais do que a coluna. Isto fecha a porta a um produto mal escrito virar uma via
// de acesso.
sim(
  'dono=casa fecha a porta mesmo com o educator_id dele lá dentro',
  !podeGerir(EDUCADOR_A, { educator_id: 'edu-A', dono: 'casa' }),
)

// Sem educador no produto não há dono a quem corresponder.
sim('um produto sem educador não é de educador nenhum', !podeGerir(EDUCADOR_A, { educator_id: null, dono: 'educador' }))

// Sem sessão não se mexe em nada.
sim('sem sessão não se mexe no produto de ninguém', !podeGerir(null, PRODUTO_DE_A))
sim('sem sessão nem no da casa', !podeGerir(undefined, PRODUTO_DA_CASA))
sim('um produto que não existe não se gere', !podeGerir(ADMIN, null))

// O lixo não abre portas. `undefined === undefined` seria `true` num `===` descuidado, e é
// exactamente assim que um educador sem id mexeria num produto sem dono.
sim('dois ids vazios não são a mesma pessoa', !podeGerir(
  { papel: 'educador', adminId: null, educatorId: '' } as Quem,
  { educator_id: '', dono: 'educador' },
))
sim('nem dois nulos', !podeGerir(
  { papel: 'educador', adminId: null, educatorId: null as unknown as string } as Quem,
  { educator_id: null, dono: 'educador' },
))

// ══════════════ 3. OS CAMPOS QUE O EDUCADOR NÃO TOCA ══════════════
//
// Estes cinco são o contrato dele, não um formulário. Ver o comentário em `gestao.ts`.

{
  const doEducador = camposPermitidos('educador')
  const doAdmin = camposPermitidos('admin')

  for (const campo of CAMPOS_SO_DO_ADMIN) {
    assert.ok(
      !doEducador.includes(campo),
      `o educador NÃO pode escrever '${campo}' — é acordo da casa, não campo de formulário`,
    )
    sim(`o admin pode escrever '${campo}'`, doAdmin.includes(campo))
  }

  // A mais importante das cinco, dita pelo nome para não se perder numa lista.
  assert.ok(
    !doEducador.includes('partilha_pct'),
    'a partilha não se edita do lado do educador: cada um escrevia 95 no próprio contrato',
  )
  assert.ok(!doEducador.includes('dono'), 'o educador não decide que um produto é da casa')
  assert.ok(!doEducador.includes('activo'), 'o interruptor do dono é do dono')
  assert.ok(
    !doEducador.includes('checkout_externo_url'),
    'só a casa aponta um comprador para fora do marketplace',
  )

  // O estado nunca está em lista nenhuma: publicar é um acto de revisão, pedido pela `accao`.
  for (const proibido of ['estado', 'publicado_em', 'motivo_recusa', 'revisto_por', 'educator_id', 'id', 'slug']) {
    sim(`'${proibido}' não se escreve por via nenhuma`, !doAdmin.includes(proibido))
  }

  // O que o educador PODE, para a guarda não passar por estar tudo fechado.
  for (const campo of ['titulo', 'descricao', 'preco_cents', 'campanha_pct'] as const) {
    sim(`o educador pode escrever '${campo}'`, doEducador.includes(campo))
  }
  sim('as duas listas não se sobrepõem', !CAMPOS_DO_EDUCADOR.some((c) => (CAMPOS_SO_DO_ADMIN as readonly string[]).includes(c)))
}

// ══════════════ 4. AS ROTAS USAM A GUARDA ══════════════
//
// A verificação acima é inútil se uma rota nova for buscar o produto por `id` e não perguntar nada.
// Esta varredura é o que impede isso — é a mesma ideia do `centro.check.ts`, que falha quando um
// handler do Centro aparece sem `soAdmin`.

{
  const PASTA = join(RAIZ, 'app/api/marketplace')
  const rotas: string[] = []
  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) varrer(caminho)
      else if (nome === 'route.ts') rotas.push(caminho)
    }
  }
  varrer(PASTA)
  sim('encontrou rotas do marketplace para varrer', rotas.length > 0)

  for (const caminho of rotas) {
    const fonte = readFileSync(caminho, 'utf8')
    const curto = caminho.slice(RAIZ.length + 1)

    // Uma rota que escreve em `marketplace_produtos` tem de passar por `produtoSobGestao` (que
    // confirma o direito) ou ser uma rota de admin embrulhada em `soAdmin`.
    const escreve = /\.from\(['"]marketplace_produtos['"]\)[\s\S]{0,200}?\.(update|delete|insert)\(/.test(fonte)
    if (escreve) {
      assert.ok(
        /produtoSobGestao|soAdmin/.test(fonte),
        `${curto} escreve em marketplace_produtos sem passar pela guarda de gestão — é assim que um educador acaba a editar o produto de outro`,
      )
    }

    // E nenhuma rota de compra pode esquecer o travão da Apple.
    if (/checkout|comprar/i.test(curto)) {
      assert.ok(
        /isIosAppRequest\(/.test(fonte),
        `${curto} é um caminho de compra e não trava a app iOS (Guideline 3.1.1)`,
      )
    }
  }
}

// ══════════════ 5. A ROTA DE GESTÃO NÃO DEIXA UM EDUCADOR SAIR DA SUA PRATELEIRA ══════════
//
// A rota antiga (`educator-auth/marketplace`) protegia-se filtrando por `educator_id` em cada
// query, e foi substituída pela rota única `/api/marketplace/gestao`, que serve o educador e o
// admin com direitos diferentes. O filtro continua a ter de lá estar — não por desconfiança da
// verificação em memória, mas porque uma verificação que se pode contornar reordenando linhas de
// código não é uma garantia, e um filtro no WHERE é.

{
  const ROTA = readFileSync(join(RAIZ, 'app/api/marketplace/gestao/route.ts'), 'utf8')

  assert.ok(
    !/educator_id:\s*(b|body|corpo)\./.test(ROTA),
    'o educator_id NUNCA pode vir do corpo do pedido — é o caminho directo para criar ou editar em nome de outro',
  )
  sim('a identidade vem de quemGere()', /quemGere\(\)/.test(ROTA))
  sim('o produto vem sempre pela guarda', /produtoSobGestao\(/.test(ROTA))
  sim('os campos vêm da lista do papel', /camposPermitidos\(/.test(ROTA))

  // Cinto e suspensórios: todo o update/delete que a rota faz tem de ter o filtro do educador.
  for (const verbo of ['update', 'delete']) {
    const temFiltro = new RegExp(
      `\\.${verbo}\\(([\\s\\S]{0,200}?)\\)[\\s\\S]{0,600}?papel === 'educador'[\\s\\S]{0,200}?eq\\('educator_id'`,
    ).test(ROTA)
    assert.ok(temFiltro, `o ${verbo} da rota de gestão tem de filtrar por educator_id quando quem chama é educador`)
  }

  // E o 404 em vez do 403, para não confirmar a existência do produto de outra pessoa.
  sim('recusa com 404 e não 403', /status: 404/.test(ROTA) && /naoEncontrado/.test(ROTA))

  // ── A periodicidade e a galeria (157) ──────────────────────────────────────────────────
  //
  // As duas colunas novas são do EDUCADOR — é ele que sabe se a mentoria dele é mensal ou anual, e
  // foi a falta dessa resposta que fez a montra escrever «/mês» num produto anual.
  sim('a periodicidade é um campo do educador', CAMPOS_DO_EDUCADOR.includes('periodicidade'))
  sim('a galeria é um campo do educador', CAMPOS_DO_EDUCADOR.includes('imagens'))
  // E não do admin em exclusivo: se estivesse nas duas listas, o educador perdia-as num refactor
  // que tirasse a duplicação pela lista errada.
  sim('nenhuma das duas é exclusiva do admin', !CAMPOS_SO_DO_ADMIN.some((c) => c === 'periodicidade' || c === 'imagens'))

  // O SERVIDOR é que garante a coerência, e não o formulário. Um ecrã pode mandar `recorrente:false`
  // com `periodicidade:'anual'`, e é a restrição `marketplace_produtos_periodicidade_coerente` (157)
  // que rebenta — com um erro do Postgres à frente de quem está a editar, se a rota não limpar antes.
  sim('a rota força a coerência da periodicidade', /periodicidadeParaGravar\(/.test(ROTA))
  sim('e nos dois caminhos: criar e editar', (ROTA.match(/periodicidadeParaGravar\(/g) ?? []).length >= 2)
  // O tecto de 8 e a capa fora da galeria, no servidor. A versão do ecrã existe para a pessoa VER o
  // que vai gravar; esta existe para valer a quem não passe por esse ecrã (a app, uma importação).
  sim('a rota limpa a galeria', /galeriaParaGravar\(/.test(ROTA))
  sim('e nos dois caminhos: criar e editar', (ROTA.match(/galeriaParaGravar\(/g) ?? []).length >= 2)
  // A capa que conta é a que FICA depois desta gravação, e não a que veio no corpo: ler só o corpo
  // deixava a capa a repetir-se na galeria de todos os produtos a que alguém trocasse a capa.
  sim('a galeria é limpa contra a capa final', /capaFinal/.test(ROTA))
}

// ── Relatório ─────────────────────────────────────────────────────────────────────────────

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) da separação de papéis partida(s)`)
console.log(`✅ marketplace/gestão: ${ok} verificações passaram`)
