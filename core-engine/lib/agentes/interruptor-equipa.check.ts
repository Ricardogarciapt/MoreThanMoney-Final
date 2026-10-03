/**
 * A GUARDA DO INTERRUPTOR DA EQUIPA.
 *
 *   npx tsx lib/agentes/interruptor-equipa.check.ts
 *
 * ═══ O QUE ESTA GUARDA EXISTE PARA APANHAR ═════════════════════════════════════════════════
 *
 * O interruptor é um botão que mexe em sete agentes de uma vez, e os dois erros que ele pode
 * cometer NÃO DÃO ERRO NENHUM no ecrã — mudam estados que ninguém mandou mudar, e só se descobre
 * dias depois, ao reparar que um agente está a trabalhar quando devia estar quieto.
 *
 * Por isso quase todos os testes aqui são do CASO MAU. Provar que «pausar pausa» é fácil e não
 * protege de nada; o que protege é provar que retomar a equipa NÃO ressuscita quem o dono pausou
 * à mão, e que pausar a equipa NÃO apaga a morte de quem foi parado.
 */
import {
  MARCA_EQUIPA,
  decidirInterruptor,
  motivoDoInterruptor,
  veioDoInterruptor,
  type AgenteNoInterruptor,
} from './interruptor-equipa'

let falhas = 0
function certo(condicao: boolean, oQue: string) {
  if (condicao) return
  falhas++
  console.error('  ✗ ' + oQue)
}

/** Atalho para escrever agentes de teste sem repetir campos. */
function ag(p: Partial<AgenteNoInterruptor> & { nome: string }): AgenteNoInterruptor {
  return {
    id: p.id ?? p.nome.toLowerCase().replace(/\s+/g, '-'),
    nome: p.nome,
    estado: p.estado ?? 'vivo',
    pausado: p.pausado ?? false,
    pausadoPelaEquipa: p.pausadoPelaEquipa ?? false,
  }
}

const nomes = (ms: { nome: string }[]) => ms.map((m) => m.nome).sort().join(',')

// ─── O CASO MAU PRINCIPAL ────────────────────────────────────────────────────────────────────
// O dono pausou o Trader à mão. Depois pausou a equipa, e agora retoma a equipa.
// Um ciclo ingénuo retomava o Trader — e apagava a decisão dele sem um único erro no ecrã.
{
  const equipa = [
    ag({ nome: 'Trader Papel', estado: 'pausado', pausado: true, pausadoPelaEquipa: false }),
    ag({ nome: 'CEO', estado: 'pausado', pausado: true, pausadoPelaEquipa: true }),
    ag({ nome: 'Produto SaaS', estado: 'pausado', pausado: true, pausadoPelaEquipa: true }),
  ]
  const plano = decidirInterruptor(equipa, 'retomar')
  certo(nomes(plano.mexer) === 'CEO,Produto SaaS', 'retomar a equipa só mexe em quem o botão pausou')
  certo(
    plano.deixar.some((d) => d.nome === 'Trader Papel' && /à mão/.test(d.porque)),
    'o pausado à mão fica, e o painel diz porquê',
  )
}

// ─── PAUSAR NÃO PODE APAGAR UMA PARAGEM ──────────────────────────────────────────────────────
// `parado` guarda data e motivo. Escrever `pausado` por cima perdia a razão pela qual ele morreu —
// e essa razão é exactamente o que se guardou para ensinar.
{
  const equipa = [
    ag({ nome: 'Vendas de Formação', estado: 'parado', pausado: false }),
    ag({ nome: 'Conteúdo LMS' }),
  ]
  const plano = decidirInterruptor(equipa, 'pausar')
  certo(nomes(plano.mexer) === 'Conteúdo LMS', 'pausar a equipa não toca em quem está parado')
  certo(
    plano.deixar.some((d) => d.nome === 'Vendas de Formação' && /apagava/.test(d.porque)),
    'e explica que pausar por cima apagava a data e o motivo da paragem',
  )
}

// ─── RETOMAR TAMBÉM NÃO RESSUSCITA EM MASSA ──────────────────────────────────────────────────
// Parar é um limite do dono. Volta um a um, com a mão dele.
{
  const plano = decidirInterruptor([ag({ nome: 'Manutenção do Site', estado: 'parado' })], 'retomar')
  certo(plano.mexer.length === 0, 'retomar a equipa não ressuscita um agente parado')
  certo(/um a um/.test(plano.deixar[0]?.porque ?? ''), 'e diz que parar volta um a um')
}

// ─── CARREGAR DUAS VEZES NÃO É ERRO, MAS TEM DE SE DISTINGUIR DE «CORREU MAL» ─────────────────
{
  const jaPausados = [
    ag({ nome: 'CEO', estado: 'pausado', pausado: true, pausadoPelaEquipa: true }),
    ag({ nome: 'Produto SaaS', estado: 'pausado', pausado: true, pausadoPelaEquipa: true }),
  ]
  const plano = decidirInterruptor(jaPausados, 'pausar')
  certo(plano.mexer.length === 0, 'pausar duas vezes seguidas não volta a mexer em ninguém')
  certo(/Nada mudou/.test(plano.resumo), 'e o resumo diz «nada mudou» em vez de parecer uma falha')
  certo(!/0 agentes/.test(plano.resumo), 'o resumo não despeja um «0 agentes» seco')
}

// ─── A EQUIPA VAZIA DIZ QUE ESTÁ VAZIA ───────────────────────────────────────────────────────
{
  const plano = decidirInterruptor([], 'pausar')
  certo(plano.mexer.length === 0 && plano.deixar.length === 0, 'equipa vazia não produz movimentos')
  certo(/Não há agentes/.test(plano.resumo), 'e diz que não há agentes, em vez de «nada mudou»')
}

// ─── UM ESTADO DESCONHECIDO NÃO VIRA «VIVO» POR OMISSÃO ──────────────────────────────────────
// `em_risco` é um estado real. Pausá-lo é legítimo; o que não pode é ser tratado como `parado`
// (e ficar de fora) nem desaparecer do plano sem explicação.
{
  const plano = decidirInterruptor([ag({ nome: 'Analista de Scanners', estado: 'em_risco' })], 'pausar')
  certo(plano.mexer.length === 1, 'um agente em risco pode ser pausado pelo interruptor')
  const total = plano.mexer.length + plano.deixar.length
  certo(total === 1, 'nenhum agente desaparece do plano: cada um sai em mexer ou em deixar')
}

// ─── TODO O AGENTE APARECE EXACTAMENTE UMA VEZ ───────────────────────────────────────────────
// A conta tem de fechar nos dois sentidos, senão o painel mente sobre o que aconteceu.
{
  const equipa = [
    ag({ nome: 'A' }),
    ag({ nome: 'B', estado: 'pausado', pausado: true, pausadoPelaEquipa: true }),
    ag({ nome: 'C', estado: 'pausado', pausado: true, pausadoPelaEquipa: false }),
    ag({ nome: 'D', estado: 'parado' }),
  ]
  for (const acao of ['pausar', 'retomar'] as const) {
    const p = decidirInterruptor(equipa, acao)
    const vistos = [...p.mexer, ...p.deixar].map((m) => m.id)
    certo(vistos.length === 4, `${acao}: os quatro agentes aparecem no plano`)
    certo(new Set(vistos).size === 4, `${acao}: nenhum agente aparece duas vezes`)
  }
}

// ─── A MARCA TEM DE SOBREVIVER À IDA E VOLTA ─────────────────────────────────────────────────
// `acaoManual` escreve o evento como `Pausado pelo dono: <motivo>`. Se a marca não for reconhecida
// nessa forma, o retomar não encontra ninguém e o botão parece não fazer nada.
{
  const comNota = motivoDoInterruptor('vou estar fora')
  certo(veioDoInterruptor(`Pausado pelo dono: ${comNota}`), 'a marca é reconhecida com nota do dono')
  const semNota = motivoDoInterruptor('   ')
  certo(semNota === MARCA_EQUIPA, 'motivo em branco fica só com a marca')
  certo(veioDoInterruptor(`Pausado pelo dono: ${semNota}`), 'a marca é reconhecida sem nota')
  certo(!veioDoInterruptor('Pausado pelo dono: vou estar fora'), 'uma pausa à mão NÃO leva a marca')
  certo(!veioDoInterruptor(null) && !veioDoInterruptor(undefined), 'evento sem detalhe não é do botão')
}

// ─── O SINGULAR E O PLURAL NÃO SE ESTROPIAM ──────────────────────────────────────────────────
// Isto é cosmético, mas é a frase que o Ricardo lê — «1 agentes pausados» desacredita o resto.
{
  const um = decidirInterruptor([ag({ nome: 'CEO' })], 'pausar')
  certo(/^1 agente pausado\./.test(um.resumo), `singular correcto, veio «${um.resumo}»`)
  const dois = decidirInterruptor([ag({ nome: 'CEO' }), ag({ nome: 'A' })], 'pausar')
  certo(/^2 agentes pausados\./.test(dois.resumo), `plural correcto, veio «${dois.resumo}»`)
}

if (falhas) {
  console.error(`interruptor-equipa: ${falhas} falha(s)`)
  process.exit(1)
}
console.log('interruptor-equipa: o botão da equipa não apaga decisões do dono ✓')
