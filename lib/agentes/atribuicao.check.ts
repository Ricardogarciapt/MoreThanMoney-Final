/**
 * A GUARDA DA ATRIBUIÇÃO DOS AGENTES.
 *
 *   npx tsx lib/agentes/atribuicao.check.ts
 *
 * Dois casos maus, e os dois custam dinheiro sem dar erro:
 *   · um cupão de DESCONTO passar por código de agente — e creditar receita a quem não a trouxe;
 *   · um clique antigo creditar uma compra que já nada tem a ver com ele.
 */
import {
  CHAVE_GUARDADA, JANELA_MS, PARAMETRO, codigoQueVale, linkDoAgente, normalizar,
  oQueGuardar, pareceCodigoDeAgente,
} from './atribuicao'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }
const AGORA = Date.parse('2026-10-01T16:00:00Z')

// ── O CASO MAU: um cupão de desconto a passar por agente ────────────────────
{
  /**
   * Estes existem mesmo na tabela `coupons`. Sem o teste de forma, `?ag=CREATOR60` era aceite, o
   * checkout encontrava-o, e a receita de uma campanha de descontos ficava creditada a um agente
   * que não fez nada — e a regra de vida salvava-o com dinheiro que não era dele.
   */
  for (const cupao of ['CREATOR60', 'MTMCREATOR', 'BLACKFRIDAY50', 'DESCONTO10', 'VIP', 'MTM-FUNDED30']) {
    teste(`«${cupao}» não é código de agente`, !pareceCodigoDeAgente(cupao))
    teste(`«${cupao}» não se normaliza`, normalizar(cupao) === null)
  }

  // E os verdadeiros passam, nas duas famílias.
  for (const bom of ['AG-TRADER', 'AG-SCANNER', 'AG-LMS', 'AG-FORMACAO', 'AG-SAAS', 'AG-SITE', 'CEO-MTM']) {
    teste(`«${bom}» é código de agente`, pareceCodigoDeAgente(bom))
  }

  // Maiúsculas e espaços não são um código diferente.
  teste('minúsculas normalizam-se', normalizar('  ag-formacao ') === 'AG-FORMACAO')
  // Mas o que é parecido e não é, não entra.
  // 06/10: os códigos dos filhos da reprodução automática têm de passar — senão o `?ag=` deles
  // perdia-se no browser e o filho morria com vendas feitas.
  for (const filho of ['AG-SETTER-1', 'AG-SETTER-1-2', 'AG-CEO-MTM-1', 'ag-formacao-3']) {
    teste(`«${filho}» (filho) é código de agente`, pareceCodigoDeAgente(filho))
  }
  teste('o filho normaliza-se em maiúsculas', normalizar(' ag-setter-1 ') === 'AG-SETTER-1')
  for (const mau of ['AG-SETTER-', 'AG-SETTER--1', 'AG-SETTER-1-2-3-4-5-6', 'AG-' + 'X'.repeat(24) + '-' + 'Y'.repeat(24)]) {
    teste(`«${mau}» (forma de filho partida ou longa demais) não entra`, !pareceCodigoDeAgente(mau))
  }
  for (const mau of ['AG-', 'AG', 'CEO', 'XX-TRADER', 'AG_TRADER', 'AG-TRADER; DROP', 'AG-ÇÃO', '']) {
    teste(`«${mau}» não entra`, !pareceCodigoDeAgente(mau))
  }
  teste('nulo não entra', !pareceCodigoDeAgente(null) && normalizar(undefined) === null)
}

// ── A JANELA ────────────────────────────────────────────────────────────────
{
  const ontem = { codigo: 'AG-FORMACAO', em: AGORA - 24 * 3600_000 }
  teste('um clique de ontem vale', codigoQueVale(ontem, AGORA) === 'AG-FORMACAO')

  const noLimite = { codigo: 'AG-LMS', em: AGORA - JANELA_MS + 60_000 }
  teste('no último dia ainda vale', codigoQueVale(noLimite, AGORA) === 'AG-LMS')

  /**
   * O SEGUNDO CASO MAU. Um clique de há três meses a creditar a compra de hoje dá a um agente
   * receita que ele não trouxe — e a regra de vida salva-o com ela.
   */
  const velho = { codigo: 'AG-SAAS', em: AGORA - JANELA_MS - 1000 }
  teste('passada a janela, já não vale', codigoQueVale(velho, AGORA) === null)

  // Relógio trocado não dá janela eterna.
  teste('um clique no futuro não vale', codigoQueVale({ codigo: 'AG-SITE', em: AGORA + 86_400_000 }, AGORA) === null)
  teste('sem data não vale', codigoQueVale({ codigo: 'AG-SITE', em: 0 }, AGORA) === null)
  teste('sem nada guardado não vale', codigoQueVale(null, AGORA) === null)
  // Um código inválido guardado (por mão alheia no browser) também não passa.
  teste('lixo guardado não vale', codigoQueVale({ codigo: 'CREATOR60', em: AGORA }, AGORA) === null)
}

// ── O que se guarda ─────────────────────────────────────────────────────────
{
  teste('um link com código guarda-o', oQueGuardar('AG-TRADER', AGORA)?.codigo === 'AG-TRADER')
  teste('e com a hora do clique', oQueGuardar('AG-TRADER', AGORA)?.em === AGORA)
  /**
   * Um link SEM código não apaga o que lá estava. Se apagasse, bastava a pessoa abrir qualquer
   * outra página do site entre o clique e a compra para a atribuição desaparecer — ou seja, quase
   * sempre.
   */
  teste('um link sem código não manda apagar nada', oQueGuardar(null, AGORA) === null)
  teste('um cupão de desconto no link não se guarda', oQueGuardar('CREATOR60', AGORA) === null)
}

// ── Os links ────────────────────────────────────────────────────────────────
{
  const S = 'https://www.morethanmoney.pt'
  teste('link simples',
    linkDoAgente(S, '/marketplace/bootcamp-morethanmoney', 'AG-FORMACAO')
      === `${S}/marketplace/bootcamp-morethanmoney?ag=AG-FORMACAO`)
  // Um caminho que já tem query não fica com dois «?».
  teste('caminho com query usa «&»',
    linkDoAgente(S, '/upgrade?plan=premium_annual', 'AG-FORMACAO')
      === `${S}/upgrade?plan=premium_annual&ag=AG-FORMACAO`)
  teste('origem com barra no fim não duplica',
    linkDoAgente(`${S}/`, 'scanner', 'AG-SCANNER') === `${S}/scanner?ag=AG-SCANNER`)
  // Um código inválido não produz um link que finge atribuir.
  teste('código inválido dá o link sem parâmetro',
    linkDoAgente(S, '/scanner', 'CREATOR60') === `${S}/scanner`)
}

// ── As constantes ───────────────────────────────────────────────────────────
teste('a janela são 30 dias', JANELA_MS === 30 * 24 * 3600_000)
teste('o parâmetro é curto', PARAMETRO === 'ag')
teste('a chave guardada tem prefixo da casa', CHAVE_GUARDADA.startsWith('mtm_'))

if (falhas.length) {
  console.error(`agentes/atribuicao: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('agentes/atribuicao: um cupão de desconto nunca passa por agente, e a janela são 30 dias ✓')
