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
  CARENCIA_HORAS, JANELA_HORAS, ORCAMENTO_INICIAL, julgar, podeClonar, podeGastar, type Agente,
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
  teste('lucro grande clona', podeClonar(agente({ receita: 40, gasto: 5, saldo: 5 }), AGORA).pode)
  const pouco = podeClonar(agente({ receita: 12, gasto: 10, saldo: 0 }), AGORA)
  teste('lucro de 2 $ não clona', !pouco.pode)
  teste('e explica que não financia o filho', pouco.porque.includes('não chega'))
  teste('quem não se paga não clona', !podeClonar(agente({ receita: 0, gasto: 5, saldo: 5 }), AGORA).pode)
  teste('pausado não clona', !podeClonar(agente({ pausado: true, receita: 99 }), AGORA).pode)
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
console.log('agentes/vida: carência, lucro, risco, paragem, e a supervisão a ganhar à regra ✓')
