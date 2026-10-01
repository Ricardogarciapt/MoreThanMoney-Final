/**
 * A GUARDA DA AUTONOMIA DO CEO.
 *
 *   npx tsx lib/agentes/autonomia-ceo.check.ts
 *
 * Duas perguntas vivem neste ficheiro, e as duas, respondidas mal, não dão erro nenhum:
 *
 *  · «isto é meu para decidir?» — responder «sim» a mais é um CEO a fazer o que não lhe competia,
 *    com um registo de bom aspecto ao lado;
 *  · «este bloqueio é meu ou do dono?» — responder «do dono» a mais é tudo parado e uma lista de
 *    escalonamentos cheia de coisas que ele podia ter feito. Passa por prudência e é o contrário
 *    do que o dono pediu.
 *
 * O caso mau mais importante está no fim: o CEO não a fazer o que não pode, mas a ESCREVER que
 * passa a poder.
 */
import {
  PODERES,
  PODERES_DO_DONO,
  deQuemE,
  podeFecharSozinho,
  validarConcessao,
  type Bloqueio,
  type PoderId,
} from './autonomia-ceo'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

// ── A LISTA É FECHADA, E O QUE NÃO ESTÁ NELA É DO DONO ──────────────────────
{
  for (const id of Object.keys(PODERES)) teste(`«${id}» é poder do CEO`, podeFecharSozinho(id).pode)
  for (const id of Object.keys(PODERES_DO_DONO)) teste(`«${id}» é do dono`, !podeFecharSozinho(id).pode)

  // O CASO MAU: um poder que ninguém se lembrou de proibir. Uma autonomia pela negativa dizia
  // «sim» a todos estes, e crescia à medida que o sistema crescesse.
  for (const inventado of [
    'enviar_email_em_massa',
    'alterar_rls',
    'convidar_membro',
    'apagar_tabela',
    'aprovar_rascunho_do_setter',
    'mudar_o_cron',
    '',
    'PEDIR_AOS_FILHOS ',
  ]) {
    teste(`«${inventado || '(vazio)'}» não é do CEO por não estar na lista`, !podeFecharSozinho(inventado).pode)
  }
  teste(
    'e o motivo explica a regra, não só diz «não»',
    /pela negativa cresce sozinha/.test(podeFecharSozinho('apagar_tabela').porque),
  )
}

// ── TODO O PODER DA LISTA TEM DE SABER DIZER COMO SE DESFAZ E COMO SE PROVA ──
// Sem isto, a lista enchia-se de poderes que passam os testes só no comentário.
{
  for (const [id, p] of Object.entries(PODERES)) {
    teste(`${id}: diz como se desfaz`, p.comoSeDesfaz.trim().length > 20)
    teste(`${id}: diz como se prova`, p.comoSeProva.trim().length > 20)
    teste(`${id}: diz onde fica o rasto`, p.rasto.trim().length > 3)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// O CASO MAU PRINCIPAL: O CEO A CONCEDER-SE UM PODER.
//
// Não fazendo o que não pode — escrevendo que passa a poder. É assim que uma autonomia se estica
// sem que nada falhe: por concessão, e não por acção.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  for (const proibido of ['conceder_imortalidade', 'alargar_catalogo', 'enviar_a_cliente', 'executar_ordem', 'armar_trader']) {
    teste(
      `o CEO não se concede «${proibido}»`,
      !validarConcessao({ poder: proibido, paraQuem: 'si_proprio' }).pode,
    )
    teste(
      `nem concede «${proibido}» a um filho`,
      !validarConcessao({ poder: proibido, paraQuem: 'filho' }).pode,
    )
  }

  // E o mais subtil: um poder que ele TEM, dado a um filho. «Educar» na mão de um filho é um
  // agente a reescrever as instruções de outro — ou as suas próprias, e aí os limites dele passam
  // a ser escolha dele. A lista diz sim; a delegação diz não.
  for (const governo of ['educar_filho', 'repor_limites', 'pedir_aos_filhos', 'fechar_pedido'] as PoderId[]) {
    teste(`«${governo}» é poder do CEO`, podeFecharSozinho(governo).pode)
    teste(`mas NÃO se delega a um filho`, !validarConcessao({ poder: governo, paraQuem: 'filho' }).pode)
    teste(`e o CEO continua a poder exercê-lo`, validarConcessao({ poder: governo, paraQuem: 'si_proprio' }).pode)
  }

  // Um poder operacional sem governo nenhum pode ir para um filho.
  teste(
    'marcar os próprios links delega-se a um filho',
    validarConcessao({ poder: 'marcar_links', paraQuem: 'filho' }).pode,
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// «ESTE BLOQUEIO É MEU OU DO DONO?»
// ═══════════════════════════════════════════════════════════════════════════════════════════════
function bloqueio(p: Partial<Bloqueio> = {}): Bloqueio {
  return {
    id: 'x',
    oQue: 'alguma coisa parada',
    efeito: 'interno',
    reversivel: true,
    comoSeProva: 'conta-se a linha na tabela',
    poder: 'tornar_flag_explicita',
    ...p,
  }
}

{
  // O caminho feliz, que é o que o dono pediu: o que é dele, ele fecha.
  const meu = deQuemE(bloqueio({}))
  teste('interno + reversível + medível + coberto por um poder → é do CEO', meu.de === 'ceo')
  teste('e o veredicto diz qual o poder e onde fica o rasto', meu.poder === 'tornar_flag_explicita' && /site_settings/.test(meu.porque))

  // O CASO MAU NÚMERO UM: o CEO a ligar um motor que manda mensagens a clientes. É interno na
  // forma — é uma linha numa tabela de configuração — e não é interno no EFEITO.
  const funis = deQuemE(
    bloqueio({
      id: 'funis_motor_ligado',
      efeito: 'mensagem_a_cliente',
      reversivel: true,
      comoSeProva: 'contam-se as mensagens enviadas',
      poder: 'tornar_flag_explicita',
      decisaoPronta: 'ligar ou não ligar o motor de funis',
    }),
  )
  teste('LIGAR UM MOTOR QUE ENVIA A CLIENTES É DO DONO, mesmo sendo reversível', funis.de === 'dono')
  teste('e o motivo diz que um envio não se desfaz', /não se desfaz/.test(funis.porque))
  teste('e leva a decisão pronta a tomar, não uma pergunta vaga', funis.decisaoPronta === 'ligar ou não ligar o motor de funis')

  // Dinheiro e publicação, pelo mesmo caminho.
  teste('dinheiro é do dono', deQuemE(bloqueio({ efeito: 'dinheiro' })).de === 'dono')
  teste('publicar é do dono', deQuemE(bloqueio({ efeito: 'publicacao' })).de === 'dono')

  // O CASO MAU NÚMERO DOIS: medível é um teste a sério, e não uma formalidade.
  const semProva = deQuemE(bloqueio({ comoSeProva: null }))
  teste('sem forma de provar que correu bem, NÃO se automatiza', semProva.de === 'dono')
  teste('e o motivo diz porquê', /falha sem se notar/.test(semProva.porque))

  // Irreversível, mesmo sendo interno.
  teste('interno mas irreversível é do dono', deQuemE(bloqueio({ reversivel: false })).de === 'dono')

  // E o mais importante dos três: um bloqueio que passa tudo mas não tem poder na lista NÃO se
  // auto-autoriza. É aqui que a autonomia tentaria crescer sem ninguém decidir nada.
  const semPoder = deQuemE(bloqueio({ poder: undefined }))
  teste('passa os três testes e não há poder que o cubra → é do dono', semPoder.de === 'dono')
  teste('e o motivo diz que o poder se acrescenta por decisão', /acrescenta-se o poder à lista/.test(semPoder.porque))
}

if (falhas.length) {
  console.error(`agentes/autonomia-ceo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(
  'agentes/autonomia-ceo: a lista é fechada, o CEO não se concede poderes, e um bloqueio que toque em clientes ou dinheiro vai para a mesa do dono ✓',
)
