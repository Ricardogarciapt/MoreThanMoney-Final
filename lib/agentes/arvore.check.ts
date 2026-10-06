/**
 * A GUARDA DA ÁRVORE DA EQUIPA.
 *
 *   npx tsx lib/agentes/arvore.check.ts
 *
 * Tudo o que este ficheiro decide erra DESENHADO: a árvore fica bonita com um filho a menos, o
 * relógio fica bonito a contar para o lado errado, e o agente parado fica bonito a verde. Nenhum
 * destes casos dá erro no ecrã — e os três levam o dono a parar o agente errado. Por isso a guarda
 * passa a maior parte do tempo no CASO MAU.
 */
import {
  CORTES_DA_ESCALA, achatar, escalaDeVida, estadoNoEcra, montarArvore, relogioDoJuizo,
  resumoDaEquipa, textoDoPilar, type FactosDaEscala, type NoBruto,
} from './arvore'
import { CARENCIA_HORAS, GRACA_HORAS, julgar } from './vida'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGORA = new Date('2026-10-03T12:00:00Z')
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

type Linha = NoBruto & { receita?: number | null }
const ag = (p: Partial<Linha> & { id: string }): Linha => ({
  nome: 'Agente ' + p.id, pilar: 'trading', estado: 'vivo', pausado: false,
  criado_em: haHoras(72), pai_id: null, receita: 0, ...p,
})

// ═══ A EQUIPA REAL: CEO + seis filhos por três pilares ═══════════════════════════════════════
{
  const equipa: Linha[] = [
    ag({ id: 'ceo', nome: 'CEO', pilar: 'ceo', pai_id: null }),
    ag({ id: 't1', nome: 'Trader Papel', pilar: 'trading', pai_id: 'ceo' }),
    ag({ id: 't2', nome: 'Analista de Scanners', pilar: 'trading', pai_id: 'ceo' }),
    ag({ id: 'e1', nome: 'Conteúdo LMS', pilar: 'educacao', pai_id: 'ceo' }),
    ag({ id: 'e2', nome: 'Vendas de Formação', pilar: 'educacao', pai_id: 'ceo' }),
    ag({ id: 'd1', nome: 'Produto SaaS', pilar: 'desenvolvimento', pai_id: 'ceo' }),
    ag({ id: 'd2', nome: 'Manutenção do Site', pilar: 'desenvolvimento', pai_id: 'ceo' }),
  ]
  const a = montarArvore(equipa)
  teste('uma só raiz: o CEO', a.raizes.length === 1 && a.raizes[0].agente.id === 'ceo')
  teste('e os seis filhos estão debaixo dele', a.raizes[0].filhos.length === 6)
  teste('sem órfãos', a.orfaos.length === 0)
  teste('achatar devolve os sete, ninguém se perde', achatar(a).length === 7)
  teste('o CEO está à profundidade 0 e os filhos à 1',
    a.raizes[0].profundidade === 0 && a.raizes[0].filhos.every((f) => f.profundidade === 1))

  // A ordem é a dos pilares, e não a alfabética: trading, educação, desenvolvimento.
  const pilares = a.raizes[0].filhos.map((f) => String(f.agente.pilar))
  teste('a ordem dos filhos é a dos pilares',
    pilares.join(',') === 'trading,trading,educacao,educacao,desenvolvimento,desenvolvimento')

  // Um neto: o dia em que um filho clona. A árvore tem de ter mais de dois andares.
  const comNeto = montarArvore([...equipa, ag({ id: 't1a', nome: 'Filho do Trader', pai_id: 't1' })])
  const trader = comNeto.raizes[0].filhos.find((f) => f.agente.id === 't1')
  teste('um neto fica debaixo do pai certo', trader?.filhos.length === 1)
  teste('e à profundidade 2', trader?.filhos[0].profundidade === 2)
  teste('e entra no achatado', achatar(comNeto).length === 8)
}

// ═══ O CASO MAU Nº 1: O PAI QUE NÃO BATE ═════════════════════════════════════════════════════
{
  /**
   * É este o defeito que o dono apontou: um `pai_id` que não existe faz o filho DESAPARECER de
   * qualquer ecrã que use `filter(a => a.pai_id === pai.id)`. A equipa aparece menor do que é, e
   * nada no ecrã diz que falta alguém.
   */
  const a = montarArvore([
    ag({ id: 'ceo', nome: 'CEO', pilar: 'ceo' }),
    ag({ id: 'x', nome: 'Perdido', pai_id: 'pai-que-foi-apagado' }),
  ])
  teste('o filho com pai inexistente NÃO desaparece', achatar(a).length === 2)
  teste('aparece como raiz', a.raizes.some((r) => r.agente.id === 'x'))
  teste('marcado como órfão no próprio nó', a.raizes.find((r) => r.agente.id === 'x')?.orfao === true)
  teste('declarado na lista de órfãos', a.orfaos.length === 1 && a.orfaos[0].id === 'x')
  teste('com o motivo certo', a.orfaos[0].porque === 'pai_inexistente')
  teste('e o texto diz o pai que pediu', a.orfaos[0].texto.includes('pai-que-foi-apagado'))
  // O órfão nunca encabeça a árvore: o CEO é que está no topo.
  teste('o órfão não rouba o topo ao CEO', a.raizes[0].agente.id === 'ceo')
}

// ═══ O CASO MAU Nº 2: O CICLO ════════════════════════════════════════════════════════════════
{
  /**
   * Dois `pai_id` trocados à mão no Supabase e a montagem recursiva não para nunca. O resultado não
   * é um erro legível: é uma página branca, e uma página branca não diz a ninguém que o problema é
   * uma coluna.
   */
  const a = montarArvore([
    ag({ id: 'a', nome: 'A', pai_id: 'b' }),
    ag({ id: 'b', nome: 'B', pai_id: 'a' }),
  ])
  teste('um ciclo não pendura o painel', achatar(a).length >= 1)
  teste('e é declarado como ciclo', a.orfaos.some((o) => o.porque === 'ciclo'))

  // O caso mais simples e mais fácil de criar à mão: um agente pai de si próprio.
  const si = montarArvore([ag({ id: 'z', nome: 'Z', pai_id: 'z' })])
  teste('pai de si próprio não desaparece', achatar(si).length === 1)
  teste('e fica declarado', si.orfaos.length === 1 && si.orfaos[0].porque === 'ciclo')
}

// ═══ O CASO MAU Nº 3: A ORDEM DA BASE NÃO PODE DECIDIR A ÁRVORE ══════════════════════════════
{
  // O filho vem ANTES do pai. Uma montagem de uma só passagem perdia-o, e a base não garante ordem.
  const a = montarArvore([
    ag({ id: 'filho', nome: 'Filho', pai_id: 'pai' }),
    ag({ id: 'pai', nome: 'Pai', pilar: 'ceo' }),
  ])
  teste('o filho que vem primeiro na lista encontra o pai', a.raizes.length === 1)
  teste('e não é marcado como órfão', a.orfaos.length === 0)

  // Linhas sem id não entram, mas também não rebentam a montagem das outras.
  const comLixo = montarArvore([ag({ id: '' }), ag({ id: 'bom', pilar: 'ceo' })])
  teste('uma linha sem id não leva as boas atrás', comLixo.total === 1 && comLixo.raizes.length === 1)
}

// ═══ O RELÓGIO: NUNCA UM NEGATIVO DESENHADO COMO POSITIVO ════════════════════════════════════
{
  const bebe = relogioDoJuizo({ criado_em: haHoras(3), estado: 'vivo' }, AGORA)
  teste('um agente de 3 h está na carência', bebe.fase === 'carencia')
  teste('e faltam-lhe 45 h', bebe.horas === CARENCIA_HORAS - 3)
  teste('e o texto diz «faltam»', bebe.texto.includes('Faltam'))

  /**
   * O DEFEITO: depois da carência as horas ficavam negativas. Qualquer barra, `Math.abs` ou
   * `toFixed` desenhava «faltam 24 h» a um agente que está a ser julgado desde ontem — o inverso
   * exacto da verdade, e com bom aspecto.
   */
  const velho = relogioDoJuizo({ criado_em: haHoras(GRACA_HORAS + 24), estado: 'vivo' }, AGORA)
  teste('depois da carência a fase muda', velho.fase === 'em_julgamento')
  teste('e as horas NUNCA são negativas', (velho.horas ?? 0) >= 0)
  teste('e dizem o tempo JÁ PASSADO, não o que falta', velho.horas === 24)
  teste('e o texto nega a contagem decrescente', velho.texto.includes('não há contagem decrescente'))

  // A fronteira exacta: à 47ª hora ainda falta, à 49ª já se julga.
  // 06/10: a graça passou a 72 h.
  teste('71 h -> carência', relogioDoJuizo({ criado_em: haHoras(GRACA_HORAS - 1), estado: 'vivo' }, AGORA).fase === 'carencia')
  teste('73 h -> em julgamento', relogioDoJuizo({ criado_em: haHoras(GRACA_HORAS + 1), estado: 'vivo' }, AGORA).fase === 'em_julgamento')

  // Pausado/parado: o relógio está DESLIGADO, e não a zero. Zero parece «é agora».
  for (const e of ['pausado', 'parado', 'reformado', 'morto'] as const) {
    const r = relogioDoJuizo({ criado_em: haHoras(99), estado: e }, AGORA)
    teste(`${e} suspende o relógio`, r.fase === 'suspenso' && r.horas === null)
  }
  teste('pausado pelo dono manda mesmo com estado vivo',
    relogioDoJuizo({ criado_em: haHoras(99), estado: 'vivo', pausado: true }, AGORA).fase === 'suspenso')

  // Sem data e com data no futuro: não se julga, e diz-se porquê.
  teste('sem data não há relógio', relogioDoJuizo({ criado_em: null, estado: 'vivo' }, AGORA).fase === 'sem_data')
  teste('data ilegível não há relógio', relogioDoJuizo({ criado_em: 'ontem', estado: 'vivo' }, AGORA).fase === 'sem_data')
  const futuro = relogioDoJuizo({ criado_em: haHoras(-10), estado: 'vivo' }, AGORA)
  teste('nascido no futuro é relógio trocado', futuro.fase === 'sem_data' && futuro.horas === null)
  teste('e diz-se que a data está no futuro', futuro.texto.includes('futuro'))
}

// ═══ O CASO MAU Nº 4: O PARADO PINTADO DE VIVO ═══════════════════════════════════════════════
{
  teste('vivo é vivo', estadoNoEcra({ estado: 'vivo', pausado: false }).estado === 'vivo')

  /**
   * As duas colunas a discordar. Um painel que leia só `estado` pinta isto de verde — e o cron,
   * que obedece a `pausado`, tinha-o suspendido. O dono vê «a trabalhar» num agente que está
   * quieto.
   */
  const conflito = estadoNoEcra({ estado: 'vivo', pausado: true })
  teste('pausado=true ganha ao estado vivo', conflito.estado === 'pausado')
  teste('e o conflito é declarado, não calado', conflito.conflito !== null)
  teste('o conflito nomeia as duas colunas',
    conflito.conflito!.includes('vivo') && conflito.conflito!.includes('pausado'))

  // Pausado com estado pausado é coerente: não há conflito a mostrar.
  teste('coerente não inventa conflito', estadoNoEcra({ estado: 'pausado', pausado: true }).conflito === null)

  /**
   * Um estado que não se reconhece NÃO se pinta de vivo. «vivo» é a cor que diz «está a trabalhar e
   * a pagar-se»; assumi-la por omissão era pintar de verde um agente de que não se sabe nada.
   */
  for (const mau of ['', 'ativo', 'ACTIVE', 'zumbi', null]) {
    const r = estadoNoEcra({ estado: mau as string | null, pausado: false })
    teste(`estado «${mau}» não vira vivo`, r.estado !== 'vivo')
    teste(`estado «${mau}» declara o problema`, r.conflito !== null)
  }
}

// ═══ A RECEITA POR ATRIBUIR NÃO SE ESCONDE NEM SE LÊ COMO ZERO ═══════════════════════════════
{
  const a = montarArvore([
    ag({ id: 'ceo', pilar: 'ceo', receita: 0 }),
    ag({ id: 'f1', pai_id: 'ceo', receita: 0 }),
    ag({ id: 'f2', pai_id: 'ceo', receita: 12, estado: 'em_risco' }),
    ag({ id: 'f3', pai_id: 'ceo', estado: 'vivo', pausado: true }),
  ])

  const medido = resumoDaEquipa(a, 3500)
  teste('conta os agentes todos', medido.total === 4)
  teste('o pausado não conta como vivo', medido.vivos === 2 && medido.pausados === 1)
  teste('e o em risco conta à parte', medido.emRisco === 1)
  teste('conta quem tem receita medida a zero', medido.semReceitaMedida === 3)
  teste('mostra o valor por atribuir', medido.porAtribuirCents === 3500)
  teste('e o texto diz que não se reparte', medido.porAtribuirTexto.includes('reparte'))

  /**
   * O ponto todo deste campo ser `number | null`: «não medido» e «zero» são as duas leituras
   * OPOSTAS do mesmo ecrã. Um `?? 0` em quem chama transformava «ninguém contou» em «não há nada», e
   * é esse número que faz a equipa parecer morta.
   */
  const naoMedido = resumoDaEquipa(a, null)
  teste('não medido NÃO vira zero', naoMedido.porAtribuirCents === null)
  teste('e diz-se em maiúsculas que não foi medido', naoMedido.porAtribuirTexto.includes('NÃO MEDIDA'))
  teste('e explica que zero diria outra coisa', naoMedido.porAtribuirTexto.includes('zero'))
  teste('um valor ilegível também não vira zero',
    resumoDaEquipa(a, Number.NaN).porAtribuirCents === null)

  const zero = resumoDaEquipa(a, 0)
  teste('zero medido é zero, e diz-se que foi tudo ligado', zero.porAtribuirCents === 0)
  teste('e o texto de zero é diferente do de não medido', zero.porAtribuirTexto !== naoMedido.porAtribuirTexto)

  // Os órfãos contam no resumo: são a prova de que a árvore podia ter perdido alguém.
  const comOrfao = resumoDaEquipa(montarArvore([ag({ id: 'o', pai_id: 'nada' })]), 0)
  teste('o resumo conta os órfãos', comOrfao.orfaos === 1)
}

// ═══ Os rótulos dos pilares ══════════════════════════════════════════════════════════════════
{
  teste('ceo', textoDoPilar('ceo') === 'CEO')
  teste('educacao leva cedilha e acento', textoDoPilar('educacao') === 'Educação')
  // Um pilar desconhecido tem rótulo em vez de aparecer vazio: um cabeçalho em branco no ecrã não
  // diz a ninguém que a coluna `pilar` tem lixo.
  teste('pilar desconhecido tem rótulo', textoDoPilar('outra-coisa') === 'Sem pilar')
  teste('pilar nulo tem rótulo', textoDoPilar(null) === 'Sem pilar')
}

// ═══ A ESCALA DE VIDA: OS CORTES TÊM DE BATER COM A REGRA ════════════════════════════════════
{
  const E = (p: Partial<FactosDaEscala>): FactosDaEscala => ({
    codigo: 'AG-X', estado: 'vivo', pausado: false, criado_em: haHoras(100), saldo: 10, resultado: 0, ...p,
  })

  // As três bandas, nos mesmos casos em que `julgar()` decide continuar / avisar / parar.
  teste('lucro -> banda paga_se', escalaDeVida(E({ resultado: 20, saldo: 0 }), AGORA).banda === 'paga_se')
  // 06/10: a banda é das HORAS SEM RECEITA, não do saldo.
  teste('30 h sem receita -> banda risco', escalaDeVida(E({ resultado: -2, saldo: 6, ultima_receita_em: haHoras(30) }), AGORA).banda === 'risco')
  teste('mais de 48 h sem receita -> banda para (morre), mesmo com saldo', escalaDeVida(E({ resultado: -2, saldo: 6 }), AGORA).banda === 'para')

  /**
   * A GUARDA QUE IMPORTA: a escala e a regra não podem discordar. Se discordarem, o painel desenha
   * uma banda e o cron faz outra coisa — e ninguém compara as duas a olho.
   */
  const casos: Array<Partial<FactosDaEscala>> = [
    { resultado: 42, saldo: 2 }, { resultado: 0.01, saldo: 0 }, { resultado: 0, saldo: 6 },
    { resultado: -30, saldo: 0 }, { resultado: -0.5, saldo: 0.5 }, { resultado: 0, saldo: 0 },
    { resultado: 0, saldo: 3, ultima_receita_em: haHoras(30) }, { resultado: 0, saldo: 3, ultima_receita_em: haHoras(10) },
  ]
  for (const c of casos) {
    const f = E(c)
    const esc = escalaDeVida(f, AGORA)
    const j = julgar(
      { id: 'x', nome: 'x', pilar: 'trading', estado: 'vivo', criado_em: f.criado_em!, gasto: 0,
        receita: 0, saldo: Number(f.saldo), receita_janela: Number(f.resultado), gasto_janela: 0,
        ultima_receita_em: f.ultima_receita_em ?? null },
      AGORA,
    )
    const esperado = j.decisao === 'continua' ? 'paga_se' : j.decisao === 'avisa' ? 'risco' : 'para'
    teste(`escala concorda com julgar (${JSON.stringify(c)})`, esc.banda === esperado)
  }

  // As casas nunca saem da banda, por maior que seja o número.
  for (const r of [0.0001, 1, 9.99, 10, 1000]) {
    const n = escalaDeVida(E({ resultado: r, saldo: 0 }), AGORA).nivel!
    teste(`lucro ${r} fica entre 6 e 9`, n >= 6 && n <= 9)
  }
  for (const h of [25, 30, 40, 47]) {
    const n = escalaDeVida(E({ resultado: -1, saldo: 5, ultima_receita_em: haHoras(h) }), AGORA).nivel!
    teste(`${h} h sem receita fica entre 3 e 5`, n >= 3 && n <= 5)
  }
  for (const r of [0, -1, -10, -9999]) {
    const n = escalaDeVida(E({ resultado: r, saldo: 0 }), AGORA).nivel!
    teste(`prejuízo ${r} fica entre 0 e 2`, n >= 0 && n <= 2)
  }
  teste('o topo da banda é para quem financia um filho',
    escalaDeVida(E({ resultado: 10, saldo: 0 }), AGORA).nivel === 9)

  /**
   * O CASO MAU QUE DÁ NOME A ESTA ESCALA: um agente sem código NÃO tem nível zero. Tem ausência de
   * contador. Um zero desenhado punha-o no fundo da escala, ao lado dos que falharam a sério, e a
   * leitura à primeira vista — «este não presta» — era o contrário do que os dados permitem dizer.
   */
  const semCodigo = escalaDeVida(E({ codigo: null, resultado: 0, saldo: 0 }), AGORA)
  teste('sem código não há nível', semCodigo.nivel === null)
  teste('e a banda diz que não foi medido', semCodigo.banda === 'nao_medido')
  teste('e o motivo distingue contador de trabalho',
    semCodigo.porque.includes('CONTADOR') && semCodigo.porque.includes('ninguém contou'))
  teste('código vazio conta como sem código', escalaDeVida(E({ codigo: '   ' }), AGORA).banda === 'nao_medido')

  // Suspenso e carência também não têm nível: um deles é o dono a mandar, o outro é tempo a passar.
  teste('pausado não tem nível',
    escalaDeVida(E({ pausado: true, resultado: -5, saldo: 0 }), AGORA).nivel === null)
  teste('pausado é suspenso, não «para»',
    escalaDeVida(E({ pausado: true, resultado: -5, saldo: 0 }), AGORA).banda === 'suspenso')
  const novo = escalaDeVida(E({ criado_em: haHoras(2) }), AGORA)
  teste('na carência não há nível', novo.nivel === null && novo.banda === 'carencia')

  // A ordem das perguntas: o dono ganha ao contador, e o contador ganha ao relógio.
  teste('pausado SEM código continua suspenso (o dono manda primeiro)',
    escalaDeVida(E({ pausado: true, codigo: null }), AGORA).banda === 'suspenso')
  teste('sem código na carência é «não medido» (sem contador nem o tempo ajuda)',
    escalaDeVida(E({ codigo: null, criado_em: haHoras(2) }), AGORA).banda === 'nao_medido')

  teste('os cortes vão escritos a par do número', escalaDeVida(E({}), AGORA).cortes === CORTES_DA_ESCALA)
  teste('e dizem de onde vêm', CORTES_DA_ESCALA.includes('vida.ts'))
}

// ── Resultado ────────────────────────────────────────────────────────────────
if (falhas.length) {
  console.error('ÁRVORE DA EQUIPA: ' + falhas.length + ' falha(s)')
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('árvore da equipa: tudo certo')
