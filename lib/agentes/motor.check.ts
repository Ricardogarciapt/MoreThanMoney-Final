/**
 * A GUARDA DO MOTOR DE AVALIAÇÃO.
 *
 *   npx tsx lib/agentes/motor.check.ts
 *
 * A regra de vida já é provada por `vida.check.ts`. O que se prova aqui é a MONTAGEM e o PLANO —
 * que é onde este motor pode matar o agente errado sem nunca dar um erro:
 *
 *  · um `numeric` que vem como string e é lido como zero faz um agente rico parecer falido;
 *  · uma janela somada dos eventos errados dá lucro imaginário a toda a equipa;
 *  · um `avisado` gravado em cada passagem do cron enche o livro e torna a janela ilegível.
 *
 * Nenhuma destas três rebenta. Todas se vêem na conta ao fim do mês, ou não se vêem.
 */
import { JANELA_HORAS, ORCAMENTO_INICIAL } from './vida'
import {
  montarAgente,
  planearEquipa,
  planearJuizo,
  somarJanela,
  type EventoLido,
  type LinhaAgente,
} from './motor'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const AGORA = new Date('2026-10-03T12:00:00Z')
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()

const linha = (p: Partial<LinhaAgente> = {}): LinhaAgente => ({
  id: 'a1', nome: 'Teste', pilar: 'trading', estado: 'vivo',
  criado_em: haHoras(72), orcamento: 10, gasto: 0, receita: 0, ...p,
})

/**
 * ── O POSTGREST DEVOLVE `numeric` COMO STRING ───────────────────────────────
 *
 * É o defeito mais provável deste ficheiro inteiro, e o mais silencioso: `Number('8.50')` funciona,
 * por isso em testes à mão nunca se dá por nada. O que falha é o que vem nulo ou vazio.
 */
{
  const m = montarAgente(linha({ orcamento: '10.00', gasto: '8.50', receita: '3.25' }))
  teste('lê numeric vindo em string', m.agente.gasto === 8.5 && m.agente.receita === 3.25)
  teste('e calcula o saldo a partir dela', m.agente.saldo === 1.5)
  teste('string legível não é ilegível', m.ilegivel.length === 0)
}

/**
 * ── O SALDO NÃO EXISTE NA BASE, E NÃO PODE SER NEGATIVO ─────────────────────
 *
 * Gastar mais do que o orçamento é informação que vive no `gasto`. Deixar o saldo ir a negativo
 * propagava uma dívida inventada para `podeGastar` e para o painel.
 */
{
  teste('saldo é orçamento menos gasto', montarAgente(linha({ orcamento: 10, gasto: 4 })).agente.saldo === 6)
  teste('gastar tudo deixa saldo zero', montarAgente(linha({ orcamento: 10, gasto: 10 })).agente.saldo === 0)
  teste('gastar a mais NÃO dá saldo negativo', montarAgente(linha({ orcamento: 10, gasto: 25 })).agente.saldo === 0)
  teste('e o gasto real não se perde', montarAgente(linha({ orcamento: 10, gasto: 25 })).agente.gasto === 25)
}

/**
 * ── CAMPOS ILEGÍVEIS NÃO MATAM NINGUÉM ──────────────────────────────────────
 *
 * O caso mau: uma coluna vem nula depois de uma migração e a equipa inteira é parada de madrugada
 * por «não ter orçamento». Tratar o ilegível como zero é exactamente o que produz isso.
 */
{
  const semOrcamento = montarAgente(linha({ orcamento: null, gasto: 50 }))
  teste('orçamento nulo é sinalizado', semOrcamento.ilegivel.includes('orcamento'))

  const plano = planearJuizo(semOrcamento, AGORA)
  teste('e o agente NÃO é julgado', plano.juizo.decisao === 'espera')
  teste('nem muda de estado', plano.estado === null)
  teste('nem grava evento', plano.evento === null)
  teste('e o motivo manda corrigir a linha', plano.juizo.porque.includes('ilegíveis'))

  teste('gasto em texto lixo é sinalizado', montarAgente(linha({ gasto: 'não sei' })).ilegivel.includes('gasto'))
  teste('sem data de criação é sinalizado', montarAgente(linha({ criado_em: null })).ilegivel.includes('criado_em'))
  teste('pilar desconhecido é sinalizado', montarAgente(linha({ pilar: 'marketing' })).ilegivel.includes('pilar'))
  teste('estado desconhecido é sinalizado', montarAgente(linha({ estado: 'zombie' })).ilegivel.includes('estado'))

  // E o inverso: uma linha boa não é sinalizada. Um sinalizador que dispara sempre não protege
  // nada — faz é ninguém ser julgado nunca.
  teste('linha boa não é sinalizada', montarAgente(linha()).ilegivel.length === 0)
  teste('reformado é um estado conhecido', montarAgente(linha({ estado: 'reformado' })).ilegivel.length === 0)
}

/**
 * ── A JANELA SOMA-SE DOS EVENTOS CERTOS ─────────────────────────────────────
 *
 * O caso mau que isto apanha: `nasceu` tem o ORÇAMENTO no campo `valor`. Somá-lo como receita dava
 * 10 $ de lucro imaginário a cada agente no dia em que nasceu — e a regra nunca parava ninguém na
 * primeira avaliação, que é precisamente quando ela devia morder.
 */
{
  const eventos: EventoLido[] = [
    { agente_id: 'a1', tipo: 'nasceu', valor: ORCAMENTO_INICIAL, criado_em: haHoras(72) },
    { agente_id: 'a1', tipo: 'receita', valor: 30, criado_em: haHoras(5) },
    { agente_id: 'a1', tipo: 'gastou', valor: 4, criado_em: haHoras(5) },
    { agente_id: 'a1', tipo: 'avaliado', valor: 99, criado_em: haHoras(2) },
    { agente_id: 'a1', tipo: 'trabalho', valor: 77, criado_em: haHoras(2) },
  ]
  const s = somarJanela(eventos, AGORA).get('a1')
  teste('`nasceu` NÃO conta como receita', s?.receita === 30)
  teste('`avaliado` e `trabalho` não contam', s?.gasto === 4)

  // Fora da janela não entra. É a regra das 48 h a existir de facto.
  const velhos: EventoLido[] = [
    { agente_id: 'a1', tipo: 'receita', valor: 500, criado_em: haHoras(JANELA_HORAS + 2) },
    { agente_id: 'a1', tipo: 'receita', valor: 7, criado_em: haHoras(JANELA_HORAS - 2) },
  ]
  teste('receita velha fica fora da janela', somarJanela(velhos, AGORA).get('a1')?.receita === 7)

  // Datas impossíveis não decidem nada pelo acaso.
  const lixo: EventoLido[] = [
    { agente_id: 'a1', tipo: 'receita', valor: 100, criado_em: 'ontem' },
    { agente_id: 'a1', tipo: 'receita', valor: 100, criado_em: '' },
    // Um relógio trocado criava receita que ainda não aconteceu.
    { agente_id: 'a1', tipo: 'receita', valor: 100, criado_em: new Date(AGORA.getTime() + 7_200_000).toISOString() },
  ]
  teste('evento com data ilegível não entra', somarJanela(lixo, AGORA).get('a1') === undefined)

  // Um valor negativo gravado por engano não vira receita a subtrair-se nem gasto a creditar.
  const negativo: EventoLido[] = [{ agente_id: 'a1', tipo: 'gastou', valor: -5, criado_em: haHoras(1) }]
  teste('gasto negativo conta como gasto', somarJanela(negativo, AGORA).get('a1')?.gasto === 5)

  teste('agente sem eventos não aparece no mapa', somarJanela([], AGORA).get('a1') === undefined)
}

/**
 * ── SEM EVENTOS, A JANELA É ZERO E NÃO «DESCONHECIDA» ───────────────────────
 *
 * Nenhum evento em 48 horas significa que nada aconteceu — e é isso que a regra tem de julgar.
 * Passar `undefined` fazia `vida.ts` cair para o acumulado e um agente que já tinha sido bom
 * escapava à regra para sempre.
 */
{
  const m = montarAgente(linha({ receita: 400, gasto: 50, orcamento: 60 }), undefined)
  teste('janela a zero quando não há eventos', m.agente.receita_janela === 0 && m.agente.gasto_janela === 0)

  const p = planearJuizo(m, AGORA)
  teste('quem foi bom mas não mexe há 48 h não passa como lucrativo', p.juizo.decisao !== 'continua')
  teste('e o motivo não cita o acumulado', !p.juizo.porque.includes('400'))
}

/**
 * ── O QUE SE ESCREVE, E O QUE NÃO SE ESCREVE DUAS VEZES ─────────────────────
 *
 * O caso mau: o cron corre a cada poucos minutos. Gravar `avisado` em cada passagem manda o mesmo
 * aviso dezenas de vezes por dia até o agente morrer — e enche o livro de onde a janela é somada.
 */
{
  const emRisco = montarAgente(linha({ orcamento: 10, gasto: 4 }), { receita: 0, gasto: 4 })

  const primeira = planearJuizo(emRisco, AGORA)
  teste('o primeiro aviso muda o estado', primeira.estado === 'em_risco')
  teste('e grava evento `avisado`', primeira.evento?.tipo === 'avisado')
  teste('com o motivo por escrito', (primeira.evento?.detalhe ?? '').length > 20)

  // Agora o agente JÁ está em risco. A mesma situação não se volta a gravar.
  const jaAvisado = montarAgente(linha({ estado: 'em_risco', orcamento: 10, gasto: 4 }), { receita: 0, gasto: 4 })
  const segunda = planearJuizo(jaAvisado, AGORA)
  teste('o segundo aviso não grava nada', segunda.evento === null)
  teste('nem volta a escrever o estado', segunda.estado === null)
  teste('e diz que o aviso já foi dado', segunda.nota.includes('já dado'))
}

/**
 * ── PARAR ESCREVE O MOTIVO, E A HORA DO JUÍZO ───────────────────────────────
 *
 * Um agente «parado» sem motivo escrito é um agente que ninguém consegue defender nem recuperar.
 * E a hora é a do juízo, não a do Postgres: se fossem diferentes, o painel mostrava uma hora e a
 * regra tinha usado outra.
 */
{
  const morto = montarAgente(linha({ orcamento: 10, gasto: 10 }), { receita: 0, gasto: 10 })
  const p = planearJuizo(morto, AGORA)
  teste('sem lucro e sem saldo, pára', p.estado === 'parado')
  teste('grava evento `parou`', p.evento?.tipo === 'parou')
  teste('escreve o motivo na linha', (p.parado_porque ?? '').length > 20)
  teste('e a hora do juízo', p.parado_em === AGORA.toISOString())

  // O limite do dono: parar é mudar de estado. Nada aqui produz um apagamento.
  teste('parar não produz nenhuma ordem de apagar', !JSON.stringify(p).toLowerCase().includes('delete'))
}

/**
 * ── QUEM RECUPERA VOLTA A `vivo` ────────────────────────────────────────────
 *
 * Sem isto, um agente que esteve em risco e voltou a dar lucro ficava marcado em risco para
 * sempre, e o painel mentia ao dono exactamente sobre o caso bom.
 */
{
  const recuperou = montarAgente(linha({ estado: 'em_risco', orcamento: 10, gasto: 4 }), { receita: 40, gasto: 4 })
  const p = planearJuizo(recuperou, AGORA)
  teste('quem voltou a dar lucro volta a vivo', p.estado === 'vivo')
  teste('e isso fica no livro', p.evento?.tipo === 'avaliado')
  teste('com nota a dizer que voltou', p.nota.includes('voltou'))
}

/**
 * ── O REGISTO DA JANELA, UMA VEZ POR JANELA ─────────────────────────────────
 *
 * Quando nada muda, grava-se uma vez por janela — prova de que a regra correu e do que viu — e não
 * a cada passagem.
 */
{
  const bom = montarAgente(linha({ orcamento: 10, gasto: 2 }), { receita: 40, gasto: 2 })

  const avaliadoAgora = planearJuizo(bom, AGORA, haHoras(1))
  teste('avaliado há 1 h não volta a gravar', avaliadoAgora.evento === null)

  const avaliadoHaMuito = planearJuizo(bom, AGORA, haHoras(JANELA_HORAS + 1))
  teste('passada a janela, grava o registo', avaliadoHaMuito.evento?.tipo === 'avaliado')

  const nuncaAvaliado = planearJuizo(bom, AGORA, null)
  teste('quem nunca foi avaliado grava à primeira', nuncaAvaliado.evento?.tipo === 'avaliado')

  // Uma data de avaliação ilegível não faz o motor calar-se para sempre.
  teste('avaliado_em ilegível trata-se como nunca avaliado',
    planearJuizo(bom, AGORA, 'quarta-feira').evento?.tipo === 'avaliado')
}

/**
 * ── PAUSADO PELO DONO NÃO É TOCADO ──────────────────────────────────────────
 * A supervisão humana ganha à regra automática — é o ponto de haver supervisão.
 */
{
  const pausado = montarAgente(linha({ estado: 'pausado', pausado: true, orcamento: 10, gasto: 99 }), { receita: 0, gasto: 99 })
  const p = planearJuizo(pausado, AGORA)
  teste('pausado não é parado pelo motor', p.estado === null || p.estado === 'pausado')
  teste('e não gera evento de paragem', p.evento?.tipo !== 'parou')
  teste('nem data de paragem', p.parado_em === null)
}

/**
 * ── A CARÊNCIA ──────────────────────────────────────────────────────────────
 * Um agente nascido há três horas não se julga, e muito menos se pára.
 */
{
  const bebe = montarAgente(linha({ criado_em: haHoras(3), orcamento: 10, gasto: 10 }), { receita: 0, gasto: 10 })
  const p = planearJuizo(bebe, AGORA)
  teste('um recém-nascido sem saldo NÃO é parado', p.estado !== 'parado')
  teste('e o motivo fala da carência', p.juizo.porque.includes('carência'))
}

/**
 * ── A EQUIPA INTEIRA, DE UMA VEZ ────────────────────────────────────────────
 * O plano tem de distribuir os eventos pelo agente CERTO. Trocar a soma entre dois agentes é o
 * erro que mata o bom e salva o mau.
 */
{
  const equipa: LinhaAgente[] = [
    linha({ id: 'bom', nome: 'Bom', orcamento: 10, gasto: 2 }),
    linha({ id: 'mau', nome: 'Mau', orcamento: 10, gasto: 10 }),
    linha({ id: 'novo', nome: 'Novo', criado_em: haHoras(2), orcamento: 10, gasto: 0 }),
    linha({ id: 'roto', nome: 'Roto', orcamento: null }),
  ]
  const eventos: EventoLido[] = [
    { agente_id: 'bom', tipo: 'receita', valor: 50, criado_em: haHoras(3) },
    { agente_id: 'bom', tipo: 'gastou', valor: 2, criado_em: haHoras(3) },
    { agente_id: 'mau', tipo: 'gastou', valor: 10, criado_em: haHoras(3) },
  ]
  const plano = planearEquipa(equipa, eventos, AGORA)
  const por = (nome: string) => plano.find((p) => p.nome === nome)!

  teste('a receita foi para o agente certo', por('Bom').juizo.decisao === 'continua')
  teste('e o outro não a recebeu', por('Mau').estado === 'parado')
  teste('o recém-nascido fica à espera', por('Novo').juizo.decisao === 'espera')
  teste('a linha rota é ignorada', por('Roto').nota.startsWith('ignorado'))
  teste('planeia um resultado por agente', plano.length === 4)
  teste('e todos trazem motivo escrito', plano.every((p) => p.juizo.porque.length > 15))
}

if (falhas.length) {
  console.error(`agentes/motor: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'agentes/motor: numeric em string, janela só dos eventos certos, ilegível não mata, e o aviso sai uma vez ✓',
)
