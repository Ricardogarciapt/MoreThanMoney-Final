/**
 * OS CONTROLOS DA CONTA MESTRE — e, para cada um, QUEM O LÊ.
 *
 * ═══ PORQUE É QUE ESTE FICHEIRO EXISTE ══════════════════════════════════════════════════════
 *
 * A 29/09 mediu-se isto na base de produção:
 *
 *  · `mtmauto_providers.sl_minimo_pips = 100` no GoldKiller. Nenhum motor o lê. A tabela que
 *    realmente alarga stops é `lib/mtmcopy/source-risk-rules.ts`, e é uma constante no código com
 *    duas fontes lá dentro (`mtmscanner`, `forexideas`). O painel mostrava 100 e o 100 não fazia nada.
 *  · `sinais_config.perfil = 'zona'` no Sensei e no Premium. É só uma etiqueta: `configDoProvider`
 *    (lib/mtmfunded/estrategias-sinais/calculo.ts:297) nunca a lê.
 *  · `horario` está NULL nos oito providers vivos — e não tem um único leitor neste repositório.
 *
 * Um painel bonito por cima de campos que ninguém lê é pior do que não ter painel: dá ao gestor a
 * sensação de ter posto uma trava de segurança. Por isso cada controlo que aparece no quadro branco
 * traz daqui o seu ESTADO, e o ecrã não tem por onde mentir — se não há motor, aparece escrito
 * «não aplicado» em cima do campo.
 *
 * ═══ A REGRA PARA QUEM MEXER NISTO ══════════════════════════════════════════════════════════
 *
 * Acrescentar um controlo ao quadro obriga a acrescentar aqui a linha com `lidoPor` — o ficheiro e a
 * linha do motor que o lê, verificados. Sem isso, `estado: 'nao-aplicado'`. Nunca `'aplicado'` por
 * optimismo: o campo `lidoPor` é o que torna a afirmação verificável, e `__tests__/mestre-controlos.check.ts`
 * confirma que nenhum controlo se diz aplicado sem apontar para um motor.
 *
 * `lidoPor` é uma REFERÊNCIA A CÓDIGO, não um caminho a importar: os números de linha envelhecem, e
 * é de propósito que envelheçam à vista em vez de silenciosamente.
 */

export type EstadoControlo =
  /** há um motor que o lê e age com ele */
  | 'aplicado'
  /** um motor lê-o, mas só em sombra — registra o que faria, não mexe na conta */
  | 'so-sombra'
  /** o valor é lido para relatórios/etiquetas e nunca chega a uma decisão de trading */
  | 'so-ecra'
  /** escrito e nunca lido por motor nenhum: o campo não faz nada */
  | 'nao-aplicado'

export type GrupoControlo = 'saidas' | 'horarios' | 'risco'

export interface Controlo {
  chave: string
  rotulo: string
  /** onde o valor vive, tal e qual */
  coluna: string
  grupo: GrupoControlo
  estado: EstadoControlo
  /** ficheiro:linha do motor que o lê. Vazio só faz sentido com `estado: 'nao-aplicado'`. */
  lidoPor: string[]
  /** o que o gestor tem de saber antes de mexer — incluindo quando o campo não faz nada */
  nota: string
}

export const ROTULO_ESTADO: Record<EstadoControlo, string> = {
  aplicado: 'aplicado',
  'so-sombra': 'só em sombra',
  'so-ecra': 'só no ecrã',
  'nao-aplicado': 'NÃO APLICADO',
}

/**
 * Os controlos, por grupo, na ordem em que o gestor os lê.
 *
 * Os estados vêm da auditoria de 29/09 sobre este repositório. Onde um campo é lido por um motor que
 * vive no repositório irmão (mtm-auto), está dito na nota — «não aplicado AQUI» não é o mesmo que
 * «não aplicado em lado nenhum», e confundir os dois levava a desligar coisas que funcionam.
 */
export const CONTROLOS_MESTRE: Controlo[] = [
  // ── 1 · automações de saída ────────────────────────────────────────────────
  {
    chave: 'beFracaoDoRisco',
    rotulo: 'Auto Break-Even (fracção do risco)',
    coluna: 'sinais_config.beFracaoDoRisco',
    grupo: 'saidas',
    estado: 'aplicado',
    lidoPor: [
      'lib/mtmfunded/estrategias-sinais/calculo.ts:320 → gestaoDoSinal:429',
      'lib/mtmfunded/simulado/avancadas.ts:257 (move o SL a sério)',
      'lib/gestao-real/provider.ts:252',
    ],
    nota: 'A 1,0 o SL vai para a entrada quando o lucro iguala o risco inicial. É esta chave, e não a coluna be_gatilho, que manda no BE das mestres.',
  },
  {
    chave: 'beOffsetFracaoDoRisco',
    rotulo: 'Folga do Break-Even (entrada + taxas)',
    coluna: 'sinais_config.beOffsetFracaoDoRisco',
    grupo: 'saidas',
    estado: 'aplicado',
    lidoPor: ['lib/mtmfunded/estrategias-sinais/calculo.ts:321 → :432', 'lib/gestao-real/provider.ts:253'],
    nota: 'O «+ taxas» do break-even: o SL fica ligeiramente do lado do lucro para o spread e a comissão não transformarem um BE num pequeno prejuízo.',
  },
  {
    chave: 'be_gatilho',
    rotulo: 'Break-even no alvo TP nº',
    coluna: 'mtmauto_providers.be_gatilho',
    grupo: 'saidas',
    estado: 'so-sombra',
    lidoPor: ['lib/mtmfunded/espelho/provider.ts:61 → :240 (só o espelho provider)'],
    nota: 'ATENÇÃO: esta coluna tem dois sentidos na casa — «TP nº N» no espelho e «pips» em lib/mtmauto/reconstruir-desempenho.ts:428. O caminho sinal→mestre ignora-a DE PROPÓSITO (calculo.ts:315-317). Para o BE das mestres usa-se a fracção do risco, acima.',
  },
  {
    chave: 'trailingInicioFracaoDoRisco',
    rotulo: 'Auto Trailing Stop — arranque',
    coluna: 'sinais_config.trailingInicioFracaoDoRisco',
    grupo: 'saidas',
    estado: 'aplicado',
    lidoPor: ['lib/mtmfunded/estrategias-sinais/calculo.ts:322 → :468', 'lib/gestao-real/provider.ts:256'],
    nota: 'A partir de quantos «riscos» de lucro o stop começa a seguir a máxima.',
  },
  {
    chave: 'trailingFracaoDoRisco',
    rotulo: 'Auto Trailing Stop — distância',
    coluna: 'sinais_config.trailingFracaoDoRisco',
    grupo: 'saidas',
    estado: 'aplicado',
    lidoPor: ['lib/mtmfunded/estrategias-sinais/calculo.ts:330 → :463', 'lib/gestao-real/provider.ts:286'],
    nota: 'Distância a que o SL segue, em fracção do risco inicial. Por omissão 0,5.',
  },
  {
    chave: 'trailing_passo_pips',
    rotulo: 'Passo do trailing (pips)',
    coluna: 'mtmauto_providers.trailing_passo_pips / sinais_config.trailingPassoPips',
    grupo: 'saidas',
    estado: 'nao-aplicado',
    lidoPor: [],
    nota: 'Lido para dentro da configuração e descartado: o motor simulado calcula o passo sozinho — lib/mtmfunded/simulado/avancadas.ts:99 impõe max(pip_size, distância/10). Mexer aqui não muda nada nas mestres. Só o espelho provider (provider.ts:186) e o motor do repo mtm-auto o respeitam.',
  },
  {
    chave: 'semTrailing',
    rotulo: 'Trailing Profit — deixar o alvo correr',
    coluna: 'sinais_config.semTrailing',
    grupo: 'saidas',
    estado: 'aplicado',
    lidoPor: ['lib/mtmfunded/estrategias-sinais/calculo.ts:331 → :465', 'lib/gestao-real/provider.ts:103'],
    nota: 'A escolha entre fechar no TP fixo e deixar a posição correr com o stop atrás. Ligado, não se grava trailing na posição e o TP final manda; desligado, o TP flutua atrás da tendência via as duas chaves acima. É o que o «Trailing Profit» quer dizer aqui: não existe um terceiro campo para ele.',
  },
  {
    chave: 'saidasFracaoDoRisco',
    rotulo: 'Parciais por fracção do risco',
    coluna: 'sinais_config.saidasFracaoDoRisco',
    grupo: 'saidas',
    estado: 'aplicado',
    lidoPor: ['lib/mtmfunded/estrategias-sinais/calculo.ts:305 → :406-421'],
    nota: 'Manda sobre saidas_pct. É o alvo parcial que arma o break-even, por isso mexer nisto mexe no BE.',
  },
  {
    chave: 'trailing_tempo_real',
    rotulo: 'Trailing segue o preço ao vivo',
    coluna: 'mtmauto_providers.trailing_tempo_real',
    grupo: 'saidas',
    estado: 'nao-aplicado',
    lidoPor: [],
    nota: 'O caminho sinal→mestre não lê esta coluna. Quem decide o trailing ao vivo é o interruptor GLOBAL site_settings.mtmcopy_exec_switches.trailing_tempo_real (lib/mtmcopy/exec-switches.ts:51) — dois campos com o mesmo nome e donos diferentes. A coluna só conta para o espelho provider (provider.ts:68, cadência 1 s vs 5 s).',
  },

  // ── 2 · filtro de horários ────────────────────────────────────────────────
  {
    chave: 'janela',
    rotulo: 'Janela em que a mestre pode emitir',
    coluna: 'sinais_config.travas.janela',
    grupo: 'horarios',
    estado: 'aplicado',
    lidoPor: [
      'lib/copia-contas/mestre-travas.ts:foraDaJanela',
      'lib/mestres/servidor/sinal-mestre.ts (travas da mestre, antes de abrir)',
    ],
    nota: 'Em UTC. `22:00–06:00` é uma janela válida que passa a meia-noite. Trava só ABERTURAS — o BE, o trailing e os fechos do que já está aberto passam sempre.',
  },
  {
    chave: 'noticias',
    rotulo: 'Bloqueio de notícias (min antes/depois)',
    coluna: 'sinais_config.travas.noticias',
    grupo: 'horarios',
    estado: 'nao-aplicado',
    lidoPor: ['lib/copia-contas/mestre-travas.ts:emSombraDeNoticia (a regra existe e está testada)'],
    nota: 'A REGRA está escrita e testada, mas NÃO HÁ FONTE DE EVENTOS no lado do site: o único calendário da casa é o CSV em UTC das EA MT5, que vive no terminal e não numa tabela. Enquanto a lista de eventos chegar vazia, esta trava nunca dispara. Ligar a sério = trazer o calendário para uma tabela (ou um serviço do VPS) e passá-lo a esta função.',
  },
  {
    chave: 'fimDeSemana',
    rotulo: 'Fecho de fim de semana',
    coluna: 'sinais_config.travas.fimDeSemana',
    grupo: 'horarios',
    estado: 'aplicado',
    lidoPor: [
      'lib/copia-contas/mestre-travas.ts:depoisDoFechoSemanal',
      'lib/mestres/servidor/sinal-mestre.ts (travas da mestre, antes de abrir)',
    ],
    nota: 'A partir da hora de sexta (UTC) não se abre até segunda. Sábado e domingo contam como fechados, para um relay atrasado não entregar um sinal de sexta no sábado de manhã.',
  },
  {
    chave: 'horario',
    rotulo: 'Horário (coluna antiga)',
    coluna: 'mtmauto_providers.horario (jsonb)',
    grupo: 'horarios',
    estado: 'nao-aplicado',
    lidoPor: [],
    nota: 'ZERO leitores neste repositório, e está NULL nos oito providers vivos. Não se construiu por cima dela: a janela nova vive em sinais_config.travas.janela, que tem motor. Esta coluna fica à vista para ninguém a confundir com uma trava.',
  },
  {
    chave: 'max_trades_dia',
    rotulo: 'Máximo de trades por dia',
    coluna: 'mtmauto_providers.max_trades_dia',
    grupo: 'horarios',
    estado: 'nao-aplicado',
    lidoPor: [],
    nota: 'Editável em lib/estrategias-admin/opcoes.ts:112 e lido por motor nenhum neste repositório. NULL nos oito providers. O tecto que existe de verdade é o de POSIÇÕES ABERTAS por conta (max_posicoes), não o de trades por dia.',
  },
  {
    chave: 'simbolos_permitidos',
    rotulo: 'Símbolos permitidos',
    coluna: 'mtmauto_providers.simbolos_permitidos',
    grupo: 'horarios',
    estado: 'nao-aplicado',
    lidoPor: [],
    nota: 'O filtro de símbolos que funciona é o da CONTA e da subscrição (lib/mestres/lote.ts:145 lê conta.simbolos_permitidos, não a do provider). A coluna do provider está NULL em todos e não tem leitor.',
  },

  // ── 3 · gestão de risco raiz ──────────────────────────────────────────────
  {
    chave: 'maxDdDiarioPct',
    rotulo: 'Max daily drawdown da mestre (%)',
    coluna: 'sinais_config.travas.maxDdDiarioPct',
    grupo: 'risco',
    estado: 'aplicado',
    lidoPor: [
      'lib/copia-contas/mestre-travas.ts:drawdownDiarioExcedido',
      'lib/mestres/servidor/sinal-mestre.ts (travas da mestre, antes de abrir)',
    ],
    nota: 'Medido contra a equity do INÍCIO DO DIA, não contra o saldo inicial da conta. Atingido, a mestre não abre mais nada — e como tudo o que os seguidores recebem vem dela, a cadeia pára na origem sem se escrever nada em conta nenhuma (ver o cabeçalho de mestre-travas.ts).',
  },
  {
    chave: 'margemLivreMinPct',
    rotulo: 'Margem livre mínima (% da equity)',
    coluna: 'sinais_config.travas.margemLivreMinPct',
    grupo: 'risco',
    estado: 'aplicado',
    lidoPor: [
      'lib/copia-contas/mestre-travas.ts:margemInsuficiente',
      'lib/mestres/servidor/sinal-mestre.ts (travas da mestre, antes de abrir)',
    ],
    nota: 'A mestre é uma conta simulada: a margem vem do motor simulado. Sem valor de margem, NÃO trava — uma trava que dispara por falta de dados pára a estratégia e parece prudência.',
  },
  {
    chave: 'sl_minimo_pips',
    rotulo: 'Stop mínimo (pips)',
    coluna: 'mtmauto_providers.sl_minimo_pips',
    grupo: 'risco',
    estado: 'nao-aplicado',
    lidoPor: [],
    nota: 'O CASO QUE MOTIVOU TODO ESTE TRABALHO. Está a 100 no GoldKiller, 50 no Sensei e no Aurum Flow, 20 no MTM Scanner — e nenhum motor lê a coluna. Quem alarga stops é a constante SL_MINIMO_PIPS em lib/mtmcopy/source-risk-rules.ts:20, que só conhece «mtmscanner» e «forexideas». Ligar a sério = fazer slMinimoPips() consultar esta coluna por estratégia em vez da constante.',
  },
  {
    chave: 'risco_default_pct',
    rotulo: 'Risco por omissão (%)',
    coluna: 'mtmauto_providers.risco_default_pct',
    grupo: 'risco',
    estado: 'so-ecra',
    lidoPor: [],
    nota: 'É o ponto de partida que um copiador herda ao seguir, não uma trava: o lote das mestres sai de sinais_config.lotePor1000 (calculo.ts:301) e das regras da conta.',
  },
  {
    chave: 'max_posicoes',
    rotulo: 'Máximo de posições abertas (por conta)',
    coluna: 'mestres_contas.max_posicoes',
    grupo: 'risco',
    estado: 'aplicado',
    lidoPor: ['lib/mestres/decisao.ts:motivoExposicao'],
    nota: 'É da CONTA SEGUIDORA, não da mestre — está aqui para o gestor ver a trava inteira num sítio. Por omissão 10 (LIMITES_POR_OMISSAO).',
  },
  {
    chave: 'max_risco_total_pct',
    rotulo: 'Risco total máximo da conta (%)',
    coluna: 'mestres_contas.max_risco_total_pct',
    grupo: 'risco',
    estado: 'aplicado',
    lidoPor: ['lib/mestres/decisao.ts:motivoExposicao'],
    nota: 'Somado entre todas as estratégias e o T2T. Uma posição sem SL conhecido conta pelo pior caso (2 %), nunca por zero. Por omissão 6 %.',
  },
  {
    chave: 'max_atraso_abertura_s',
    rotulo: 'Atraso máximo de abertura (s)',
    coluna: 'mestres_estrategias.max_atraso_abertura_s',
    grupo: 'risco',
    estado: 'aplicado',
    lidoPor: ['lib/mestres/decisao.ts:aberturaAtrasada'],
    nota: 'Uma abertura mais velha do que isto não se envia — não se entra a meio do movimento. Por omissão 30 s.',
  },
]

// ── consultas ───────────────────────────────────────────────────────────────

export const GRUPOS: { id: GrupoControlo; nome: string; sub: string }[] = [
  { id: 'saidas', nome: '1 · Automações de saída', sub: 'Break-even, trailing stop e o que faz o alvo flutuar em vez de fechar fixo.' },
  { id: 'horarios', nome: '2 · Filtro de horários', sub: 'Quando é que a mestre pode emitir — janela, notícias e o gap de domingo.' },
  { id: 'risco', nome: '3 · Gestão de risco raiz', sub: 'O que trava a cadeia inteira na origem: drawdown do dia, margem e exposição.' },
]

export function controlosDoGrupo(g: GrupoControlo): Controlo[] {
  return CONTROLOS_MESTRE.filter((c) => c.grupo === g)
}

/** Quantos controlos NÃO fazem nada — o número que o quadro mostra em cima, sem o esconder. */
export function contarPorEstado(): Record<EstadoControlo, number> {
  const out: Record<EstadoControlo, number> = { aplicado: 0, 'so-sombra': 0, 'so-ecra': 0, 'nao-aplicado': 0 }
  for (const c of CONTROLOS_MESTRE) out[c.estado]++
  return out
}

/** Um controlo pode prometer protecção? Só o `aplicado` — os outros têm de o dizer no ecrã. */
export function protege(c: Controlo): boolean {
  return c.estado === 'aplicado'
}
