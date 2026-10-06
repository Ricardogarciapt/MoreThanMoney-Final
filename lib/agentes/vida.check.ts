/**
 * A GUARDA DA REGRA DE VIDA.
 *
 *   npx tsx lib/agentes/vida.check.ts
 *
 * Esta regra decide se um agente continua a trabalhar. Errar para um lado mata trabalho que estava
 * a dar dinheiro; errar para o outro mantém a gastar o que nunca vai dar. Nenhum dos dois dá erro
 * no ecrã — vê-se na conta ao fim do mês.
 */
import {
  CARENCIA_HORAS, GRACA_HORAS, JANELA_HORAS, MARGEM_REFORMA, ORCAMENTO_INICIAL, REGRAS_PADRAO, deveReformarOPai,
  eImortal, julgar, lerRegrasVida, lucroAcumulado, podeClonar, podeGastar, ritmo, type Agente,
} from './vida'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGORA = new Date('2026-10-03T12:00:00Z')
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

const agente = (p: Partial<Agente>): Agente => ({
  id: 'a1', nome: 'Teste', pilar: 'trading', estado: 'vivo',
  criado_em: haHoras(100), gasto: 0, receita: 0, saldo: ORCAMENTO_INICIAL, ...p,
})

// ── A GRAÇA DO RECÉM-NASCIDO (06/10: 72 h) ──────────────────────────────────
{
  const bebe = julgar(agente({ criado_em: haHoras(3) }), AGORA)
  teste('um agente de 3 horas não é julgado', bebe.decisao === 'espera')
  teste('e diz quantas horas faltam', bebe.porque.includes('faltam'))

  // O CASO MAU: a graça a proteger mal. À 71ª hora, sem uma única venda, ainda não pode morrer.
  const quase = julgar(agente({ criado_em: haHoras(GRACA_HORAS - 1) }), AGORA)
  teste('à 71ª hora sem receita ainda NÃO morre (graça)', quase.decisao === 'espera' && quase.estado === 'vivo')
  teste('passada a graça, sem receita nenhuma, morre',
    julgar(agente({ criado_em: haHoras(GRACA_HORAS + 1) }), AGORA).decisao === 'morre')
  teste('a graça é maior do que a janela', GRACA_HORAS > JANELA_HORAS)
  teste('a carência antiga é o MESMO número que a graça', CARENCIA_HORAS === GRACA_HORAS)
}

// ── A RÉGUA: 48 h SEGUIDAS SEM RECEITA ATRIBUÍDA ────────────────────────────
{
  const comVendaOntem = julgar(agente({ ultima_receita_em: haHoras(20), receita: 35, receita_janela: 35 }), AGORA)
  teste('venda há 20 h: vivo', comVendaOntem.decisao === 'continua' && comVendaOntem.estado === 'vivo')

  const ha30 = julgar(agente({ ultima_receita_em: haHoras(30), receita: 35 }), AGORA)
  teste('30 h sem receita: em risco', ha30.decisao === 'avisa' && ha30.estado === 'em_risco')
  teste('e diz quantas horas faltam para morrer', ha30.porque.includes('faltam 18 h'))

  const ha49 = julgar(agente({ ultima_receita_em: haHoras(49), receita: 400, gasto: 1, saldo: 9 }), AGORA)
  teste('49 h sem receita: MORRE, mesmo com 400 € de vida e orçamento por gastar',
    ha49.decisao === 'morre' && ha49.estado === 'morto')
  teste('e o motivo diz as horas e a receita da vida toda', ha49.porque.includes('49 h') && ha49.porque.includes('400.00'))

  // O orçamento deixou de ser prazo de vida: sem receita e COM saldo morre na mesma.
  teste('saldo cheio não salva quem não vende', julgar(agente({ saldo: 10 }), AGORA).decisao === 'morre')
  // E o inverso: sem saldo mas com venda recente vive. O orçamento só trava gasto.
  teste('sem saldo mas com venda recente vive',
    julgar(agente({ saldo: 0, gasto: 10, ultima_receita_em: haHoras(2), receita: 5 }), AGORA).decisao === 'continua')

  // Compatibilidade: sem a hora da última receita, receita na janela prova que houve.
  teste('receita na janela sem data conta como receita recente',
    julgar(agente({ receita_janela: 12, gasto_janela: 0 }), AGORA).decisao === 'continua')

  // Uma "última receita" no futuro é relógio trocado: não dá vida eterna.
  teste('última receita no futuro não salva ninguém',
    julgar(agente({ ultima_receita_em: new Date(AGORA.getTime() + 99 * 3_600_000).toISOString() }), AGORA).decisao === 'morre')
}

// ── A RÉGUA SÓ CONTA DESDE QUE EXISTE ───────────────────────────────────────
//
// O caso mau real: os seis filhos de 01/10 estiveram 5 dias sem links assinados. Aplicar a régua
// nova sem `regraDesde` matava-os todos na primeira passagem, por horas anteriores à regra.
{
  const regras = { ...REGRAS_PADRAO, regraDesde: haHoras(10) }
  const velhoSemVendas = julgar(agente({ criado_em: haHoras(120) }), AGORA, regras)
  teste('régua com 10 h de vida não mata ninguém por horas anteriores', velhoSemVendas.decisao === 'continua')
  teste('e diz que conta desde a régua', velhoSemVendas.porque.includes('régua'))
  const regras50 = { ...REGRAS_PADRAO, regraDesde: haHoras(50) }
  teste('régua com 50 h já mata quem não vendeu nesse tempo',
    julgar(agente({ criado_em: haHoras(120) }), AGORA, regras50).decisao === 'morre')

  // A configuração não pode encurtar a vida por engano.
  const lixo = lerRegrasVida({ janela_horas: 'abc', graca_horas: -5 })
  teste('config ilegível volta às 48 h', lixo.janelaHoras === 48 && lixo.gracaHoras === 72)
  teste('janela mínima de 12 h', lerRegrasVida({ janela_horas: 1 }).janelaHoras === 12)
  teste('graça nunca abaixo da janela', lerRegrasVida({ janela_horas: 60, graca_horas: 24 }).gracaHoras === 60)
  teste('config em texto JSON também se lê', lerRegrasVida('{"graca_horas": 96}').gracaHoras === 96)
}

// ── UM MORTO NÃO RESSUSCITA ─────────────────────────────────────────────────
{
  const m = julgar(agente({ estado: 'morto', ultima_receita_em: haHoras(1), receita: 50 }), AGORA)
  teste('morto com venda atrasada continua morto', m.decisao === 'espera' && m.estado === 'morto')
  teste('morto não gasta', !podeGastar(agente({ estado: 'morto' }), 1).pode)
  teste('morto não clona', !podeClonar(agente({ estado: 'morto', receita: 99 }), AGORA).pode)
}

/**
 * ── A SUPERVISÃO GANHA À REGRA ──────────────────────────────────────────────
 * É o ponto de haver supervisão. Um agente que o dono pausou não é julgado nem parado por uma
 * regra automática enquanto ele não decidir.
 */
{
  const pausado = julgar(agente({ pausado: true, receita: 0, gasto: 99, saldo: 0 }), AGORA)
  teste('pausado nunca é parado pela regra', pausado.decisao === 'espera' && pausado.estado === 'pausado')
  teste('e diz que foi o dono', pausado.porque.includes('dono'))
  teste('já parado não se rejulga', julgar(agente({ estado: 'parado' }), AGORA).decisao === 'espera')
}

// ── Lixo não mata ninguém ───────────────────────────────────────────────────
{
  // Sem data de nascimento, um agente pareceria recém-nascido ou velhíssimo conforme o acaso.
  const semData = julgar(agente({ criado_em: '' }), AGORA)
  teste('sem data não se julga', semData.decisao === 'espera')
  teste('data inválida também não', julgar(agente({ criado_em: 'ontem' }), AGORA).decisao === 'espera')
}

// ── O orçamento trava ANTES do gasto ────────────────────────────────────────
{
  const a = agente({ saldo: 5 })
  teste('gasto dentro do saldo passa', podeGastar(a, 3).pode)
  teste('e diz com quanto fica', podeGastar(a, 3).porque.includes('2.00'))
  teste('gasto acima do saldo é travado', !podeGastar(a, 9).pode)
  teste('parado não gasta', !podeGastar(agente({ estado: 'parado' }), 1).pode)
  teste('pausado não gasta', !podeGastar(agente({ pausado: true }), 1).pode)
  teste('valor negativo não passa', !podeGastar(a, -5).pode)
  teste('zero não passa', !podeGastar(a, 0).pode)
}

/**
 * ── CLONAR ──────────────────────────────────────────────────────────────────
 * Mais exigente do que «ganhou mais do que gastou»: o lucro tem de pagar o orçamento do filho.
 * Clonar com 2 $ de lucro um agente que custa 10 $ a arrancar é criar dois agentes pobres.
 */
{
  teste('lucro acumulado grande clona', podeClonar(agente({ receita: 40, gasto: 5, saldo: 5 }), AGORA).pode)
  teste('exactamente 10 $ chega', podeClonar(agente({ receita: 10, gasto: 0 }), AGORA).pode)
  teste('9,99 $ não chega', !podeClonar(agente({ receita: 9.99, gasto: 0 }), AGORA).pode)

  const pouco = podeClonar(agente({ receita: 12, gasto: 10, saldo: 0 }), AGORA)
  teste('lucro de 2 $ não clona', !pouco.pode)
  teste('e explica que não financia o filho', pouco.porque.includes('não chega'))

  /**
   * Decisão do dono: clonar olha para o ACUMULADO. Um agente que já rendeu 30 $ desde que nasceu
   * merece um filho, mesmo que esta janela tenha sido fraca — viver julga-se pelo que se faz agora,
   * multiplicar-se pelo que já se provou.
   */
  teste('janela fraca não impede de clonar quem já provou',
    podeClonar(agente({ receita: 40, gasto: 10, receita_janela: 0, gasto_janela: 1 }), AGORA).pode)

  teste('quem não se paga não clona', !podeClonar(agente({ receita: 0, gasto: 5, saldo: 5 }), AGORA).pode)
  teste('pausado não clona', !podeClonar(agente({ pausado: true, receita: 99 }), AGORA).pode)
  teste('na carência não clona', !podeClonar(agente({ criado_em: haHoras(5), receita: 99 }), AGORA).pode)
}

/**
 * ── VIVER PELA JANELA, CLONAR PELO ACUMULADO ────────────────────────────────
 *
 * O defeito que esta separação corrigiu: um agente que fez 400 $ no mês passado e não mexe há três
 * dias passava como «vivo» porque o juízo olhava para o acumulado. Ou seja, a regra das 48 horas
 * não existia para quem já tinha sido bom uma vez.
 */
{
  const dormente = agente({
    receita: 400, gasto: 50, saldo: 0,          // acumulado excelente
    receita_janela: 0, gasto_janela: 12,        // e nada nas últimas 48 h
  })
  const j = julgar(dormente, AGORA)
  teste('quem já foi bom mas não vende há mais de 48 h, morre', j.decisao === 'morre')

  // O inverso: janela boa com acumulado mau continua vivo. O que conta para viver é agora.
  teste('janela boa com acumulado mau continua',
    julgar(agente({ receita: 5, gasto: 300, receita_janela: 40, gasto_janela: 5 }), AGORA).decisao === 'continua')

  // Sem janela, usa-se o acumulado — e DIZ-SE, para ninguém ler «vivo» a pensar que foi medido nas
  // últimas 48 horas.
  const semJanela = julgar(agente({ receita: 40, gasto: 5 }), AGORA)
  teste('sem janela nem data usa o acumulado', semJanela.decisao === 'continua')
  teste('e avisa que foi pelo acumulado', semJanela.porque.includes('acumulado'))

  teste('o acumulado é receita menos gasto totais', lucroAcumulado(agente({ receita: 30, gasto: 12 })) === 18)
}

/**
 * ── A REFORMA ───────────────────────────────────────────────────────────────
 *
 * O erro que esta regra quase teve: comparar lucro ACUMULADO. O filho nasce sempre depois, por isso
 * um pai com 300 h de vida ganha sempre a um filho de 60 h — e a regra ficava no código a parecer
 * que funcionava, sem nunca disparar uma única vez.
 */
{
  const pai = agente({ id: 'pai', criado_em: haHoras(300), receita: 150, gasto: 50 })   // 100 $ / 300 h ≈ 0,33 $/h
  const filhoBom = agente({ id: 'f1', criado_em: haHoras(80), receita: 60, gasto: 10 }) // 50 $ / 80 h ≈ 0,63 $/h (80 h: já fora da graça de 72 h)

  teste('o pai tem MAIS lucro acumulado que o filho', lucroAcumulado(pai) > lucroAcumulado(filhoBom))
  teste('mas o filho tem melhor RITMO', (ritmo(filhoBom, AGORA) ?? 0) > (ritmo(pai, AGORA) ?? 0))

  const r = deveReformarOPai(pai, filhoBom, AGORA)
  teste('o filho com melhor ritmo reforma o pai', r.pode)
  teste('e o motivo mostra os dois ritmos', r.porque.includes('$/h'))

  // Ganhar por pouco é ruído: reformar um pai bom por 1% de diferença perde os dois.
  const filhoQuaseIgual = agente({ id: 'f2', criado_em: haHoras(80), receita: 30, gasto: 9.8 })
  teste('ganhar por pouco não reforma', !deveReformarOPai(pai, filhoQuaseIgual, AGORA).pode)
  teste('e explica a margem', deveReformarOPai(pai, filhoQuaseIgual, AGORA).porque.includes('ruído'))

  const bebe = agente({ id: 'f3', criado_em: haHoras(2), receita: 20, gasto: 0 })
  teste('um filho de 2 h não reforma ninguém', !deveReformarOPai(pai, bebe, AGORA).pode)
  teste('e diz que uma venda de sorte não prova nada', deveReformarOPai(pai, bebe, AGORA).porque.includes('sorte'))

  const filhoSemLucro = agente({ id: 'f4', criado_em: haHoras(80), receita: 1, gasto: 9 })
  teste('um filho a perder dinheiro não reforma', !deveReformarOPai(pai, filhoSemLucro, AGORA).pode)

  // Um pai a PERDER dinheiro é superado por qualquer filho que ganhe. A margem multiplicativa não
  // se pode aplicar a negativos: 1.25 × -10 é MAIOR que -10, e isso invertia a regra toda.
  const paiNegativo = agente({ id: 'pn', criado_em: haHoras(300), receita: 10, gasto: 90 })
  teste('pai a perder é superado por filho que ganha', deveReformarOPai(paiNegativo, filhoBom, AGORA).pode)

  teste('o CEO não se reforma por um sub-agente',
    !deveReformarOPai(agente({ pilar: 'ceo', criado_em: haHoras(300) }), filhoBom, AGORA).pode)
  teste('um pai pausado não é reformado',
    !deveReformarOPai({ ...pai, pausado: true }, filhoBom, AGORA).pode)
  teste('um pai já reformado não se reforma outra vez',
    !deveReformarOPai({ ...pai, estado: 'reformado' }, filhoBom, AGORA).pode)
  teste('reformado não volta a ser julgado',
    julgar({ ...pai, estado: 'reformado' }, AGORA).decisao === 'espera')
  teste('reformado não clona', !podeClonar({ ...pai, estado: 'reformado' }, AGORA).pode)

  teste('a margem é maior que 1', MARGEM_REFORMA > 1)
}

// ── A IMORTALIDADE DO CEO, E SOBRETUDO ONDE ELA *NÃO* CHEGA ─────────────────
//
// Decisão do dono (01/10). O caso bom é trivial e não é o que interessa provar: o que erra em
// silêncio é a imortalidade a ALASTRAR — um filho a ficar indestrutível por lhe ter calhado o pilar
// do CEO, ou por estar debaixo dele. Nesse caso a régua das 48 h continua escrita, continua a
// correr, e deixa de parar quem devia parar. Não há exceção, não há log, não há nada: só uma equipa
// a gastar orçamento para sempre.
{
  const semLucroNemSaldo = { receita: 0, gasto: 10, saldo: 0 } as const // e sem venda nenhuma: >48 h

  // ── O topo da casa: pilar 'ceo' E sem pai ──
  const ceo = agente({ nome: 'CEO', pilar: 'ceo', pai_id: null, ...semLucroNemSaldo })
  teste('o CEO é imortal', eImortal(ceo))
  const jCeo = julgar(ceo, AGORA)
  teste('o CEO sem receita há mais de 48 h NÃO morre', jCeo.decisao !== 'morre' && jCeo.estado !== 'morto')
  teste('fica em risco, à vista', jCeo.decisao === 'avisa' && jCeo.estado === 'em_risco')
  teste('e o motivo diz que é excepção', /excep/i.test(jCeo.porque))
  // Imortal não é «deixar de medir»: o número continua a ser feito e continua a aparecer.
  teste('e o número medido continua lá', jCeo.resultado === -10 && jCeo.porque.includes('10.00'))
  teste('um CEO morto por engano de dados não é rejulgado para vivo', julgar({ ...ceo, estado: 'morto' }, AGORA).estado === 'morto')

  // ── O CASO MAU Nº 1: um filho com o pilar do CEO ──
  // Uma linha copiada do pai, ou um valor por omissão num formulário, chega para isto.
  const filhoComPilarCeo = agente({ nome: 'Falso CEO', pilar: 'ceo', pai_id: 'o-ceo', ...semLucroNemSaldo })
  teste('um filho com pilar ceo NÃO é imortal', !eImortal(filhoComPilarCeo))
  teste('e morre como qualquer outro', julgar(filhoComPilarCeo, AGORA).decisao === 'morre')

  // ── O CASO MAU Nº 2: estar debaixo do CEO não dá nada ──
  const filhoDoCeo = agente({ nome: 'Produto SaaS', pilar: 'desenvolvimento', pai_id: 'o-ceo', ...semLucroNemSaldo })
  teste('um filho do CEO não herda a imortalidade', !eImortal(filhoDoCeo))
  teste('e morre', julgar(filhoDoCeo, AGORA).decisao === 'morre' && julgar(filhoDoCeo, AGORA).estado === 'morto')

  // ── O CASO MAU Nº 3: um agente raiz qualquer ──
  // Ser raiz, por si, não é ser CEO — um órfão (pai apagado, ver `arvore.ts`) desenha-se no topo e
  // não pode passar a indestrutível por isso.
  const orfaoNoTopo = agente({ nome: 'Órfão', pilar: 'trading', pai_id: null, ...semLucroNemSaldo })
  teste('ser raiz sem ser do pilar ceo não dá imortalidade', !eImortal(orfaoNoTopo))
  teste('e morre', julgar(orfaoNoTopo, AGORA).decisao === 'morre')

  // ── `pai_id` vazio conta como raiz, mas só isso ──
  teste('pai_id em branco é raiz', eImortal({ pilar: 'ceo', pai_id: '   ' }))
  teste('pai_id indefinido é raiz', eImortal({ pilar: 'ceo' }))

  // ── A SUPERVISÃO DO DONO GANHA À EXCEPÇÃO AUTOMÁTICA ──
  // Imortal é não ser parado pela REGRA. Um CEO que o dono pausou ou parou à mão fica como ele o
  // deixou — uma excepção automática que ressuscitasse o agente contra a decisão de uma pessoa era
  // pior do que a regra que ela veio excepcionar.
  teste(
    'um CEO pausado pelo dono não é julgado',
    julgar(agente({ pilar: 'ceo', pai_id: null, pausado: true, ...semLucroNemSaldo }), AGORA).estado === 'pausado',
  )
  teste(
    'um CEO parado pelo dono fica parado',
    julgar(agente({ pilar: 'ceo', pai_id: null, estado: 'parado', ...semLucroNemSaldo }), AGORA).estado === 'parado',
  )

  // ── E a imortalidade não lhe dá orçamento nem direito a clonar ──
  // São contas separadas de propósito: não parar é uma coisa, poder gastar o que não tem é outra.
  teste(
    'o CEO imortal sem saldo continua a não poder gastar',
    !podeGastar(agente({ pilar: 'ceo', pai_id: null, ...semLucroNemSaldo }), 5).pode,
  )
  teste(
    'o CEO sem lucro acumulado não clona',
    !podeClonar(agente({ pilar: 'ceo', pai_id: null, ...semLucroNemSaldo }), AGORA).pode,
  )
}

// ── As constantes são as pedidas ────────────────────────────────────────────
{
  teste('a janela são 48 horas', JANELA_HORAS === 48)
  teste('o orçamento inicial são 10 $', ORCAMENTO_INICIAL === 10)
  teste('todos os juízos trazem motivo', [
    julgar(agente({}), AGORA), julgar(agente({ receita: 1 }), AGORA),
  ].every((j) => j.porque.length > 20))
}

if (falhas.length) {
  console.error(`agentes/vida: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'agentes/vida: 48 h sem receita morre (arquivado), a graça protege o recém-nascido, a régua conta desde que existe, o CEO não morre ✓',
)
