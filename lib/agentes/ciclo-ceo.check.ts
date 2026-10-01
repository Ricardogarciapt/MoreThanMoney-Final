/**
 * A GUARDA DO CICLO DO CEO.
 *
 *   npx tsx lib/agentes/ciclo-ceo.check.ts
 *
 * Este ficheiro decide a quem o CEO cobra resultados. Tudo o que ele pode fazer de errado fica
 * BONITO no ecrã:
 *
 *  · cobrar a quem o dono mandou parar — o registo fica com bom aspecto e a supervisão humana foi
 *    atropelada;
 *  · cobrar a um agente de três horas — parece diligência e é cobrar o que o sistema ainda não deu
 *    tempo de fazer;
 *  · repetir o mesmo pedido todos os dias — a tabela enche, e ao segundo aviso ninguém lê;
 *  · deixar prazos abertos para sempre — e aí a pergunta «isto foi cumprido?» não tem resposta;
 *  · pedir mais trabalho a quem não tem onde ser medido — foi isto que quase parou a equipa a
 *    01/10, e é o erro que dá MAIS vontade de cometer;
 *  · pedir algo que atravesse um limite (enviar, cobrar, publicar, executar) — e aqui o pior: não
 *    há nada que grite. A autonomia alarga-se um pedido de cada vez.
 */
import {
  ACCOES,
  ACCOES_RECUSADAS,
  PRAZO_HORAS,
  accaoPara,
  accaoPermitida,
  planearCiclo,
  type AgenteNoCiclo,
  type PedidoAberto,
} from './ciclo-ceo'
import { CARENCIA_HORAS, julgar, type Agente } from './vida'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const AGORA = new Date('2026-10-05T06:00:00Z')
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString()
const CEO_ID = 'ceo-1'

const ag = (p: Partial<Agente> = {}): Agente => ({
  id: 'f1', nome: 'Filho', pilar: 'desenvolvimento', pai_id: CEO_ID, estado: 'vivo',
  criado_em: haHoras(100), gasto: 4, receita: 0, receita_janela: 0, gasto_janela: 4, saldo: 6, ...p,
})

const no = (a: Agente): AgenteNoCiclo => ({
  agente: a,
  juizo: julgar(a, AGORA),
  idadeHoras: (AGORA.getTime() - Date.parse(a.criado_em)) / 3_600_000,
})

const ceo = (): AgenteNoCiclo =>
  no(ag({ id: CEO_ID, nome: 'CEO', pilar: 'ceo', pai_id: null, gasto: 20, saldo: 0, gasto_janela: 20 }))

const plano = (equipa: AgenteNoCiclo[], abertos: PedidoAberto[] = []) =>
  planearCiclo({ ceoId: CEO_ID, equipa, abertos, agora: AGORA })

// ── O caso normal: quem não se paga recebe UM pedido, concreto e com prazo ───
{
  const p = plano([ceo(), no(ag({}))])
  teste('quem não se paga recebe pedido', p.pedidos.length === 1)
  teste('o pedido diz a quem', p.pedidos[0]?.paraAgenteId === 'f1')
  teste('tem prazo no futuro', Date.parse(p.pedidos[0]?.prazoISO ?? '') > AGORA.getTime())
  teste('tem o que fazer, por extenso', (p.pedidos[0]?.pedido ?? '').length > 60)
  teste('e tem o porquê medido', /zero|0\.00/.test(p.pedidos[0]?.porque ?? ''))
  teste('e como se vê que foi cumprido', /Verifica-se assim/.test(p.pedidos[0]?.porque ?? ''))
}

// ── O CEO NÃO SE PEDE NADA A SI PRÓPRIO ─────────────────────────────────────
// Ele é imortal e não se paga (receita zero, gasto 20): sem esta regra era o primeiro a aparecer na
// lista dos cobrados, e um pedido do CEO para o CEO é uma linha que não ensina nada a ninguém.
{
  const p = plano([ceo()])
  teste('o CEO não se pressiona a si próprio', p.pedidos.length === 0)
  teste('e diz porque não', p.ignorados.some((i) => /responde ao dono/.test(i.porque)))
}

// ── A SUPERVISÃO DO DONO GANHA — E A REGRA TEM DE SER DESTE FICHEIRO ────────
//
// ESTE TESTE ESTAVA ERRADO À PRIMEIRA, e vale a pena ficar escrito porque é um erro típico de
// guarda: com o juízo montado por `julgar`, um agente pausado chega aqui com `decisao: 'espera'` e
// é recusado pelo ramo do «não julgado». Ou seja, o teste passava mesmo com a regra do pausado
// APAGADA — provava o `vida.ts`, não o ciclo.
//
// Importa que a regra viva nos dois sítios: se amanhã alguém decidir que um agente pausado ainda é
// julgado (para o painel lhe mostrar a conta, por exemplo), o ciclo começava a cobrar resultados a
// quem uma pessoa mandou parar, e nada gritaria. Por isso o juízo aqui é forjado para ser um que
// GERARIA pedido, e o que se prova é que o ciclo o recusa por sua conta.
{
  const pausadoMasJulgado: AgenteNoCiclo = {
    agente: ag({ pausado: true, estado: 'pausado' }),
    juizo: { decisao: 'avisa', estado: 'em_risco', resultado: -4, porque: 'sem lucro' },
    idadeHoras: 100,
  }
  const p = plano([ceo(), pausadoMasJulgado])
  teste('não se cobra a quem o dono pausou, mesmo que o juízo o julgue', p.pedidos.length === 0)
  teste('e o motivo é a decisão de uma pessoa', p.ignorados.some((i) => /uma pessoa mandou parar/.test(i.porque)))
}

// ── PARADO E REFORMADO NÃO SE COBRAM ────────────────────────────────────────
// Pelo mesmo motivo do teste acima, o juízo é forjado: o que se prova é o ramo deste ficheiro.
{
  const comoSeFosseCobravel = (estado: Agente['estado']): AgenteNoCiclo => ({
    agente: ag({ estado }),
    juizo: { decisao: 'avisa', estado: 'em_risco', resultado: -4, porque: 'sem lucro' },
    idadeHoras: 100,
  })
  const pp = plano([ceo(), comoSeFosseCobravel('parado')])
  teste('um parado não recebe pedido', pp.pedidos.length === 0)
  teste('e diz-se que não trabalha', pp.ignorados.some((i) => /não trabalha/.test(i.porque)))
  teste('um reformado não recebe pedido', plano([ceo(), comoSeFosseCobravel('reformado')]).pedidos.length === 0)
}

// ── A CARÊNCIA ──────────────────────────────────────────────────────────────
// O caso mau tem muito bom aspecto: um agente nasce às 23h, o cron corre às 6h, e ele apanha um
// pedido com prazo por não ter vendido nas primeiras sete horas de vida.
{
  // Juízo forjado outra vez, e pelo mesmo motivo: na carência o `julgar` devolve `espera`, e um
  // teste que confiasse nisso passava com a regra da carência apagada deste ficheiro.
  const bebe = (h: number): AgenteNoCiclo => ({
    agente: ag({ criado_em: haHoras(h) }),
    juizo: { decisao: 'avisa', estado: 'em_risco', resultado: -4, porque: 'sem lucro' },
    idadeHoras: h,
  })
  const p = plano([ceo(), bebe(5)])
  teste('um agente de 5 horas não é cobrado', p.pedidos.length === 0)
  teste('e o motivo fala da carência', p.ignorados.some((i) => /carência/.test(i.porque)))

  // À 47.ª hora ainda não; depois da carência, sim.
  teste('à 47.ª hora ainda não se cobra', plano([ceo(), bebe(CARENCIA_HORAS - 1)]).pedidos.length === 0)
  teste('às 50 h já se cobra', plano([ceo(), bebe(50)]).pedidos.length === 1)
  // E com o juízo verdadeiro o resultado é o mesmo — as duas réguas concordam, que é o que se quer.
  teste('e com o juízo real também não se cobra', plano([ceo(), no(ag({ criado_em: haHoras(5) }))]).pedidos.length === 0)
}

// ── QUEM SE PAGA NÃO É PRESSIONADO ──────────────────────────────────────────
{
  const bom = no(ag({ receita: 90, receita_janela: 90, gasto: 10, gasto_janela: 10 }))
  const p = plano([ceo(), bom])
  teste('quem se paga não recebe pedido', p.pedidos.length === 0)
  teste('e isso diz-se', p.ignorados.some((i) => /[Pp]aga-se/.test(i.porque)))
}

// ── NÃO SE REPETE O PEDIDO ENQUANTO O PRAZO CORRE ───────────────────────────
// Sem isto, o cron diário manda o mesmo pedido todos os dias até o agente morrer. Não dá erro: dá
// uma tabela cheia de cópias e um registo que deixa de provar o que quer que seja.
{
  const aberto: PedidoAberto = {
    id: 'p1', para_agente_id: 'f1', accao: 'medir',
    prazo: new Date(AGORA.getTime() + 10 * 3_600_000).toISOString(), criado_em: haHoras(2),
  }
  const p = plano([ceo(), no(ag({}))], [aberto])
  teste('com pedido aberto não se pede outra vez', p.pedidos.length === 0)
  teste('nem se fecha o que ainda está no prazo', p.aFechar.length === 0)
  teste('e o motivo aponta ao pedido que existe', p.ignorados.some((i) => /já tem o pedido/i.test(i.porque)))
}

// ── UM PRAZO QUE PASSOU FECHA-SE COM DESFECHO ───────────────────────────────
{
  const expirado: PedidoAberto = {
    id: 'p1', para_agente_id: 'f1', accao: 'medir', prazo: haHoras(3), criado_em: haHoras(51),
  }
  const p = plano([ceo(), no(ag({}))], [expirado])
  teste('o prazo passado é fechado', p.aFechar.length === 1 && p.aFechar[0].id === 'p1')
  teste('com desfecho sem_resposta', p.aFechar[0]?.desfecho === 'sem_resposta')
  teste('e com o motivo escrito', (p.aFechar[0]?.porque ?? '').length > 40)
  teste('e a seguir pede-se outra coisa', p.pedidos.length === 1)

  // ── À SEGUNDA, A PERGUNTA MUDA ──
  // É a lição de 01/10 virada em procedimento: se o agente continua a zero depois de já ter sido
  // cobrado, a hipótese «não está medido» tem de poder ser dita por ele. Insistir em «trabalha
  // mais» é a forma educada de o matar sem o ouvir.
  teste('à segunda cobrança pede-se justificação', p.pedidos[0]?.accao === 'justificar')
}

// ── UM PRAZO ILEGÍVEL NÃO SE FECHA ──────────────────────────────────────────
// Dar `sem_resposta` por não se conseguir ler uma data era culpar o agente de um defeito de dados.
{
  const estranho: PedidoAberto = {
    id: 'p1', para_agente_id: 'f1', accao: 'medir', prazo: 'não sei', criado_em: haHoras(51),
  }
  const p = plano([ceo(), no(ag({}))], [estranho])
  teste('prazo ilegível não é fechado como sem resposta', p.aFechar.length === 0)
  teste('e também não se pede outra coisa por cima', p.pedidos.length === 0)
}

// ── A QUEM NÃO É MEDIDO PEDE-SE MEDIÇÃO, NÃO MAIS TRABALHO ──────────────────
// O erro que dá mais vontade de cometer. A 01/10 a equipa toda tinha receita zero e trabalho feito;
// o que faltava era um link com `?ag=`. Mandar produzir mais produz mais trabalho invisível.
{
  const zero = accaoPara(no(ag({ receita_janela: 0, gasto_janela: 4 })), false)
  teste('receita zero → medir', zero.accao === 'medir')
  teste('e o porquê admite as duas hipóteses', /MEDIÇÃO/.test(zero.porque))

  const caro = accaoPara(no(ag({ receita_janela: 5, gasto_janela: 12, receita: 5, gasto: 12 })), false)
  teste('vende mas gasta mais → baixar o custo', caro.accao === 'baixar_custo')

  const bom = accaoPara(no(ag({ receita_janela: 90, gasto_janela: 3 })), false)
  teste('quem se paga, se fosse pedido algo, era crescer', bom.accao === 'propor')
}

// ── O CATÁLOGO É FECHADO: É AQUI QUE OS LIMITES SE IMPÕEM ───────────────────
{
  for (const a of Object.keys(ACCOES)) teste(`«${a}» é do catálogo`, accaoPermitida(a).pode)

  // Os quatro que ficaram de fora de propósito. Se algum destes passar a `pode: true`, a autonomia
  // do CEO atravessou um limite do dono — e nada no sistema grita.
  for (const a of ['enviar', 'cobrar', 'publicar', 'executar_ordem']) {
    teste(`«${a}» é recusado`, !accaoPermitida(a).pode)
    teste(`e a recusa de «${a}» é explicada`, accaoPermitida(a).porque.length > 30)
    teste(`«${a}» está nomeado como decisão`, a in ACCOES_RECUSADAS)
  }
  teste('uma acção inventada é recusada', !accaoPermitida('despedir_o_dono').pode)
  teste('vazio é recusado', !accaoPermitida('').pode && !accaoPermitida(null).pode)

  /**
   * E NENHUMA ACÇÃO DO CATÁLOGO DESCREVE UM ENVIO, UM PAGAMENTO OU UMA PUBLICAÇÃO.
   *
   * O catálogo pode ser fechado e ainda assim ter, dentro de uma acção, um texto que mande o agente
   * enviar uma mensagem ou mexer num preço. A guarda lê o TEXTO, não só os nomes — era por aí que
   * o limite se perdia sem ninguém acrescentar nada à lista.
   */
  const PROIBIDO = /\b(envia|enviar|manda uma mensagem|cobra|cobrar|transfere|transferir|paga ao|publica|publicar|altera o preço)\b/i
  for (const [nome, def] of Object.entries(ACCOES)) {
    const texto = `${def.oQue} ${def.comoSeVe}`
    // «publicar fica à espera do dono» é uma NEGAÇÃO e é a frase que se quer ter escrita; o que se
    // proíbe é a acção pedida ao agente. Por isso só se olha para a parte antes de «;» ou «—».
    const pedido = def.oQue.split(/[;—]/)[0]
    teste(`a acção «${nome}» não manda enviar, cobrar nem publicar`, !PROIBIDO.test(pedido))
    teste(`a acção «${nome}» diz como se verifica`, def.comoSeVe.length > 20 && texto.length > 60)
    teste(`a acção «${nome}» tem prazo`, def.prazoHoras > 0 && def.prazoHoras <= 7 * 24)
  }
  teste('o prazo por omissão é a janela da régua de vida', PRAZO_HORAS === 48)
}

// ── CAMPOS ILEGÍVEIS NÃO SE COBRAM ──────────────────────────────────────────
// O mesmo princípio do motor: corrige-se a linha, não o agente. Um juízo `espera` nunca gera pedido.
{
  const ilegivel: AgenteNoCiclo = {
    agente: ag({}),
    juizo: { decisao: 'espera', estado: 'vivo', resultado: 0, porque: 'campos ilegíveis (orcamento)' },
    idadeHoras: 100,
  }
  const p = plano([ceo(), ilegivel])
  teste('um agente não julgado não é cobrado', p.pedidos.length === 0)
  teste('e o motivo é o do juízo', p.ignorados.some((i) => /ilegíveis/.test(i.porque)))
}

// ── TODOS OS IGNORADOS TÊM MOTIVO, E O RESUMO É AUDITÁVEL ───────────────────
{
  const p = plano([
    ceo(),
    no(ag({ id: 'f1', nome: 'A' })),
    no(ag({ id: 'f2', nome: 'B', pausado: true, estado: 'pausado' })),
    no(ag({ id: 'f3', nome: 'C', receita_janela: 90, gasto_janela: 1 })),
  ])
  teste('cada ignorado traz nome e motivo', p.ignorados.every((i) => i.nome.length > 0 && i.porque.length > 20))
  teste('o resumo conta os pedidos', /1 pedido/.test(p.resumo))
  teste('e conta quem não foi pressionado', /não pressionado/.test(p.resumo))
  // Nada neste plano apaga nem envia: é a prova por ausência, no objecto inteiro.
  const txt = JSON.stringify(p).toLowerCase()
  teste('o plano não contém nenhuma ordem de apagar', !txt.includes('delete') && !txt.includes('apagar'))
  teste('nem nenhum envio', !txt.includes('sendmessage') && !txt.includes('send_message'))
}

if (falhas.length) {
  console.error(`agentes/ciclo-ceo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'agentes/ciclo-ceo: pressiona quem não se paga, nunca quem o dono pausou nem quem está na carência, não repete dentro do prazo, e o catálogo fechado não deixa pedir um envio ✓',
)
