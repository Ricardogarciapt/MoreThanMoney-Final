/**
 * O ÍNDICE DE CONHECIMENTO DO CEO — o que a casa já aprendeu, e de onde cada coisa veio.
 *
 * ═══ O PEDIDO, E PORQUE É QUE ELE NÃO SE CUMPRE COMO FOI PEDIDO ════════════════════════════
 *
 * O dono pediu que se ensinasse ao CEO «tudo e toda a linha de código do site, apps, memória,
 * tudo o que construí». Despejar o repositório na coluna `instrucoes` de `agentes_equipa` não é
 * isso — é o contrário disso, por duas razões que se medem:
 *
 *  · **não cabe.** São ~130 memórias, centenas de módulos e 40 crons. O que cabe num prompt é
 *    um índice;
 *  · **apodrece.** Um despejo está certo no dia em que é escrito e errado no dia seguinte. Foi
 *    exactamente o que aconteceu ao bot do Telegram até 01/10: três textos escritos à mão, nenhum
 *    actualizado, e o bot a falar de uma casa que já não existia (ver `lib/factos-da-casa.ts`).
 *
 * Por isso isto não é um despejo: é um ÍNDICE que se CONSULTA e se RECONSTRÓI a partir da fonte.
 * Cada facto traz de onde veio e quando. **Um facto sem procedência não entra** — e a guarda
 * recusa-o em vez de o deixar passar.
 *
 * ═══ O QUE ISTO É E O QUE NÃO É ════════════════════════════════════════════════════════════
 *
 * Isto ESTENDE `lib/factos-da-casa.ts`, não o substitui. A divisão é esta:
 *
 *  · `factos-da-casa.ts` — O QUE A CASA É HOJE. Pilares, áreas, preços da formação, portefólios.
 *    Montado de `lib/pilares.ts`. É o que um bot diz a um lead;
 *  · este ficheiro — O QUE A CASA APRENDEU. Decisões que não se reabrem, limites que não se
 *    atravessam, incidentes e a lição de cada um, e onde vive o código que manda. É o que um
 *    agente precisa para DECIDIR.
 *
 * Nenhum número de negócio é recopiado para aqui. Preços vivem em `lib/escada-precos.ts`, prova
 * em `lib/pips-proof.ts`, estado vivo na base. O índice diz ONDE, não repete O QUÊ — repetir era
 * criar a sexta cópia do mesmo número, que é como eles divergem.
 *
 * ═══ A GUARDA MAIS VALIOSA ═════════════════════════════════════════════════════════════════
 *
 * `conhecimento.check.ts` prova dois casos maus, e o segundo é o que justifica o ficheiro:
 *
 *  1. um facto sem procedência — entra em silêncio e passa a parecer verdade por estar escrito;
 *  2. **uma procedência que aponta para um ficheiro que já não existe.** É assim que o
 *     conhecimento apodrece: ninguém renomeia um módulo e vai ver quem falava dele. Um índice que
 *     aponta para o vazio é pior do que não ter índice, porque o agente confia nele.
 *
 *   npx tsx lib/agentes/conhecimento.check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { contextoDaCasa } from '@/lib/factos-da-casa'
import { JANELA_HORAS, ORCAMENTO_INICIAL } from '@/lib/agentes/vida'
import { JANELA_DIAS, PARAMETRO } from '@/lib/agentes/atribuicao'

// ── DE ONDE VEM CADA FACTO ───────────────────────────────────────────────────────────────────

/**
 * As três procedências possíveis, e nenhuma mais.
 *
 * A distinção não é burocrática — decide o que o agente faz com o facto:
 *
 *  · `ficheiro` é VERIFICÁVEL agora. A guarda confirma que existe, e o agente pode ir lê-lo;
 *  · `memoria` é a HISTÓRIA escrita pelo dono e por mim: o porquê, que nunca está no código.
 *    Vive fora do repositório, por isso a guarda só a verifica onde a pasta existir;
 *  · `consulta` é ESTADO VIVO — não se escreve, pergunta-se. Um facto sobre quantos membros há
 *    hoje envelhece em horas, e a procedência honesta dele é a rota que o responde.
 */
export type Procedencia =
  | { tipo: 'ficheiro'; caminho: string }
  | { tipo: 'memoria'; slug: string }
  | { tipo: 'consulta'; como: string }

export const ficheiro = (caminho: string): Procedencia => ({ tipo: 'ficheiro', caminho })
export const memoria = (slug: string): Procedencia => ({ tipo: 'memoria', slug })
export const consulta = (como: string): Procedencia => ({ tipo: 'consulta', como })

export interface Facto {
  /** O facto, numa frase. */
  oQue: string
  /**
   * A RAZÃO. Opcional no tipo, mas é metade do valor do ficheiro.
   *
   * Um agente que sabe que «a prova mede-se em pips» obedece até ao primeiro caso em que euros
   * dariam melhor resposta. Um agente que sabe PORQUE — o mesmo sinal vale 8 $ a quem opera 0,01
   * lote e 800 $ a quem opera 1 lote — generaliza a regra para casos que ninguém escreveu.
   */
  porque?: string
  /** Quando a decisão foi tomada ou o incidente aconteceu, dd/mm/aaaa. */
  data?: string
  /** De onde veio. NUNCA vazio — a guarda recusa. */
  origem: Procedencia[]
}

/**
 * A pasta das memórias do projecto.
 *
 * Vive FORA do repositório, na máquina do dono, porque é escrita pela ferramenta de memória e não
 * pelo código. O caminho é o real; a variável de ambiente existe para quem o tenha noutro sítio.
 * A guarda salta a verificação quando a pasta não está lá, em vez de falhar: um índice que só
 * compila na máquina de uma pessoa é um índice que ninguém mais corre.
 */
export const RAIZ_MEMORIAS =
  process.env.MTM_RAIZ_MEMORIAS ??
  '/Users/ricardogarcia/.claude/projects/-Volumes-Disco-externo-Ricardo-Programa--o-Reposit-rio-SITE-Code-Claude/memory'

// ── AS DECISÕES QUE NÃO SE REABREM ───────────────────────────────────────────────────────────
//
// O critério para entrar aqui: alguém já levantou a questão, foi decidida, e voltar a levantá-la
// custa tempo a quem decidiu. Cada uma traz o gatilho para reabrir quando ele existe — uma decisão
// sem gatilho declarado é uma decisão que se reabre por teimosia em vez de por facto novo.

export const DECISOES_IRREVERSIVEIS: Facto[] = [
  {
    oQue:
      'A MoreThanMoney não é uma prop firm: são SEIS negócios ligados pela mesma base — formação, ' +
      'sinais e comunidade, copytrading (MTM Copy), Tap to Trade, MTM Funded e software. Mais um ' +
      'andar de automação própria (máquina de vendas, funis, relays, videocliper, AIOS).',
    porque:
      'Quem trata a casa como um produto só propõe sempre a coisa errada ao cliente errado. O Tap ' +
      'to Trade — o sinal chega, um toque abre a ordem na conta do cliente e o motor gere-a até ' +
      'fechar — é a peça que mais distingue a casa, e não se vende como «sinais».',
    origem: [memoria('persona-mtm-negocio-completo'), ficheiro('lib/pilares.ts')],
  },
  {
    oQue:
      'O MTM Funded é um negócio SEPARADO do morethanmoney.pt, com casa, regras, contratos e ' +
      'certificados próprios. Nasce desligado e abre por fases.',
    porque: 'Misturar as contas e as regras dos dois faz o risco de um cair sobre o outro.',
    data: '09/2026',
    origem: [memoria('mtmfunded-produto'), memoria('mtmfunded-mapa-editavel')],
  },
  {
    oQue:
      'O MTM Copy FICA na MetaApi — não se constrói substituto agora. A MetaApi é só o cano de ' +
      'entrega às contas MT4/MT5 dos clientes; o sistema interno (motor, mestres, WebTrader, ' +
      'preços, velas) funciona sem ela e arranca com fontes próprias.',
    porque:
      'O custo por-conta é intrínseco ao MT5 (um terminal ligado por conta) — construir o nosso ' +
      'não escapa a isso, só transfere o uptime para nós. Mas quando os créditos esgotaram a ' +
      '18/09 pararam preços, velas e execução: o dono não quer o sistema refém de um fornecedor. ' +
      'Gatilho para reabrir: mais de ~50–100 contas, ou a factura a disparar. NUNCA propor ' +
      '«carregar créditos» como solução para preços — só para entregar ordens aos clientes.',
    data: '03/08/2026, doutrina reforçada a 21/09/2026',
    origem: [
      memoria('metaapi-vs-self-host-decision'),
      memoria('metaapi-so-entrega-slaves'),
      ficheiro('lib/mtmcopy/metaapi.ts'),
    ],
  },
  {
    oQue:
      'As contas-mestre das estratégias são contas MTM Funded nossas e o nosso motor envia ' +
      'directamente para as contas dos clientes — entradas, parciais, break-even, trailing e ' +
      'saídas. Sem CopyFactory.',
    porque:
      'Poupa a conta-mestre e o salto do CopyFactory (segundos), e a gestão decide-se uma vez num ' +
      'sítio. Ao passar uma estratégia a live há que DESUBSCREVER o CopyFactory dessa estratégia ' +
      'ANTES, senão saem ordens em dobro. Tudo entra em SOMBRA por defeito, com kill-switch.',
    data: '18/09/2026',
    origem: [memoria('mestres-nossas-execucao-directa'), memoria('motor-real-sombra')],
  },
  {
    oQue:
      'O  foi completamente removido do site a 26/06/2026 — login, rotas, auth e migração ' +
      'de acesso. Não se recria nem se sugere. Rebrand: «IQ Sync» passou a Tap to Trade MTM e ' +
      '«IQ Auto» a MTM Copy.',
    porque: 'Decisão do dono com o risco aceite. Propor voltar atrás é reabrir um corte já pago.',
    data: '26/06/2026',
    origem: [memoria('-removed')],
  },
  {
    oQue:
      'A escada comercial é app grátis → Membro → Premium → Fundador anual, com copytrading e MTM ' +
      'Funded como upside. A regra é NÃO LIDERAR COM GRÁTIS.',
    porque:
      'Quem entra pelo grátis ancora o valor no zero. Os preços vivem em `lib/escada-precos.ts`, ' +
      'que é quem os anuncia, e o depósito da corretora em `lib/telegram-broker-gate.ts`, que é ' +
      'quem o valida — não se repetem em mais sítio nenhum.',
    origem: [
      memoria('sales-funnel-ladder-brain'),
      memoria('pricing-architecture'),
      ficheiro('lib/escada-precos.ts'),
      ficheiro('lib/telegram-broker-gate.ts'),
    ],
  },
  {
    oQue:
      'No iOS a cobrança é SEMPRE por Apple IAP (StoreKit 2), nunca Stripe. E a app MTM Auto não ' +
      'é submissível enquanto a conta Apple for de pessoa singular: a 3.2.1(viii) exige uma ' +
      'organização, e isso bloqueia mesmo com zero cripto à vista.',
    porque:
      'A rejeição de 22/09 não foi por cripto — foi pela forma da conta. Reactivar cripto por ' +
      'deploy depois da aprovação é textualmente a Guideline 2.3.1 («hidden or undocumented ' +
      'features»), e numa conta com 3.1.5 aberta a sanção pode cair sobre a conta, não só sobre ' +
      'a versão. O dono aceitou o risco e sabe-o.',
    data: '24/09/2026',
    origem: [
      memoria('apple-conta-singular-bloqueio'),
      memoria('apple-iap-monetizacao'),
      memoria('gate-apple-cripto-catalogo'),
    ],
  },
  {
    oQue:
      'Quem aponta dinheiro para fora da casa é SÓ a casa. Num produto de educador com checkout ' +
      'externo, `checkout_externo_url` e `vendedor_nome` são campos só do admin; o educador edita ' +
      'o resto.',
    porque:
      'Um curso de outra pessoa apontado ao nosso `/upgrade` cobrava uma subscrição da MTM e nunca ' +
      'entregava o curso. O destino de compra vive numa função só, para não haver duas respostas.',
    data: '01/10/2026',
    origem: [
      memoria('marketplace-produto-educador-externo'),
      ficheiro('lib/marketplace/regras.ts'),
      ficheiro('lib/marketplace/gestao.ts'),
    ],
  },
  {
    oQue:
      'Todo o conteúdo com voz ou narração usa a voz CLONADA do Ricardo — nunca uma voz TTS ' +
      'genérica ou a voz por defeito de uma ferramenta.',
    porque: 'A voz é parte da identidade. Voz genérica denuncia AI e quebra a marca pessoal.',
    origem: [memoria('voice-always-ricardo-clone')],
  },
  {
    oQue:
      `Um agente vive enquanto se pagar a si próprio: receita menos gasto na janela de ${JANELA_HORAS} h. ` +
      'Quem não paga o que gasta PÁRA — por desactivação registada, nunca por apagamento. Clonar ' +
      `exige lucro acumulado que financie o orçamento inicial do filho (${ORCAMENTO_INICIAL} $), e um filho ` +
      'que renda mais REFORMA o pai (compara-se ritmo, não acumulado).',
    porque:
      'Apagar é irreversível e a medição vai errar — um agente bom cujo código ninguém usou ' +
      'parece-se com um agente inútil. Um agente parado volta com um clique; um apagado não volta. ' +
      'E o histórico é o que ensina: três agentes mortos no mesmo pilar dizem que o problema era o ' +
      'pilar.',
    data: '01/10/2026',
    origem: [ficheiro('lib/agentes/vida.ts'), ficheiro('lib/agentes/motor.ts')],
  },
  {
    oQue:
      `A receita de um agente só conta quando a compra traz o código dele, que viaja num campo PRÓPRIO ` +
      `num link \`?${PARAMETRO}=AG-…\` e vale ${JANELA_DIAS} dias depois do clique.`,
    porque:
      'O checkout só aceita UM cupão e vale o maior. Se o código do agente ocupasse o campo do ' +
      'cupão, um cliente com desconto a sério ficava sem ele — pagava o preço inteiro por ter ' +
      'entrado por um link de agente. Era trocar medição por margem do cliente, e sem ele dar por ' +
      'nada.',
    data: '01/10/2026',
    origem: [ficheiro('lib/agentes/atribuicao.ts'), ficheiro('lib/agentes/receita.ts')],
  },
]

// ── OS LIMITES: O QUE NENHUM AGENTE FAZ ──────────────────────────────────────────────────────
//
// Estes não são preferências e não se negoceiam com o contexto. Um agente que leia um limite e
// encontre um caso em que atravessá-lo daria melhor resultado está a ler mal: o limite existe
// precisamente para esse caso.

export const LIMITES: Facto[] = [
  {
    oQue:
      'Nenhum agente abre, fecha ou altera uma ordem de trading, e nenhum agente mexe em dinheiro ' +
      '— não cobra, não transfere, não movimenta cripto. Propõe; decide o dono.',
    porque:
      'Receita LÊ-SE do Stripe; dinheiro que sai é decisão do Ricardo. Está escrito nas próprias ' +
      'instruções com que o CEO nasceu, e a regra não vem do bom senso: vem de a execução real ter ' +
      'já aberto ordens em dobro por causa de uma rota antiga que ninguém desligou.',
    origem: [
      ficheiro('supabase/migrations/166_semear_equipa_agentes.sql'),
      memoria('mestres-nossas-execucao-directa'),
    ],
  },
  {
    oQue:
      'Nada é enviado a um cliente sem aprovação humana. Uma rota de contacto devolve RASCUNHO ' +
      'para alguém confirmar — não envia.',
    porque:
      'Um envio não se desfaz. A rota de negócio dos agentes está construída assim de propósito: ' +
      'leitura imediata, escrita interna imediata, envios para clientes nunca.',
    origem: [ficheiro('app/api/agent/v1/business/route.ts')],
  },
  {
    oQue:
      'A prova de desempenho mede-se em PIPS e PERCENTAGEM, com a origem declarada. NUNCA em ' +
      'euros, nunca estimada. Dinheiro só como exemplo por lote (0,01 · 0,1 · 1,0), bruto, com a ' +
      'ressalva de que o passado não garante o futuro. O que não foi medido diz-se «por atribuir», ' +
      'com o motivo.',
    porque:
      'O mesmo sinal vale ~8 $ a quem opera 0,01 lote e ~800 $ a quem opera 1 lote: um número em ' +
      'euros não descreve o que ninguém vai receber. O «675 trades · 63% · +7.060€» está proibido ' +
      'desde 26/08 — estava congelado a 30/06 e ainda assim sobreviveu um dia no prompt, porque ' +
      'proibir sem substituir não chega.',
    data: '26/08/2026',
    origem: [memoria('proof-pips-not-euros'), ficheiro('lib/pips-proof.ts'), ficheiro('lib/factos-da-casa.ts')],
  },
  {
    oQue:
      'Nunca se nomeia a plataforma de terceiros onde vivem os cursos das áreas sem sala ao vivo. ' +
      'A fórmula é «Percurso organizado · módulo a módulo · ao teu ritmo», escrita uma vez só.',
    porque: 'Decisão do dono de 28/09 para as páginas públicas. Não se parafraseia nem se contorna.',
    data: '28/09/2026',
    origem: [memoria('landing-pilares-mtm'), ficheiro('lib/pilares.ts')],
  },
  {
    oQue:
      'Nenhuma área está «a abrir», «em breve», «em preparação» nem «sem aulas próprias». Estão ' +
      'TODAS prontas, e todas levam o mesmo cartão.',
    porque:
      'O dono considera-as prontas — os cursos existem. A página a dizer o que falta estava a ' +
      'vender a casa a menos do que ela é.',
    data: '28/09/2026',
    origem: [memoria('landing-pilares-mtm'), ficheiro('lib/pilares.ts')],
  },
  {
    oQue:
      'Não se inventam números nem testemunhos. Se não se sabe, diz-se que não se sabe — é melhor ' +
      'resposta do que um número aproximado. Números públicos só com origem.',
    porque:
      'Quem lê não consegue distinguir um número inventado de um medido, e decide com base nele. ' +
      'Os números da landing vêm de `site_settings.landing_stats` por cron, não escritos à mão.',
    origem: [memoria('persona-mtm-negocio-completo'), memoria('landing-live-stats'), ficheiro('lib/factos-da-casa.ts')],
  },
  {
    oQue:
      'Nunca se promete lucro: isto é educação, não aconselhamento financeiro. Saldos e equity só ' +
      'a admins, nunca num ecrã de cliente. Nunca uma password num email — só links de recuperação.',
    origem: [memoria('persona-mtm-negocio-completo'), memoria('contas-duplicadas-e-login')],
  },
  {
    oQue:
      'Um agente não arranja um número que lhe pareça errado — diz que lhe parece errado. E a ' +
      'supervisão humana ganha sempre à regra automática: um agente pausado pelo dono não é julgado.',
    porque:
      /**
       * O valor medido não se repete aqui de propósito: o que ensina é o ZERO atribuído, e um
       * número em euros escrito neste ficheiro é a sexta cópia de um número que tem dono.
       */
      'A 01/10 a primeira passagem real mediu receita verdadeira e atribuiu ZERO, com o motivo ' +
      '«sem_codigo» em cada venda. A regra de vida teria parado a equipa inteira às 48 h, e o ' +
      'motivo pareceria sólido a quem o lesse depois. Não teria sido falta de trabalho — teria ' +
      'sido falta de MEDIÇÃO.',
    data: '01/10/2026',
    origem: [ficheiro('lib/agentes/atribuicao.ts'), ficheiro('lib/agentes/vida.ts')],
  },
  {
    oQue:
      'As palavras do dono mandam sobre o que o projecto tem, e o que o projecto já tem manda ' +
      'sobre o gosto de qualquer ferramenta ou skill. Procura-se o que existe antes de criar novo.',
    origem: [ficheiro('lib/pilares.ts'), memoria('landing-pilares-mtm')],
  },
  {
    oQue:
      'A AUTONOMIA DO CEO NÃO REVOGA NENHUM DOS LIMITES ACIMA. Ele corre sozinho, cria apps e ' +
      'sistemas, e dá pedidos com prazo aos filhos — mas publicar, cobrar, alterar preços e lançar ' +
      'campanhas continuam a ser decisão do dono, e nenhum pedido dele pode mandar enviar uma ' +
      'mensagem a um cliente ou mexer em dinheiro. O catálogo do que ele pode pedir é FECHADO ' +
      '(`medir`, `propor`, `construir`, `baixar_custo`, `justificar`), na base e no código.',
    porque:
      'Uma autonomia nova é a forma mais natural de um limite antigo se perder: ninguém o revoga — ' +
      'ele deixa de ser mencionado, e o passo seguinte parece razoável. Por isso o limite está na ' +
      'FORMA e não na boa vontade: não existe acção para enviar nem para cobrar, o CHECK da coluna ' +
      '`agentes_pedidos.accao` recusa-a, e `ciclo-ceo.check.ts` falha se alguma acção do catálogo ' +
      'passar a mandar enviar, cobrar ou publicar.',
    data: '01/10/2026',
    origem: [
      ficheiro('lib/agentes/ciclo-ceo.ts'),
      ficheiro('lib/agentes/ciclo-ceo.check.ts'),
      ficheiro('supabase/migrations/171_ceo_ciclo_e_imortalidade.sql'),
    ],
  },
  {
    oQue:
      'A IMORTALIDADE É SÓ DO CEO, e é uma excepção nomeada à régua das 48 h — não um afrouxamento ' +
      'dela. Não se estende a nenhum filho: nem por estar debaixo do CEO, nem por lhe calhar o ' +
      'pilar «ceo». E não ganha ao dono: um CEO pausado ou parado à mão fica como a pessoa o deixou.',
    porque:
      'Parar o único que cria e pára sub-agentes deixava a equipa sem ninguém a julgá-la. Mas uma ' +
      'imortalidade que se herdasse tirava os dentes à régua exactamente onde ela tem de os ter, e ' +
      'sem dar erro nenhum — bastava um filho nascer com o pilar do pai. Por isso `eImortal` exige ' +
      'o TOPO da árvore (pilar `ceo` E sem pai), e o caso mau está provado.',
    data: '01/10/2026',
    origem: [ficheiro('lib/agentes/vida.ts'), ficheiro('lib/agentes/vida.check.ts')],
  },
]

// ── OS INCIDENTES, E O QUE FICOU APRENDIDO ───────────────────────────────────────────────────
//
// Não é um mural de vergonhas: é a lista das formas por que este sistema JÁ falhou. Quase todos
// têm a mesma assinatura — **falhou em silêncio**. Nada no ecrã, nada nos registos, e a avaria
// descobre-se dias depois por alguém que foi ver outra coisa. É por isso que a casa escreve
// decisões em módulos puros com guarda `*.check.ts`: porque o erro que dá exceção corrige-se no
// dia, e o que erra calado vive meses.

export const INCIDENTES: Facto[] = [
  {
    oQue:
      'A prova pública anunciou «20 trades · 100% de acerto · +2.225 pips». Não era medição: era ' +
      'uma amostra estruturalmente só de vencedoras.',
    porque:
      'A conta-espelho tinha morrido (conta apagada na MetaApi) e a prova caiu numa tabela que só ' +
      'recebe linha quando o motor fecha NUM ALVO — um stop não escrevia lá nada. LIÇÃO: antes de ' +
      'publicar um número, perguntar o que a fonte NÃO consegue ver. Corrigido com espelho novo de ' +
      '10K e a prova a recusar a fonte enviesada; a verdade publicada passou a ~152 trades · 52% · ' +
      '−353 pips, por decisão do dono.',
    data: '24/09/2026',
    origem: [memoria('conta-espelho-reposta-24-09'), ficheiro('lib/pips-proof.ts'), memoria('medicao-trades-vs-ideias')],
  },
  {
    oQue:
      'Três instrumentos mediam a mesma estratégia e davam respostas diferentes: as IDEIAS ' +
      'sub-avaliam sempre (não contam parciais), a conta-espelho é o instrumento honesto, e a ' +
      'reposição corre o histórico contra velas reais.',
    porque:
      'O GoldKiller passava de −870 pips / 21% pelas ideias a +247 pips / 79% reposto. Não é ' +
      'margem de erro — é outra história. LIÇÃO: medir é sempre por `source_key` (QUEM produziu), ' +
      'nunca por `channel_slug` (ONDE foi publicado); são vocabulários disjuntos.',
    data: '12/09/2026',
    origem: [
      memoria('medicao-desempenho-estrategias'),
      ficheiro('lib/mtmauto/chaves-de-fonte.ts'),
      ficheiro('lib/mtmauto/reconstruir-desempenho.ts'),
    ],
  },
  {
    oQue:
      '~40 funções `SECURITY DEFINER` estavam abertas a PUBLIC — chamáveis com a chave anónima que ' +
      'vai no JavaScript do site. Uma delas dava admin instantâneo em qualquer conta; outra devolvia ' +
      'o email de todos os membros.',
    porque:
      'LIÇÃO que custou uma iteração: `revoke ... from anon, authenticated` NÃO FAZ NADA enquanto ' +
      'PUBLIC tiver o privilégio — é o default do Postgres. Tem de ser `revoke all ... from public` ' +
      'e depois `grant execute ... to service_role`.',
    data: '28/08/2026',
    origem: [memoria('rpc-definer-abertas-ao-publico'), memoria('idor-profile-rls-users')],
  },
  {
    oQue:
      'Uma segunda foreign key para uma tabela já embebida fez o PostgREST recusar TODOS os embeds ' +
      'que não nomeassem a constraint: ~12 rotas a 500 e o dono a ver «as salas desapareceram». A ' +
      'base estava intacta — era só a leitura.',
    porque:
      'A avaria aparece longe da migração que a causou, e em silêncio até alguém abrir a página. ' +
      'LIÇÃO: antes de acrescentar uma 2.ª FK, nomear primeiro os embeds existentes e deployar isso. ' +
      'Em incidente, a reposição rápida é LARGAR a FK — instantânea, sem deploy.',
    data: '16/09/2026',
    origem: [memoria('postgrest-segunda-fk-parte-embeds')],
  },
  {
    oQue:
      'A dívida de tipos escondia bugs a sério. Ao tipar, 103 erros passaram a 0 e apareceu que ' +
      '`lib/supabase.ts` devolvia `null as any`: uma união com `any` colapsa para `any`, logo a ' +
      'aplicação INTEIRA falava com o Supabase sem verificação de tipos.',
    porque:
      'O build ignora erros de tipo, por isso eles acumulam e escondem-se no ruído. Também ' +
      'apareceram: quatro campos do perfil que gravavam e nunca voltavam, uma rota de admin que ' +
      'rebentava inteira, e DOIS falsos de teste que mentiam — davam uma divergência que PARECIA ' +
      'arquitectural. LIÇÃO: correr `npx tsc --noEmit` periodicamente e exigir 0.',
    data: '24/09/2026',
    origem: [memoria('typecheck-debt')],
  },
  {
    oQue:
      'Desubscrever uma estratégia no CopyFactory nunca funcionou — faltava um campo no pedido — e ' +
      'falhava EM SILÊNCIO. Contas continuavam a copiar o que já tinha sido desligado.',
    porque:
      'LIÇÃO: uma operação de desligar que não é verificada depois é uma operação que se presume. ' +
      'É a razão por que pausar passou a ser confirmado e não só pedido.',
    data: '01/09/2026',
    origem: [memoria('copyfactory-desubscricao-partida'), memoria('mtmcopy-pause-enforcement')],
  },
  {
    oQue:
      'O estatuto VIP vive em DOIS campos do perfil, e havia gates a ler só um: quem era VIP pelo ' +
      'outro campo via os canais na lista e não lia um único sinal.',
    porque:
      'LIÇÃO: ao escrever um gate novo, aceitar os dois campos — e ao conceder VIP, pôr os dois e ' +
      'limpar a data de expiração, senão os painéis mostram «expirado» a quem não expira.',
    data: '11/09/2026',
    origem: [memoria('vip-dois-campos')],
  },
  {
    oQue:
      'O gargalo nº1 do funil não é falta de procura: o sistema não conseguia ver quem depositou. ' +
      'ZERO clientes passavam o gate da corretora porque a coluna dos depósitos nunca foi mapeada.',
    porque:
      'O importador tratava campo ausente e campo a zero como a mesma coisa. A corretora mandou os ' +
      'dados — só não se leu a coluna. LIÇÃO: célula vazia NÃO é zero, e o que não vem no ficheiro ' +
      'não desaparece. A API de IB da corretora existe mas não devolve depósitos nem saldo.',
    data: '24/09/2026',
    origem: [memoria('broker-gate-dados-corretora'), ficheiro('lib/broker/dados-corretora.ts')],
  },
  {
    oQue:
      'Inserções em `chat_messages` com um tipo de mensagem próprio violavam uma constraint, o erro ' +
      'era engolido por um try/catch, e três fontes de sinais NUNCA chegaram aos chats da app.',
    porque:
      'LIÇÃO: um `catch` que não registra nada transforma uma avaria permanente em «não percebo ' +
      'porque é que isto não aparece». É a assinatura de quase todos os incidentes desta lista.',
    data: '06/08/2026',
    origem: [memoria('alerts-system-architecture')],
  },
  {
    oQue:
      'As contas simuladas entravam a preços que o mercado não ofereceu — 56% do lucro da mestre ' +
      'vinha desse viés. O trailing, medido, foi MANTIDO.',
    porque:
      'LIÇÃO: uma mestre simulada não é prova real, e dizê-lo faz parte de a usar. O historial ' +
      'público vem das contas reais de auditoria.',
    data: '24/09/2026',
    origem: [memoria('preco-entrada-viciado'), memoria('mestres-nossas-execucao-directa')],
  },
]

// ── O MAPA DO CÓDIGO ─────────────────────────────────────────────────────────────────────────
//
// Um mapa útil responde a «onde mexo para mudar isto?» e não a «que ficheiros existem». Por isso
// cada área tem três campos e não uma lista:
//
//  · `manda` — a FONTE ÚNICA. Mudar aqui muda em todo o sistema; escrever o mesmo noutro sítio é
//    criar a divergência que estes módulos existem para evitar;
//  · `decide` — os módulos PUROS com guarda `*.check.ts`. É aqui que vivem as decisões que erram
//    em SILÊNCIO, e é por isso que têm guarda em vez de confiança;
//  · `executa` — as rotas e os crons que correm. Estado, não decisão.

export interface AreaDoCodigo {
  area: string
  manda: string[]
  decide: string[]
  executa: string[]
  nota?: string
}

export const MAPA_DO_CODIGO: AreaDoCodigo[] = [
  {
    area: 'A casa e a montra pública',
    manda: ['lib/factos-da-casa.ts', 'lib/pilares.ts', 'lib/landing-stats.ts', 'lib/pips-proof.ts'],
    decide: ['lib/factos-da-casa.check.ts', 'lib/pilares.check.ts', 'lib/__tests__/pips-proof-vies.check.ts'],
    executa: ['/api/cron/landing-stats', '/api/cron/pips-proof', '/api/cron/proof-stats'],
    nota:
      'Os números públicos NÃO estão escritos nas páginas — são recalculados por cron. ' +
      '`pips-proof-vies.check.ts` existe por causa do 100% de acerto de 24/09: guarda o viés, ' +
      'não o cálculo.',
  },
  {
    area: 'Escada comercial, preços e a porta da corretora',
    manda: [
      'lib/escada-precos.ts',
      'lib/telegram-broker-gate.ts',
      'lib/trial-access.ts',
      'lib/broker/dados-corretora.ts',
    ],
    decide: [
      'lib/__tests__/escada-precos.check.ts',
      'lib/broker/__tests__/dados-corretora.check.ts',
      'lib/member-activation.check.ts',
    ],
    executa: [
      '/api/cron/broker-gate-renew',
      '/api/cron/broker-dados-frescura',
      '/api/cron/check-trials',
      '/api/cron/subscription-expiry',
      '/api/cron/member-subscriptions',
    ],
    nota:
      '`escada-precos.ts` é a ÚNICA fonte dos números que o funil anuncia — estavam duplicados em ' +
      'cinco guiões. O depósito mínimo vem do gate e é reexportado, não recopiado.',
  },
  {
    area: 'Sinais: vocabulário e desfecho',
    manda: [
      'lib/mtmcopy/signal-lifecycle.ts',
      'lib/mtmcopy/trade-outcome.ts',
      'lib/mtmcopy/desfecho-unico.ts',
      'lib/mtmauto/chaves-de-fonte.ts',
    ],
    decide: [
      'lib/mtmcopy/__tests__/signal-lifecycle.check.ts',
      'lib/mtmcopy/__tests__/trade-outcome.check.ts',
      'lib/mtmcopy/__tests__/desfecho-unico.check.ts',
    ],
    executa: ['/api/cron/signal-outcomes', '/api/cron/mestre-publicar', '/api/cron/signal-tracker'],
    nota:
      'Havia NOVE tabelas de tamanho do pip espalhadas pelos motores: o mesmo fecho saía com ' +
      'números diferentes conforme quem o apanhasse. Cripto conta em PONTOS, não pips.',
  },
  {
    area: 'Execução e gestão de posições (MTM Copy e mestres)',
    manda: [
      'lib/gestao-real/premium.ts',
      'lib/gestao-real/mtmauto.ts',
      'lib/gestao-real/t2t.ts',
      'lib/copia-contas/cadeia.ts',
      'lib/mestres/servidor/sinal-mestre.ts',
      'lib/mtmcopy/metaapi.ts',
    ],
    decide: [
      'lib/gestao-real/__tests__/provider.check.ts',
      'lib/gestao-real/__tests__/paridade-premium.check.ts',
      'lib/gestao-real/__tests__/sombra.check.ts',
      'lib/copia-contas/__tests__/cadeia.check.ts',
      'lib/precos-entrada/desvio.check.ts',
    ],
    executa: [
      '/api/cron/premium-price-monitor',
      '/api/cron/premium-zone-monitor',
      '/api/cron/mtmcopy-master-poll',
      '/api/cron/mtmcopy-reconcile',
      '/api/cron/webtrader-gestao-auto',
      '/api/cron/nightly-tp-sl',
    ],
    nota:
      'A gestão de uma posição é decidida em módulos SEM IO, e as guardas de «paridade» provam que ' +
      'os dois chamadores de cada decisão chegam ao mesmo resultado. A mestre é a conta que manda: ' +
      'se nela não abriu nada, o sinal não existe para o resto.',
  },
  {
    area: 'Tap to Trade',
    manda: ['lib/mtmcopy/t2t-source.ts', 'lib/mtmcopy/t2t-janela-regra.ts', 'lib/mtmcopy/escolha-contas-t2t.ts'],
    decide: [
      'lib/mtmcopy/__tests__/t2t-janela-validade.check.ts',
      'lib/mtmcopy/__tests__/escolha-contas-t2t.check.ts',
      'lib/mtmcopy/__tests__/t2t-perps.check.ts',
    ],
    executa: ['/api/cron/t2t-price-monitor'],
    nota:
      'As fontes do T2T vêm da CONFIG GUARDADA e não do código — mudar o código não chega. Nos ' +
      'perpétuos o botão SEGUE a posição-mestre em vez de abrir ordem.',
  },
  {
    area: 'MTM Funded',
    manda: [
      'lib/mtmfunded/regras.ts',
      'lib/travas-por-tipo-de-conta.ts',
      'lib/mtmfunded/estrategias-sinais/calculo.ts',
      'lib/mtmfunded/precos/tick-motor.ts',
    ],
    decide: [
      'lib/mtmfunded/__tests__/regras.check.ts',
      'lib/__tests__/travas-por-tipo-de-conta.check.ts',
      'lib/mtmfunded/__tests__/estrategias-sinais.check.ts',
      'lib/mtmfunded/__tests__/inatividade.check.ts',
    ],
    executa: [
      '/api/cron/funded-inatividade',
      '/api/cron/funded-precos-vigia',
      '/api/cron/mtmfunded-metrics',
      '/api/cron/mtmfunded-mt5-vigia',
    ],
    nota:
      'A trava por tipo de conta BLOQUEIA ENTRADAS, NUNCA SAÍDAS — travar uma saída prendia o ' +
      'cliente numa perda. Contas `real` têm dinheiro do cliente e decisões sobre elas são do dono.',
  },
  {
    area: 'Formação, LMS e marketplace',
    manda: ['lib/marketplace/regras.ts', 'lib/marketplace/gestao.ts', 'lib/lms/aulas.ts', 'lib/licencas.ts'],
    decide: ['lib/marketplace/regras.check.ts', 'lib/marketplace/gestao.check.ts', 'lib/lms/aulas.check.ts'],
    executa: ['/api/cron/activacao-vigia', '/api/email-marketing/sequences/process'],
    nota:
      'O destino de uma compra vive numa função só: endereço absoluto serve a qualquer dono, ' +
      'caminho interno só à casa. Um produto de educador sem linha activa fica publicado e INVISÍVEL.',
  },
  {
    area: 'Captação, funil e vendas',
    manda: ['lib/sales-machine.ts', 'lib/captacao-consentimento.ts', 'lib/whatsapp-envio.ts', 'lib/instagram/setter.ts'],
    decide: [
      'lib/captacao-consentimento.check.ts',
      'lib/whatsapp-envio.check.ts',
      'lib/instagram/setter-limites.check.ts',
      'lib/vendas/atribuicao.check.ts',
    ],
    executa: [
      '/api/cron/funis',
      '/api/cron/ig-funnel',
      '/api/cron/ig-publish',
      '/api/cron/lead-radar',
      '/api/cron/telegram-leads-content',
      '/api/cron/captacao-campanhas',
    ],
    nota:
      '`lib/sales-machine.ts` é a fonte única que as três pontas (o /admin, o AIOS do site e o AIOS ' +
      'local) lêem — para verem o mesmo estado. O consentimento tem guarda própria porque é a ' +
      'decisão que, errada, envia para quem disse não.',
  },
  {
    area: 'A equipa de agentes (este sistema)',
    manda: [
      'lib/agentes/vida.ts',
      'lib/agentes/receita.ts',
      'lib/agentes/atribuicao.ts',
      'lib/agentes/conhecimento.ts',
    ],
    decide: [
      'lib/agentes/vida.check.ts',
      'lib/agentes/motor.check.ts',
      'lib/agentes/receita.check.ts',
      'lib/agentes/atribuicao.check.ts',
      'lib/agentes/arvore.check.ts',
      'lib/agentes/trader.check.ts',
      'lib/agentes/conhecimento.check.ts',
    ],
    executa: ['/api/cron/agentes'],
    nota:
      'O agente de trading corre numa conta de PAPEL e `lib/agentes/trader.ts` verifica a cada ' +
      'passagem que a conta continua a ser papel antes de executar — o limite do dono é «nunca ' +
      'executar ordens com dinheiro real», e um limite que só se verifica uma vez não é um limite.',
  },
]

// ── COMO SE CONSULTA O ESTADO VIVO ───────────────────────────────────────────────────────────
//
// O que está acima é o que não muda sozinho. O que muda — quantos membros, quanta receita, que
// contas estão ligadas, que sinais correram — NÃO se escreve aqui: pergunta-se. Um facto sobre
// hoje escrito num ficheiro é um facto errado amanhã, e a procedência honesta dele é a rota.

export const COMO_CONSULTAR: Facto[] = [
  {
    oQue:
      'Receita, subscrições, clientes, leads, tarefas e o estado da própria equipa: ' +
      'GET /api/agent/v1/business?resource=overview|revenue|subscriptions|customers|leads|tasks|equidade|equipa',
    porque:
      'É a rota do agente executivo. Leitura imediata, escrita interna imediata, e envios para ' +
      'clientes NUNCA — `outreach_draft` devolve rascunho para alguém confirmar.',
    origem: [
      consulta('GET /api/agent/v1/business?resource=…'),
      ficheiro('app/api/agent/v1/business/route.ts'),
    ],
  },
  {
    oQue:
      'Qualquer pergunta à base de dados que não tenha rota própria: POST /api/agent/v1/sql com ' +
      '`{ consulta }`. Só SELECT, validado e com limite de linhas.',
    porque:
      'Um agente que precise de um número e não tenha por onde o pedir inventa-o. Dar-lhe leitura ' +
      'em SQL, fechada à escrita, é o que torna «não sabes, diz que não sabes» uma regra cumprível.',
    origem: [consulta('POST /api/agent/v1/sql'), ficheiro('lib/agent/leitura-sql.ts')],
  },
  {
    oQue:
      'O estado do funil ponta-a-ponta, com a queda entre andares: GET /api/sales-machine. Os ' +
      'comandos (aprovar/recusar post, autopilot, gerar agora) são POST na mesma rota.',
    origem: [consulta('GET /api/sales-machine'), ficheiro('lib/sales-machine.ts')],
  },
  {
    oQue:
      'O juízo de cada agente da equipa, calculado com a mesma regra do cron: ' +
      'GET /api/admin/agentes. Pausar, retomar e parar são POST — e parar nunca apaga.',
    porque:
      'O painel e o cron partilham `julgar()`: se divergissem, o painel mostrava um agente vivo ' +
      'que o cron ia parar de madrugada.',
    origem: [consulta('GET /api/admin/agentes'), ficheiro('app/api/admin/agentes/route.ts')],
  },
  {
    oQue:
      'O porquê de qualquer coisa deste sistema: as ~130 memórias do projecto, indexadas em ' +
      `MEMORY.md dentro de ${'`'}${RAIZ_MEMORIAS}${'`'}. Cada uma tem frontmatter com nome e descrição, e ` +
      'liga-se às outras por [[slug]].',
    porque:
      'É a história escrita pelo dono e por mim desde o início do projecto: incidentes, decisões, ' +
      'e a razão de cada uma. O código diz O QUE faz; as memórias dizem PORQUE é assim e o que se ' +
      'tentou antes. É a fonte de quase todos os factos deste índice.',
    origem: [consulta(`ler ${RAIZ_MEMORIAS}/MEMORY.md e seguir os slugs`)],
  },
  {
    oQue:
      'O que corre sozinho e quando: os 59 crons declarados em `vercel.json`. Um cron que não está ' +
      'lá NÃO CORRE, mesmo que a rota exista.',
    porque:
      'A conta-espelho esteve parada de 26/08 a 12/09 porque `/api/cron/signal-tracker` existia e ' +
      'nunca tinha sido agendado. A rota responder a um pedido à mão não prova que esteja agendada.',
    data: '12/09/2026',
    origem: [ficheiro('vercel.json'), memoria('medicao-desempenho-estrategias')],
  },
]

// ── O QUE SE PERGUNTA A ESTE FICHEIRO ────────────────────────────────────────────────────────

export function todosOsFactos(): Facto[] {
  return [...DECISOES_IRREVERSIVEIS, ...LIMITES, ...INCIDENTES, ...COMO_CONSULTAR]
}

/**
 * Uma procedência vale se DIZ alguma coisa.
 *
 * `{ tipo: 'ficheiro', caminho: '' }` passa a verificação de tipos e não aponta para nada — era a
 * forma de contornar a regra sem a violar por escrito.
 */
function procedenciaValida(p: Procedencia | null | undefined): boolean {
  if (!p || typeof p !== 'object') return false
  if (p.tipo === 'ficheiro') return typeof p.caminho === 'string' && p.caminho.trim().length > 0
  if (p.tipo === 'memoria') return typeof p.slug === 'string' && p.slug.trim().length > 0
  if (p.tipo === 'consulta') return typeof p.como === 'string' && p.como.trim().length > 0
  return false
}

/** Os factos que não dizem de onde vieram. Tem de ser SEMPRE vazio — a guarda recusa o contrário. */
export function factosSemProcedencia(factos: Facto[] = todosOsFactos()): Facto[] {
  return factos.filter((f) => !Array.isArray(f?.origem) || !f.origem.some(procedenciaValida))
}

/** Todos os caminhos de repositório citados — inclui os do mapa do código, que também apodrecem. */
export function caminhosDeRepo(): string[] {
  const dosFactos = todosOsFactos().flatMap((f) =>
    (f.origem ?? []).filter((o) => o.tipo === 'ficheiro').map((o) => (o as { caminho: string }).caminho),
  )
  const doMapa = MAPA_DO_CODIGO.flatMap((a) => [...a.manda, ...a.decide])
  return [...new Set([...dosFactos, ...doMapa])]
}

export function slugsDeMemoria(): string[] {
  return [
    ...new Set(
      todosOsFactos().flatMap((f) =>
        (f.origem ?? []).filter((o) => o.tipo === 'memoria').map((o) => (o as { slug: string }).slug),
      ),
    ),
  ]
}

/**
 * OS CAMINHOS QUE JÁ NÃO EXISTEM — a verificação que trava a podridão.
 *
 * Devolve a lista, e não um booleano, porque dizer «há um caminho errado» não ajuda ninguém a
 * corrigir trinta.
 */
export function ficheirosQueFaltam(raizRepo: string, caminhos: string[] = caminhosDeRepo()): string[] {
  return caminhos.filter((c) => !fs.existsSync(path.join(raizRepo, c)))
}

export function memoriasQueFaltam(slugs: string[] = slugsDeMemoria()): string[] {
  if (!fs.existsSync(RAIZ_MEMORIAS)) return []
  return slugs.filter((s) => !fs.existsSync(path.join(RAIZ_MEMORIAS, `${s}.md`)))
}

// ── O TEXTO QUE O CEO LÊ ─────────────────────────────────────────────────────────────────────

function origemEmTexto(origem: Procedencia[]): string {
  return origem
    .map((o) =>
      o.tipo === 'ficheiro' ? `\`${o.caminho}\`` : o.tipo === 'memoria' ? `memória [[${o.slug}]]` : o.como,
    )
    .join(' · ')
}

/** `i` é o índice do `map`, por isso numera-se a partir de 1 — uma lista que começa no 0 lê-se mal. */
function factoEmTexto(f: Facto, i: number): string {
  const data = f.data ? ` (${f.data})` : ''
  const porque = f.porque ? `\n     PORQUE: ${f.porque}` : ''
  return `  ${i + 1}. ${f.oQue}${data}${porque}\n     ORIGEM: ${origemEmTexto(f.origem)}`
}

/**
 * O índice, em texto.
 *
 * Montado e não escrito à mão pela mesma razão que `factosDaCasa()`: um incidente novo entra no
 * array e aparece no CEO sem ninguém se lembrar de ir actualizar um prompt.
 */
export function indiceDeConhecimento(): string {
  const mapa = MAPA_DO_CODIGO.map(
    (a) =>
      `  ▸ ${a.area}\n` +
      `      MANDA (fonte única): ${a.manda.join(', ')}\n` +
      `      DECIDE (módulo puro + guarda): ${a.decide.join(', ')}\n` +
      `      EXECUTA: ${a.executa.join(', ')}` +
      (a.nota ? `\n      NOTA: ${a.nota}` : ''),
  ).join('\n')

  return `═══ ÍNDICE DE CONHECIMENTO DA CASA ═══
Isto não é tudo o que a casa sabe: é o MAPA de onde está o que ela sabe, e de onde cada coisa veio.
Nenhum facto aqui existe sem origem. Quando precisares do detalhe, vai à origem — não ao que te
lembras. Quando precisares de um número de hoje, CONSULTA; não o estimes.

── DECISÕES QUE NÃO SE REABREM ────────────────────────────────────────────────
${DECISOES_IRREVERSIVEIS.map(factoEmTexto).join('\n')}

── LIMITES · O QUE NENHUM AGENTE FAZ ──────────────────────────────────────────
${LIMITES.map(factoEmTexto).join('\n')}

── INCIDENTES E O QUE FICOU APRENDIDO ─────────────────────────────────────────
Quase todos falharam EM SILÊNCIO. É por isso que as decisões desta casa vivem em módulos puros com
guarda \`*.check.ts\`: o erro que dá exceção corrige-se no dia, e o que erra calado vive meses.
${INCIDENTES.map(factoEmTexto).join('\n')}

── MAPA DO CÓDIGO · ONDE SE MEXE PARA MUDAR CADA COISA ────────────────────────
${mapa}

── COMO SE CONSULTA O QUE MUDA ────────────────────────────────────────────────
${COMO_CONSULTAR.map(factoEmTexto).join('\n')}`
}

/**
 * O que o CEO recebe: o QUE a casa é hoje, e depois o que ela APRENDEU.
 *
 * Esta ordem é a mesma lição de `factos-da-casa.ts`, aplicada um andar acima: sem os factos na
 * mão, um agente lê os limites e vai buscar o conteúdo ao que se lembra. Primeiro o que é
 * verdade, depois o que se aprendeu, e as proibições sempre com um facto ao lado para as
 * substituir.
 */
export function conhecimentoDoCEO(): string {
  return `${contextoDaCasa()}\n\n${indiceDeConhecimento()}`
}
