/**
 * A GUARDA DA ATRIBUIÇÃO DE RECEITA.
 *
 *   npx tsx lib/agentes/receita.check.ts
 *
 * Esta é a decisão mais perigosa de todo o conjunto, porque alimenta a regra que MATA agentes. Um
 * erro aqui não rebenta: dá a receita ao agente errado, e o errado sobrevive enquanto o certo é
 * parado com um motivo que parece sólido.
 *
 * O que se prova é sobretudo o caso mau — e o pior de todos é a tentação de repartir o que não se
 * sabe. A regra do dono é que receita não atribuível NÃO se inventa nem se divide.
 */
import {
  atribuirReceita,
  centsParaUnidade,
  normalizarCodigo,
  type AgenteParaReceita,
  type MotivoPorAtribuir,
  type VendaParaAtribuir,
} from './receita'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGENTES: AgenteParaReceita[] = [
  { id: 'formacao', nome: 'Vendas de Formação', chaveReceita: 'AG-FORMACAO' },
  { id: 'saas', nome: 'Produto SaaS', chaveReceita: 'AG-SAAS' },
  { id: 'semchave', nome: 'Analista de Scanners', chaveReceita: null },
]

const venda = (p: Partial<VendaParaAtribuir> = {}): VendaParaAtribuir => ({
  id: 'stripe:cs_1', valorCents: 10_000, moeda: 'EUR', ...p,
})

const motivo = (r: ReturnType<typeof atribuirReceita>, m: MotivoPorAtribuir) =>
  r.porAtribuir.find((x) => x.motivo === m)

// ── O caso que funciona ─────────────────────────────────────────────────────
{
  const r = atribuirReceita(
    [venda({ codigo: 'AG-FORMACAO', ligacao: 'na_compra' }), venda({ id: 's2', valorCents: 5_000, codigo: 'AG-SAAS', ligacao: 'na_compra' })],
    AGENTES,
  )
  teste('cada código vai para o seu agente', r.porAgente.length === 2)
  teste('e com o valor certo', r.porAgente.find((a) => a.agenteId === 'formacao')?.cents === 10_000)
  teste('o atribuído soma tudo', r.atribuidoCents === 15_000)
  teste('e nada fica por atribuir', r.naoAtribuidoCents === 0)
  teste('a ordem é do maior para o menor', r.porAgente[0].agenteId === 'formacao')
}

/**
 * ── O CASO MAU PRINCIPAL: DOIS AGENTES COM A MESMA CHAVE ────────────────────
 *
 * É aqui que dá mais vontade de dividir a meias, e é exactamente o que não se faz. Dividir
 * transformava um erro de configuração — duas `chave_receita` iguais — em dois números credíveis, e
 * ninguém voltava a olhar para a causa. Assim fica a doer no painel até alguém corrigir a chave.
 */
{
  const duplicados: AgenteParaReceita[] = [
    { id: 'a', nome: 'Um', chaveReceita: 'AG-IGUAL' },
    { id: 'b', nome: 'Dois', chaveReceita: 'AG-IGUAL' },
  ]
  const r = atribuirReceita([venda({ codigo: 'AG-IGUAL', ligacao: 'na_compra' })], duplicados)

  teste('chave duplicada não dá receita a ninguém', r.porAgente.length === 0)
  teste('e NÃO se divide a meias', r.atribuidoCents === 0)
  teste('fica tudo por atribuir', r.naoAtribuidoCents === 10_000)
  teste('com o motivo certo', motivo(r, 'codigo_de_varios_agentes')?.cents === 10_000)
  teste('e o motivo manda corrigir a chave', (motivo(r, 'codigo_de_varios_agentes')?.porque ?? '').includes('corrige'))
}

// ── Sem código, e com código que ninguém reclama ────────────────────────────
{
  const r = atribuirReceita(
    [
      venda({ id: 's1', valorCents: 3_000 }),                                     // sem código
      venda({ id: 's2', valorCents: 4_000, codigo: '', ligacao: null }),          // código vazio
      venda({ id: 's3', valorCents: 7_000, codigo: 'NATAL2024', ligacao: 'na_compra' }), // de ninguém
    ],
    AGENTES,
  )
  teste('vendas sem código ficam por atribuir', motivo(r, 'sem_codigo')?.cents === 7_000)
  teste('e contam-se duas', motivo(r, 'sem_codigo')?.vendas === 2)
  teste('código desconhecido fica por atribuir', motivo(r, 'codigo_desconhecido')?.cents === 7_000)
  teste('nenhum agente recebeu nada', r.atribuidoCents === 0)
  teste('o líquido conta todo o dinheiro real', r.liquidoCents === 14_000)
}

/**
 * ── UM AGENTE SEM CHAVE NÃO RECEBE POR SIMPATIA ─────────────────────────────
 * Era a porta de entrada para «este parece ser o dono disto».
 */
{
  const r = atribuirReceita([venda({ codigo: 'AG-FORMACAO', ligacao: 'na_compra' })], AGENTES)
  teste('o agente sem chave fica a zero', !r.porAgente.some((a) => a.agenteId === 'semchave'))
}

/**
 * ── ESTORNOS: DINHEIRO QUE VOLTOU PARA TRÁS NÃO É RECEITA ───────────────────
 *
 * O caso mau: um agente que vendeu 100 € e foi todo devolvido aparecia com 100 € de receita e
 * sobrevivia um mês à custa de dinheiro que a casa já tinha perdido.
 */
{
  const r = atribuirReceita(
    [
      venda({ id: 's1', valorCents: 10_000, estornada: true, estornoCents: 10_000, codigo: 'AG-FORMACAO', ligacao: 'na_compra' }),
      venda({ id: 's2', valorCents: 10_000, estornoCents: 4_000, codigo: 'AG-FORMACAO', ligacao: 'na_compra' }),
    ],
    AGENTES,
  )
  teste('venda devolvida por inteiro não conta', r.porAgente[0]?.cents === 6_000)
  teste('o estorno parcial desconta-se', r.liquidoCents === 6_000)
  teste('e a devolvida aparece como estornada', motivo(r, 'estornada')?.vendas === 1)

  /**
   * Um estorno MAIOR do que a venda é erro de dados. Deixá-lo passar dava receita NEGATIVA — ou
   * seja, matava o agente por uma devolução mal gravada.
   */
  const absurdo = atribuirReceita(
    [venda({ valorCents: 5_000, estornoCents: 9_000, codigo: 'AG-FORMACAO', ligacao: 'na_compra' })],
    AGENTES,
  )
  teste('estorno maior que a venda não dá receita negativa', absurdo.atribuidoCents === 0)
  teste('nem líquido negativo', absurdo.liquidoCents === 0)
}

/**
 * ── MOEDA DIFERENTE NÃO SE CONVERTE ─────────────────────────────────────────
 *
 * Converter exige uma taxa, e uma taxa inventada é um número inventado. O dinheiro existe, por isso
 * entra no líquido; mas não é atribuído a ninguém, e o motivo di-lo.
 */
{
  const r = atribuirReceita(
    [venda({ valorCents: 10_000, moeda: 'USD', codigo: 'AG-FORMACAO', ligacao: 'na_compra' })],
    AGENTES,
  )
  teste('venda em USD não é atribuída', r.atribuidoCents === 0)
  teste('mas o dinheiro conta no líquido', r.liquidoCents === 10_000)
  teste('e diz que falta a taxa de câmbio', (motivo(r, 'moeda_diferente')?.porque ?? '').includes('câmbio'))

  // EUR em minúsculas, ou com espaços, é EUR. Não se perde receita por causa disso.
  const minusculas = atribuirReceita([venda({ moeda: ' eur ', codigo: 'AG-FORMACAO', ligacao: 'na_compra' })], AGENTES)
  teste('«eur» com espaços é EUR', minusculas.atribuidoCents === 10_000)
}

// ── Valores ilegíveis não se somam ──────────────────────────────────────────
{
  const r = atribuirReceita(
    [
      venda({ valorCents: Number.NaN, codigo: 'AG-FORMACAO', ligacao: 'na_compra' }),
      venda({ id: 's2', valorCents: 'muito' as unknown as number, codigo: 'AG-FORMACAO', ligacao: 'na_compra' }),
    ],
    AGENTES,
  )
  teste('valor ilegível não entra no líquido', r.liquidoCents === 0)
  teste('nem é atribuído', r.atribuidoCents === 0)
  teste('e é contado como ilegível', motivo(r, 'valor_ilegivel')?.vendas === 2)
}

/**
 * ── A FORÇA DA LIGAÇÃO VIAJA ATÉ AO PAINEL ──────────────────────────────────
 *
 * `profiles.coupon_code` é por PESSOA e é sobrescrito pelo último código que ela usar. Uma receita
 * toda construída a partir disso é frágil, e quem olha para o painel tem de o saber — senão lê um
 * número exacto onde só há um indício.
 */
{
  const r = atribuirReceita(
    [
      venda({ id: 's1', valorCents: 6_000, codigo: 'AG-FORMACAO', ligacao: 'na_compra' }),
      venda({ id: 's2', valorCents: 4_000, codigo: 'AG-FORMACAO', ligacao: 'no_perfil' }),
    ],
    AGENTES,
  )
  const a = r.porAgente[0]
  teste('o total soma as duas', a.cents === 10_000)
  teste('e separa a ligação exacta', a.centsFortes === 6_000)
  teste('da ligação fraca', a.centsFracos === 4_000)
  teste('as duas partes fecham com o total', a.centsFortes + a.centsFracos === a.cents)
}

/**
 * ── AS CONTAS FECHAM SEMPRE ─────────────────────────────────────────────────
 *
 * `atribuido + naoAtribuido === liquido`, em qualquer mistura. Se isto não fechasse, o painel
 * mostrava um buraco e ninguém saberia se era receita perdida ou um erro de soma.
 */
{
  const r = atribuirReceita(
    [
      venda({ id: '1', valorCents: 10_000, codigo: 'AG-FORMACAO', ligacao: 'na_compra' }),
      venda({ id: '2', valorCents: 2_500 }),
      venda({ id: '3', valorCents: 3_000, codigo: 'DESCONHECIDO', ligacao: 'na_compra' }),
      venda({ id: '4', valorCents: 1_000, moeda: 'GBP', codigo: 'AG-SAAS', ligacao: 'na_compra' }),
      venda({ id: '5', valorCents: 9_000, estornada: true, estornoCents: 9_000 }),
      venda({ id: '6', valorCents: 4_000, codigo: 'AG-SAAS', ligacao: 'no_perfil' }),
    ],
    AGENTES,
  )
  teste('as contas fecham', r.atribuidoCents + r.naoAtribuidoCents === r.liquidoCents)
  teste('o líquido exclui a venda devolvida', r.liquidoCents === 20_500)
  teste('e há dinheiro por atribuir para mostrar', r.naoAtribuidoCents > 0)
  teste('a moeda declarada é o euro', r.moeda === 'EUR')
}

// ── Nada de nada não rebenta nem inventa ────────────────────────────────────
{
  const vazio = atribuirReceita([], AGENTES)
  teste('sem vendas, tudo a zero', vazio.liquidoCents === 0 && vazio.porAgente.length === 0)
  teste('sem vendas não há motivos', vazio.porAtribuir.length === 0)

  const semAgentes = atribuirReceita([venda({ codigo: 'AG-FORMACAO', ligacao: 'na_compra' })], [])
  teste('sem agentes, nada é atribuído', semAgentes.atribuidoCents === 0)
  teste('e o dinheiro aparece como de código desconhecido', motivo(semAgentes, 'codigo_desconhecido')?.cents === 10_000)
}

// ── Normalizar o código ─────────────────────────────────────────────────────
{
  teste('maiúsculas e espaços são o mesmo código', normalizarCodigo(' ag-site ') === 'AG-SITE')
  teste('nulo é vazio', normalizarCodigo(null) === '')

  // E isto tem de valer na atribuição, senão perdia-se receita por um espaço a mais.
  const r = atribuirReceita([venda({ codigo: ' ag-formacao ', ligacao: 'na_compra' })], AGENTES)
  teste('o código minúsculo com espaços atribui-se', r.porAgente[0]?.agenteId === 'formacao')
}

// ── Cêntimos para euros ─────────────────────────────────────────────────────
{
  teste('10000 cêntimos são 100 €', centsParaUnidade(10_000) === 100)
  teste('1 cêntimo é 0,01 €', centsParaUnidade(1) === 0.01)
  teste('lixo é zero', centsParaUnidade(Number.NaN) === 0)
}

if (falhas.length) {
  console.error(`agentes/receita: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'agentes/receita: o que não é atribuível não se divide, estornos não contam, e as contas fecham ✓',
)
