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
  CARENCIA_HORAS, JANELA_HORAS, MARGEM_REFORMA, ORCAMENTO_INICIAL, deveReformarOPai, julgar,
  lucroAcumulado, podeClonar, podeGastar, ritmo, type Agente,
} from './vida'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGORA = new Date('2026-10-03T12:00:00Z')
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

const agente = (p: Partial<Agente>): Agente => ({
  id: 'a1', nome: 'Teste', pilar: 'trading', estado: 'vivo',
  criado_em: haHoras(72), gasto: 0, receita: 0, saldo: ORCAMENTO_INICIAL, ...p,
})

// ── A carência ──────────────────────────────────────────────────────────────
{
  const bebe = julgar(agente({ criado_em: haHoras(3) }), AGORA)
  teste('um agente de 3 horas não é julgado', bebe.decisao === 'espera')
  teste('e diz quantas horas faltam', bebe.porque.includes('faltam'))

  /**
   * O caso que a carência existe para evitar: nascer a uma sexta à noite e ser julgado no domingo,
   * sem nunca ter tido um dia útil para vender.
   */
  const quase = julgar(agente({ criado_em: haHoras(CARENCIA_HORAS - 1) }), AGORA)
  teste('à 47ª hora ainda não se julga', quase.decisao === 'espera')
  teste('à 49ª já se julga', julgar(agente({ criado_em: haHoras(49), gasto: 5, saldo: 5 }), AGORA).decisao !== 'espera')
}

// ── Quem se paga, continua ──────────────────────────────────────────────────
{
  const bom = julgar(agente({ receita: 50, gasto: 8, saldo: 2 }), AGORA)
  teste('lucro continua', bom.decisao === 'continua' && bom.estado === 'vivo')
  teste('e o resultado é receita menos gasto', bom.resultado === 42)
  // Lucro com saldo a zero NÃO mata: quem está a gerar receita não se desliga por ter gasto o
  // orçamento inicial — era desligar exactamente o que funciona.
  teste('lucro com saldo zero continua', julgar(agente({ receita: 50, gasto: 10, saldo: 0 }), AGORA).decisao === 'continua')
}

// ── Sem lucro ───────────────────────────────────────────────────────────────
{
  const risco = julgar(agente({ receita: 0, gasto: 4, saldo: 6 }), AGORA)
  teste('sem receita mas com saldo fica em risco', risco.decisao === 'avisa' && risco.estado === 'em_risco')
  teste('e o motivo diz quanto resta', risco.porque.includes('6.00'))

  const morto = julgar(agente({ receita: 0, gasto: 10, saldo: 0 }), AGORA)
  teste('sem receita e sem saldo, pára', morto.decisao === 'para' && morto.estado === 'parado')
  teste('e o motivo diz os números', morto.porque.includes('0.00') && morto.porque.includes('10.00'))

  // Empatar não é pagar-se: receita igual ao gasto deixa a casa a pagar a infraestrutura.
  teste('empate não conta como lucro', julgar(agente({ receita: 10, gasto: 10, saldo: 0 }), AGORA).decisao === 'para')
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
  teste('quem já foi bom mas não mexe há 48 h, pára', j.decisao === 'para')
  teste('e os números do motivo são os da JANELA', j.porque.includes('12.00') && !j.porque.includes('400'))

  // O inverso: janela boa com acumulado mau continua vivo. O que conta para viver é agora.
  teste('janela boa com acumulado mau continua',
    julgar(agente({ receita: 5, gasto: 300, receita_janela: 40, gasto_janela: 5 }), AGORA).decisao === 'continua')

  // Sem janela, usa-se o acumulado — e DIZ-SE, para ninguém ler «vivo» a pensar que foi medido nas
  // últimas 48 horas.
  const semJanela = julgar(agente({ receita: 40, gasto: 5 }), AGORA)
  teste('sem janela usa o acumulado', semJanela.decisao === 'continua')
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
  const filhoBom = agente({ id: 'f1', criado_em: haHoras(60), receita: 60, gasto: 10 }) // 50 $ / 60 h ≈ 0,83 $/h

  teste('o pai tem MAIS lucro acumulado que o filho', lucroAcumulado(pai) > lucroAcumulado(filhoBom))
  teste('mas o filho tem melhor RITMO', (ritmo(filhoBom, AGORA) ?? 0) > (ritmo(pai, AGORA) ?? 0))

  const r = deveReformarOPai(pai, filhoBom, AGORA)
  teste('o filho com melhor ritmo reforma o pai', r.pode)
  teste('e o motivo mostra os dois ritmos', r.porque.includes('$/h'))

  // Ganhar por pouco é ruído: reformar um pai bom por 1% de diferença perde os dois.
  const filhoQuaseIgual = agente({ id: 'f2', criado_em: haHoras(60), receita: 30, gasto: 9.8 })
  teste('ganhar por pouco não reforma', !deveReformarOPai(pai, filhoQuaseIgual, AGORA).pode)
  teste('e explica a margem', deveReformarOPai(pai, filhoQuaseIgual, AGORA).porque.includes('ruído'))

  const bebe = agente({ id: 'f3', criado_em: haHoras(2), receita: 20, gasto: 0 })
  teste('um filho de 2 h não reforma ninguém', !deveReformarOPai(pai, bebe, AGORA).pode)
  teste('e diz que uma venda de sorte não prova nada', deveReformarOPai(pai, bebe, AGORA).porque.includes('sorte'))

  const filhoSemLucro = agente({ id: 'f4', criado_em: haHoras(60), receita: 1, gasto: 9 })
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
  'agentes/vida: viver pela janela, clonar pelo acumulado, e o filho de melhor RITMO reforma o pai ✓',
)
