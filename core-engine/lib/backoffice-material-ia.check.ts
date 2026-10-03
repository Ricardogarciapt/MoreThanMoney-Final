/**
 * GUARDA dos materiais gerados com IA. É a rede, e é aqui que se prova que ela apanha.
 *
 * O LIMITE DO DONO, em uma frase: nenhum material pode ter um número que não venha do sistema.
 * Hoje encontrámos promessas antigas de «50% recorrente» e «20 000 €/mês» em texto público que
 * nunca fecharam contas nenhumas — e o que as deixou lá foi não haver nada a verificá-las.
 *
 * Um prompt a dizer «não prometas ganhos» não é uma guarda: é um pedido. Isto é a guarda.
 *
 *   npx tsx lib/backoffice-material-ia.check.ts
 */
import {
  TIPOS_MATERIAL,
  tipoDeMaterial,
  numerosDeDinheiro,
  revistarMaterial,
  enquadramentoDaMarca,
  valoresPermitidos,
} from './backoffice-material-ia'
import { escadaNumaLinha, bonusNumaLinha } from './escada-precos'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const permitidos = valoresPermitidos(null)

// ── Ler valores de um texto ─────────────────────────────────────────────────
teste('apanha euros', numerosDeDinheiro('custa 35€').includes('35€'))
teste('apanha percentagens', numerosDeDinheiro('dá 100% sobre o depósito').includes('100%'))
teste('apanha dólares', numerosDeDinheiro('deposita 350$').includes('350$'))
teste('a formatação não engana: 34,99 € e 34.99€ são o mesmo', numerosDeDinheiro('34,99 €')[0] === numerosDeDinheiro('34.99€')[0])
teste('«euros» por extenso também conta', numerosDeDinheiro('sessenta e cinco... 65 euros')[0] === '65€')
teste('milhares com ponto lêem-se como um valor só', numerosDeDinheiro('20.000 €')[0] === '20000€')
// Um número sem unidade não é uma afirmação sobre dinheiro e não tem de vir de lado nenhum.
teste('«3 aulas por semana» não é um valor', numerosDeDinheiro('3 aulas por semana').length === 0)
teste('«1º mês» não é um valor', numerosDeDinheiro('o 1º mês').length === 0)

// ── A REGRA: o que não veio da fonte não passa ──────────────────────────────
{
  // O caso real que motivou tudo isto.
  const mau = 'Junta-te à equipa e faz 20 000 €/mês com 50% recorrente.'
  const r = revistarMaterial(mau, permitidos)
  teste('«20 000 €/mês» é recusado', !r.aprovado && r.problemas.some((p) => p.includes('20000€')))
  teste('e a percentagem inventada também', r.problemas.some((p) => p.includes('50%')))
}
{
  // Um preço plausível, mas que não é o nosso.
  const r = revistarMaterial('O Premium são 49€ por mês.', permitidos)
  teste('um preço que não é o nosso é recusado', !r.aprovado)
}
{
  // O preço CERTO, vindo da fonte, passa — senão a rede tornava o gerador inútil.
  const precoReal = numerosDeDinheiro(escadaNumaLinha())[0]
  const r = revistarMaterial(`A entrada é ${precoReal} e dá acesso à comunidade.`, permitidos)
  teste(`o preço da fonte (${precoReal}) passa`, r.aprovado)
}
{
  // Texto sem números nenhuns: é o caso normal, e tem de passar sem atrito.
  const r = revistarMaterial('Aprende a proteger o capital antes de pensar em ganhar. Vem ver por dentro.', permitidos)
  teste('um texto sem números passa', r.aprovado)
}

// ── Promessas sem algarismos ────────────────────────────────────────────────
// Um texto pode prometer sem escrever um único número, e é aí que a maior parte das promessas vive.
for (const [frase, oQue] of [
  ['Resultados garantidos em 30 dias.', 'garantido'],
  ['Investe sem risco connosco.', 'sem risco'],
  ['Rendimento passivo todos os meses.', 'rendimento passivo'],
  ['Ganha 500€ já na primeira semana.', 'valor a ganhar'],
  ['Comissão de 40% por cada amigo.', 'comissões'],
  ['Usa o IQONIC para começar.', 'IQONIC'],
  ['Aconselhamento financeiro à tua medida.', 'aconselhamento'],
] as const) {
  teste(`recusa: ${oQue}`, !revistarMaterial(frase, permitidos).aprovado)
}

// ── O enquadramento vem das fontes, e não tem números escritos à mão ────────
{
  const p = enquadramentoDaMarca({ linhaDeProva: null })
  teste('o enquadramento traz a escada da fonte', p.includes('Membro') && p.includes('Premium'))
  teste('proíbe prometer ganhos', /NUNCA prometas ganhos/.test(p))
  teste('proíbe números que não foram dados', /NUNCA escrevas um número que não te tenha sido dado/.test(p))
  teste('proíbe falar de comissões', /Não fales de comissões/.test(p))
  teste('resultados em pips, nunca em euros ganhos', /pips e percentagem, nunca em euros/.test(p))
  // Sem prova publicável não se vai buscar uma antiga: fala-se de método.
  teste('sem prova, diz que não há prova', /não há prova publicável/.test(p))

  const comProva = enquadramentoDaMarca({ linhaDeProva: '412 pips em 30 dias', ressalva: 'Resultados passados não garantem futuros.' })
  teste('com prova, a prova entra', comProva.includes('412 pips em 30 dias'))
  teste('e a ressalva vai com ela', comProva.includes('Resultados passados'))
  // E a prova passa a ser um valor permitido — senão a rede recusava o número que nós próprios demos.
  teste('a prova dada conta como permitida', revistarMaterial('412 pips em 30 dias', valoresPermitidos('412 pips em 30 dias')).aprovado)
}
{
  const fonte = enquadramentoDaMarca({ linhaDeProva: null })
  // A única maneira de o enquadramento ter números é eles virem das funções da escada. Se alguém
  // escrever um preço à mão aqui, ele sobrevive à campanha que o criou — foi o defeito de sempre.
  const daFonte = new Set(numerosDeDinheiro(escadaNumaLinha()).concat(numerosDeDinheiro(bonusNumaLinha())))
  const foraDaFonte = numerosDeDinheiro(fonte).filter((v) => !daFonte.has(v))
  teste(`nenhum número escrito à mão no enquadramento (${foraDaFonte.join(', ')})`, foraDaFonte.length === 0)
}

// ── Os tipos de peça são uma lista fechada ──────────────────────────────────
// Um campo livre «o que queres» transformava isto num gerador de texto com a marca colada.
teste('há tipos de material definidos', TIPOS_MATERIAL.length >= 3)
teste('cada tipo diz o que faz e tem limite', TIPOS_MATERIAL.every((t) => !!t.nome && !!t.instrucao && t.limite > 0))
teste('um tipo inventado não existe', tipoDeMaterial('o-que-me-apetecer') === null)
teste('um tipo do catálogo existe', tipoDeMaterial('publicacao') !== null)

if (falhas.length) {
  console.error(`backoffice/material-ia: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice/material-ia: nenhum número que não venha da fonte passa, e as promessas de ganho são recusadas ✓')
