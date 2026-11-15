/**
 * O BANCO — carrosséis escritos à mão, revistos para português de Portugal.
 *
 * Saem primeiro, por esta ordem. Quando um perfil esgota o banco, o motor passa a pedir à IA um
 * carrossel novo sobre o próximo tema da lista (./temas.ts), com as mesmas regras.
 *
 * Regras (do dono): sem promessas de lucro, sem taxas de acerto, sem números de desempenho
 * inventados, nunca nomes de empresas concorrentes, aviso educativo na legenda.
 */
import { DISCLAIMER_PT } from '@/lib/conteudo-magnetico/regras'
import type { Carrossel, Lamina, Perfil } from './tipos'

const HASH_RICARDO = '#trading #disciplina #educacaofinanceira #liberdadefinanceira #gestaoderisco #mindset #ricardogarcia'
const HASH_MTM = '#morethanmoney #trading #educacaofinanceira #forex #ouro #gestaoderisco #investimento'

function legendaRicardo(gancho: string, resumo: string[]): string {
  return [
    gancho,
    '',
    ...resumo.map((r) => `▪️ ${r}`),
    '',
    'Guarda este post para releres antes da próxima decisão e partilha com quem precisa de o ler.',
    'Segue @ricardogarciapt para mais.',
    '',
    `⚠️ ${DISCLAIMER_PT}`,
    '',
    HASH_RICARDO,
  ].join('\n')
}

function legendaMtm(gancho: string, resumo: string[], palavra: string, oQue: string): string {
  return [
    gancho,
    '',
    ...resumo.map((r) => `▪️ ${r}`),
    '',
    `💬 Comenta «${palavra}» e envio-te ${oQue} por mensagem.`,
    '',
    `⚠️ ${DISCLAIMER_PT}`,
    '',
    HASH_MTM,
  ].join('\n')
}

const c = (id: string, perfil: Perfil, area: string, laminas: Lamina[], legenda: string, palavraChave?: string): Carrossel => ({
  id,
  perfil,
  area,
  laminas,
  legenda,
  palavraChave,
})

export const BANCO_RICARDO: Carrossel[] = [
  c(
    'r001-protege-a-conta',
    'ricardo',
    'gestão de risco',
    [
      { linha: 'Antes de pensares em lucro', titulo: 'Protege a conta' },
      { linha: 'A matemática da perda', titulo: 'Perder é rápido', corpo: 'Se perdes metade da conta, precisas de duplicar o que sobrou só para voltares ao ponto de partida. Recuperar custa sempre mais do que perder.' },
      { linha: 'Regra 1', titulo: 'Arrisca pouco', corpo: 'Muitos traders arriscam entre 0,5% e 1% da conta por operação. Uma série de perdas dói, mas não te tira do jogo.' },
      { linha: 'Regra 2', titulo: 'Stop antes de entrar', corpo: 'Se não sabes onde sais quando estás errado, não tens um plano. Tens uma esperança.' },
      { linha: 'Regra 3', titulo: 'O lote vem do risco', corpo: 'Primeiro decides quanto aceitas perder. Depois calculas o lote. Nunca ao contrário.' },
      { linha: 'Regra 4', titulo: 'Sem vingança', corpo: 'Depois de uma perda, o impulso é recuperar já. É aí que as contas morrem. Define um limite de perdas por dia e cumpre-o.' },
      { linha: 'Regra 5', titulo: 'Regista tudo', corpo: 'Um diário de trading mostra-te os erros que repetes. O que não medes, não corriges.' },
      { linha: 'Se isto te foi útil', titulo: 'Guarda e partilha', corpo: 'Quem protege a conta fica tempo suficiente no mercado para aprender. O resto vem com o tempo.' },
    ],
    legendaRicardo('Antes de pensares em lucro, pensa em proteger a conta. 🛡️', [
      'Perder metade obriga-te a duplicar o que sobra',
      'Arrisca pouco por operação',
      'Stop definido antes de entrar',
      'O lote calcula-se a partir do risco',
      'Nada de trades de vingança',
      'Regista tudo num diário',
    ]),
  ),
  c(
    'r002-farda-trading',
    'ricardo',
    'disciplina',
    [
      { linha: '14 anos de farda ensinaram-me', titulo: 'Disciplina no trading' },
      { linha: 'Lição 1', titulo: 'Rotina vence motivação', corpo: 'A motivação aparece e desaparece. A rotina fica. Senta-te à mesma hora, segue os mesmos passos, todos os dias.' },
      { linha: 'Lição 2', titulo: 'Plano antes da missão', corpo: 'Ninguém sai para o terreno sem saber o objetivo e a rota de saída. No mercado é igual: entrada, stop e alvo antes de carregares no botão.' },
      { linha: 'Lição 3', titulo: 'Cumpre as tuas ordens', corpo: 'As regras que escreves com a cabeça fria valem mais do que a vontade que sentes com o gráfico a mexer.' },
      { linha: 'Lição 4', titulo: 'Recuar não é perder', corpo: 'Um stop que dispara é uma retirada planeada. Perder pouco faz parte do trabalho.' },
      { linha: 'Lição 5', titulo: 'Revisão pós-missão', corpo: 'No fim de cada semana revejo o que fiz bem e o que fiz mal. Sem culpa, sem desculpas. Só factos.' },
      { linha: 'Lição 6', titulo: 'Calma sob pressão', corpo: 'Quando o coração acelera, as decisões pioram. Se estás nervoso, a melhor operação é nenhuma.' },
      { linha: 'Para levares contigo', titulo: 'Disciplina é liberdade', corpo: 'Quanto mais regras cumpres, menos o mercado decide por ti.' },
    ],
    legendaRicardo('Passei 14 anos de farda. Foi lá que aprendi o que hoje uso no trading. 🎖️', [
      'Rotina vence motivação',
      'Plano antes da missão',
      'Cumpre as tuas próprias regras',
      'Recuar não é perder',
      'Revê a semana com factos',
      'Nervoso? Não operes',
    ]),
  ),
  c(
    'r003-primeiro-mes',
    'ricardo',
    'erros de principiante',
    [
      { linha: 'Porque é que a maioria', titulo: 'Desiste no 1.º mês' },
      { linha: 'Erro 1', titulo: 'Expectativas irreais', corpo: 'Quem entra a pensar em ficar livre num mês sai frustrado no segundo. O trading é uma competência. Leva tempo.' },
      { linha: 'Erro 2', titulo: 'Dinheiro que faz falta', corpo: 'Operar com o dinheiro da renda cria uma pressão que nenhuma estratégia aguenta. Usa só o que podes perder.' },
      { linha: 'Erro 3', titulo: 'Saltar de estratégia', corpo: 'Três perdas seguidas e muda-se tudo. Assim nunca descobres se o método funcionava. Dá-lhe uma amostra a sério.' },
      { linha: 'Erro 4', titulo: 'Não medir nada', corpo: 'Sem registo não sabes se o problema é o método ou a execução. E acabas a culpar o mercado.' },
      { linha: 'Erro 5', titulo: 'Fazer tudo sozinho', corpo: 'Aprender rodeado de quem já passou pelo mesmo poupa-te meses de erros. Sozinho, cada erro custa a dobrar.' },
      { linha: 'Resumindo', titulo: 'Paciência e processo', corpo: 'Quem fica tempo suficiente para aprender já está à frente da maioria.' },
    ],
    legendaRicardo('A maioria desiste do trading no primeiro mês. Quase sempre pelos mesmos motivos. 👇', [
      'Expectativas irreais',
      'Operar com dinheiro que faz falta',
      'Saltar de estratégia ao primeiro revés',
      'Não medir nada',
      'Fazer tudo sozinho',
    ]),
  ),
  c(
    'r004-cinco-perguntas',
    'ricardo',
    'processo',
    [
      { linha: 'Antes de carregares em comprar', titulo: 'Faz estas 5 perguntas' },
      { linha: 'Pergunta 1', titulo: 'Onde saio se errar?', corpo: 'Se não tens resposta, não tens operação. O stop decide-se antes, nunca durante.' },
      { linha: 'Pergunta 2', titulo: 'Quanto estou a arriscar?', corpo: 'Em euros, não em pips. Se esse valor te tira o sono, o lote está grande demais.' },
      { linha: 'Pergunta 3', titulo: 'Isto está no meu plano?', corpo: 'Se a entrada não cumpre as tuas regras, é palpite. E palpites não se repetem com consistência.' },
      { linha: 'Pergunta 4', titulo: 'Estou calmo?', corpo: 'Cansado, irritado ou a tentar recuperar uma perda? Fecha o gráfico. O mercado amanhã continua lá.' },
      { linha: 'Pergunta 5', titulo: 'O alvo compensa?', corpo: 'Se arriscas 1 para ganhar 0,5, precisas de acertar muitas vezes. Procura alvos que paguem o risco.' },
      { linha: 'Cinco respostas', titulo: 'Depois decides', corpo: 'Se alguma resposta falhar, a melhor decisão é não entrar.' },
    ],
    legendaRicardo('Cinco perguntas que faço antes de cada operação. Se uma falha, não entro. ✋', [
      'Onde saio se estiver errado?',
      'Quanto estou a arriscar em euros?',
      'Isto está no meu plano?',
      'Estou calmo?',
      'O alvo paga o risco?',
    ]),
  ),
  c(
    'r005-ocupado-produtivo',
    'ricardo',
    'tempo e liberdade',
    [
      { linha: 'Estar ocupado', titulo: 'Não é avançar' },
      { linha: 'A armadilha', titulo: '40 horas por semana', corpo: 'Podes trabalhar a vida inteira e chegar ao fim sem nada que trabalhe por ti. Eu estive assim 14 anos.' },
      { linha: 'Passo 1', titulo: 'Mede o teu tempo', corpo: 'Durante uma semana, aponta onde vão as tuas horas. Vais encontrar tempo que não sabias que tinhas.' },
      { linha: 'Passo 2', titulo: 'Uma hora por dia', corpo: 'Uma hora por dia a aprender uma competência são mais de 300 horas num ano. É o suficiente para mudar de patamar.' },
      { linha: 'Passo 3', titulo: 'Escolhe uma coisa', corpo: 'Quem aprende cinco coisas ao mesmo tempo não domina nenhuma. Foca-te numa até ela dar frutos.' },
      { linha: 'Passo 4', titulo: 'Automatiza o repetitivo', corpo: 'O que fazes todas as semanas da mesma forma pode ser feito por uma ferramenta. Guarda a tua cabeça para decidir.' },
      { linha: 'No fim', titulo: 'Constrói algo teu', corpo: 'O objetivo não é trabalhar menos. É trabalhar em algo que continua a crescer quando paras.' },
    ],
    legendaRicardo('Estive 14 anos ocupado. Não trouxe nada de futuro. Foi isto que mudei. ⏳', [
      'Mede para onde vai o teu tempo',
      'Uma hora por dia para aprender',
      'Foca-te numa competência',
      'Automatiza o que é repetitivo',
      'Constrói algo que cresça sem ti',
    ]),
  ),
  c(
    'r006-juros-pressa',
    'ricardo',
    'finanças pessoais',
    [
      { linha: 'O dinheiro cresce com tempo', titulo: 'Não com pressa' },
      { linha: 'Primeiro', titulo: 'Fundo de emergência', corpo: 'Antes de investir, guarda o suficiente para uns meses de despesas. Sem isso, qualquer imprevisto obriga-te a vender na pior altura.' },
      { linha: 'Depois', titulo: 'Mata as dívidas caras', corpo: 'Um cartão de crédito com juros altos come mais do que qualquer investimento te consegue dar com segurança.' },
      { linha: 'A seguir', titulo: 'Investe todos os meses', corpo: 'Um valor fixo, sempre no mesmo dia. Tiras a emoção da equação e deixas de tentar adivinhar o momento perfeito.' },
      { linha: 'O segredo', titulo: 'Tempo no mercado', corpo: 'O juro composto precisa de anos para se notar. Quem mexe em tudo a cada notícia nunca lhe dá tempo.' },
      { linha: 'Cuidado', titulo: 'Desconfia do rápido', corpo: 'Se te prometem muito dinheiro em pouco tempo, alguém vai ganhar. Normalmente não és tu.' },
      { linha: 'Ordem certa', titulo: 'Base, depois risco', corpo: 'Primeiro a casa arrumada. Só depois o trading e os investimentos de maior risco.' },
    ],
    legendaRicardo('A ordem certa importa mais do que a estratégia. 💶', [
      'Fundo de emergência primeiro',
      'Paga as dívidas caras',
      'Investe um valor fixo todos os meses',
      'Dá tempo ao juro composto',
      'Desconfia de promessas rápidas',
    ]),
  ),
  c(
    'r007-grafico-15-minutos',
    'ricardo',
    'análise técnica',
    [
      { linha: 'Como leio um gráfico', titulo: 'Em 15 minutos' },
      { linha: 'Minuto 1 a 3', titulo: 'Tendência maior', corpo: 'Começo no gráfico diário ou de 4 horas. Se a tendência é de subida, procuro compras. Não remo contra a maré.' },
      { linha: 'Minuto 4 a 7', titulo: 'Marca as zonas', corpo: 'Assinalo onde o preço reagiu várias vezes. São essas as zonas onde vale a pena estar atento.' },
      { linha: 'Minuto 8 a 10', titulo: 'Espera confirmação', corpo: 'Chegar à zona não chega. Quero ver o preço reagir no gráfico mais pequeno antes de pensar em entrar.' },
      { linha: 'Minuto 11 a 13', titulo: 'Stop e alvo', corpo: 'O stop fica onde a ideia deixa de fazer sentido. O alvo, na próxima zona. Se a conta não compensa, passo.' },
      { linha: 'Minuto 14 a 15', titulo: 'Decide e fecha', corpo: 'Se tudo bate certo, executo com o lote calculado. Se não bate, fecho o gráfico. Não há trade obrigatório.' },
      { linha: 'A regra de ouro', titulo: 'Sem setup, sem trade', corpo: 'Os melhores dias às vezes são aqueles em que não fazes nada.' },
    ],
    legendaRicardo('O meu processo para ler um gráfico em 15 minutos, sem ficar o dia colado ao ecrã. 📈', [
      'Tendência no tempo maior',
      'Zonas onde o preço reage',
      'Confirmação no tempo menor',
      'Stop e alvo antes de entrar',
      'Sem setup, sem trade',
    ]),
  ),
]

export const BANCO_MTM: Carrossel[] = [
  c(
    'm001-ler-um-sinal',
    'mtm',
    'sinais e Tap to Trade',
    [
      { linha: 'Guia rápido', titulo: 'Como ler um sinal' },
      { linha: 'Parte 1', titulo: 'Par e direção', corpo: 'XAUUSD BUY quer dizer comprar ouro contra o dólar. SELL é vender. É a primeira coisa que confirmas.' },
      { linha: 'Parte 2', titulo: 'Zona de entrada', corpo: 'O preço ou intervalo onde a ideia é válida. Se o mercado já fugiu muito dali, não persegues a entrada.' },
      { linha: 'Parte 3', titulo: 'Stop loss', corpo: 'Onde a ideia fica sem efeito. É o teu seguro. Nunca o tiras nem o afastas para «dar espaço».' },
      { linha: 'Parte 4', titulo: 'Alvos TP1, TP2, TP3', corpo: 'Pontos para ir realizando. Muitos traders fecham parte no TP1 e passam o stop para a entrada.' },
      { linha: 'Parte 5', titulo: 'O teu lote', corpo: 'O sinal não sabe quanto tens na conta. O lote calcula-se pelo risco que aceitas, não pelo que outro usa.' },
      { linha: 'Parte 6', titulo: 'Nem todos ganham', corpo: 'Há sinais que batem no stop. É normal. O que conta é a gestão ao longo de muitas operações.' },
      { linha: 'Queres praticar?', titulo: 'Comenta e recebe', corpo: 'Na app MTM tens os sinais com entrada, stop e alvos, e o Tap to Trade para executar com um toque.' },
    ],
    legendaMtm(
      'Recebeste um sinal e não sabes por onde começar? Guarda este guia. 📲',
      ['Par e direção', 'Zona de entrada', 'Stop loss', 'Alvos TP1, TP2 e TP3', 'Lote pelo teu risco', 'Perdas fazem parte'],
      'SINAIS',
      'como funcionam os sinais na app',
    ),
    'SINAIS',
  ),
  c(
    'm002-corretora-regulada',
    'mtm',
    'rota corretora',
    [
      { linha: 'Antes de depositares', titulo: 'Escolhe bem a corretora' },
      { linha: 'Ponto 1', titulo: 'Quem a regula?', corpo: 'Procura o número de licença no site e confirma-o no site do próprio regulador. Se não encontras, desconfia.' },
      { linha: 'Ponto 2', titulo: 'Conta em teu nome', corpo: 'O dinheiro deve estar numa conta tua, na corretora. Ninguém precisa de receber o teu capital para te ensinar.' },
      { linha: 'Ponto 3', titulo: 'Custos claros', corpo: 'Spread, comissões e custos overnight têm de estar escritos. Custo escondido é custo maior.' },
      { linha: 'Ponto 4', titulo: 'Levantar é fácil?', corpo: 'Antes de depositar muito, testa um levantamento pequeno. Diz-te mais do que qualquer anúncio.' },
      { linha: 'Ponto 5', titulo: 'Plataforma estável', corpo: 'MT5 ou outra, tem de executar bem nas horas de notícias. Experimenta em demo primeiro.' },
      { linha: 'Na MTM', titulo: 'A rota corretora', corpo: 'Abres conta própria na PU Prime e a MTM acompanha-te. O dinheiro fica numa conta em teu nome.' },
    ],
    legendaMtm(
      'A corretora onde abres conta conta mais do que pensas. Cinco verificações antes de depositar. 🔍',
      ['Regulador e licença', 'Conta em teu nome', 'Custos claros', 'Testa um levantamento', 'Plataforma estável'],
      'QUERO',
      'o passo a passo da rota corretora',
    ),
    'QUERO',
  ),
  c(
    'm003-copytrading',
    'mtm',
    'MTM Auto e copytrading',
    [
      { linha: 'Antes de copiares alguém', titulo: 'Copytrading sem ilusões' },
      { linha: 'Verdade 1', titulo: 'O dinheiro é teu', corpo: 'No copytrading sério a conta está em teu nome. A cópia só replica operações, não mexe no teu capital.' },
      { linha: 'Verdade 2', titulo: 'Perdas também copiam', corpo: 'Se a estratégia perde, tu perdes. Quem só te mostra os dias bons está a esconder metade da história.' },
      { linha: 'Verdade 3', titulo: 'O risco é por conta', corpo: 'Uma boa ferramenta deixa-te definir o risco máximo. Contas pequenas operam com lote mínimo.' },
      { linha: 'Verdade 4', titulo: 'Histórico verificável', corpo: 'Pede o historial real, com perdas incluídas. Prints soltos não provam nada.' },
      { linha: 'Verdade 5', titulo: 'Podes parar', corpo: 'Tens de conseguir pausar a cópia quando quiseres, sem pedir autorização a ninguém.' },
      { linha: 'Na MTM', titulo: 'MTM Auto', corpo: 'Ligas a tua conta MT5, escolhes a estratégia e o risco, e pausas quando quiseres. Tudo à vista na app.' },
    ],
    legendaMtm(
      'Copytrading pode ajudar, mas só se souberes o que estás a copiar. 🔁',
      ['O dinheiro fica na tua conta', 'As perdas também se copiam', 'Define o risco por conta', 'Exige histórico verificável', 'Tens de poder parar'],
      'COPY',
      'como funciona o MTM Auto',
    ),
    'COPY',
  ),
  c(
    'm004-conta-simulada',
    'mtm',
    'MTM Funded',
    [
      { linha: 'Ainda sem capital?', titulo: 'Treina numa conta simulada' },
      { linha: 'Porquê 1', titulo: 'Erra sem pagar', corpo: 'Os primeiros erros são inevitáveis. Numa conta simulada aprendes com eles sem perder dinheiro.' },
      { linha: 'Porquê 2', titulo: 'Testa o teu plano', corpo: 'Regras de entrada, stop e lote só se validam com muitas operações. A simulada dá-te essa amostra.' },
      { linha: 'Porquê 3', titulo: 'Ganha rotina', corpo: 'Abrir, gerir e fechar operações tem de ser automático antes de haver dinheiro real em jogo.' },
      { linha: 'Cuidado', titulo: 'Não é a mesma pressão', corpo: 'Na simulada a emoção é menor. Por isso, trata-a como se fosse real: mesmo lote, mesmas regras.' },
      { linha: 'Na MTM', titulo: 'MTM Funded', corpo: 'Desafios em contas simuladas, com regras claras. Quem mostra consistência pode receber o Patrocínio de Desempenho MTM para abrir a sua conta.' },
      { linha: 'Importante', titulo: 'Não é prop firm', corpo: 'As contas do MTM Funded são simuladas. O patrocínio é um apoio para começares na tua própria conta.' },
    ],
    legendaMtm(
      'Sem capital para começar? Treina primeiro. É assim que se ganha rotina sem pagar os erros. 🎯',
      ['Erra sem perder dinheiro', 'Valida o teu plano', 'Ganha rotina de execução', 'Trata a simulada como real'],
      'QUERO',
      'como entrar no MTM Funded',
    ),
    'QUERO',
  ),
  c(
    'm005-dca',
    'mtm',
    'portfolios DCA',
    [
      { linha: 'Investir sem adivinhar', titulo: 'O método DCA' },
      { linha: 'O que é', titulo: 'Valor fixo, data fixa', corpo: 'Investes o mesmo valor sempre no mesmo dia, suba ou desça o mercado. Sem tentar acertar no momento.' },
      { linha: 'Vantagem 1', titulo: 'Menos emoção', corpo: 'A decisão já está tomada. Não precisas de ver notícias nem gráficos para saber o que fazer.' },
      { linha: 'Vantagem 2', titulo: 'Preço médio', corpo: 'Quando o preço desce, o mesmo valor compra mais unidades. Ao longo do tempo, o custo médio suaviza.' },
      { linha: 'Vantagem 3', titulo: 'Começa pequeno', corpo: 'Não precisas de muito para começar. Precisas de constância. O hábito vale mais do que o montante.' },
      { linha: 'Atenção', titulo: 'Não elimina o risco', corpo: 'Se o ativo cair durante anos, o DCA não te protege disso. Escolhe bem onde investes.' },
      { linha: 'Na MTM', titulo: 'Portfolios DCA', corpo: 'Na app acompanhas portfolios com compras automáticas às sextas, com cotações à vista.' },
    ],
    legendaMtm(
      'Não sabes quando entrar no mercado? Talvez a pergunta esteja errada. 📆',
      ['Valor fixo numa data fixa', 'Menos emoção', 'Preço médio mais suave', 'Começa pequeno', 'Não elimina o risco'],
      'DCA',
      'como funcionam os portfolios DCA',
    ),
    'DCA',
  ),
  c(
    'm006-scanner',
    'mtm',
    'scanners e estratégias',
    [
      { linha: 'Verdades sobre indicadores', titulo: 'O que um scanner faz' },
      { linha: 'Faz', titulo: 'Poupa-te tempo', corpo: 'Em vez de passares horas a olhar para gráficos, o scanner avisa-te quando as condições da estratégia aparecem.' },
      { linha: 'Faz', titulo: 'Tira a emoção', corpo: 'As regras são sempre as mesmas. O scanner não fica cansado, ansioso nem com vontade de recuperar.' },
      { linha: 'Faz', titulo: 'Dá-te um mapa', corpo: 'Entrada, stop e alvos definidos antes. Sabes o que fazer em cada cenário.' },
      { linha: 'Não faz', titulo: 'Não adivinha', corpo: 'Nenhum indicador sabe o futuro. Há sinais que falham. É por isso que a gestão de risco vem primeiro.' },
      { linha: 'Não faz', titulo: 'Não decide por ti', corpo: 'O lote, o risco e a disciplina são teus. A ferramenta ajuda, mas quem executa és tu.' },
      { linha: 'Na MTM', titulo: 'As estratégias', corpo: 'MTM Scanner, GoldKiller, TrendShot e as outras estratégias da casa, com regras explicadas passo a passo.' },
    ],
    legendaMtm(
      'Um scanner é uma ferramenta, não uma bola de cristal. O que faz e o que não faz. 🧭',
      ['Poupa-te tempo', 'Tira a emoção das regras', 'Dá-te um mapa claro', 'Não adivinha o futuro', 'Não decide por ti'],
      'ESTRATEGIA',
      'o guia das estratégias',
    ),
    'ESTRATEGIA',
  ),
  c(
    'm007-sinais-de-alerta',
    'mtm',
    'educação vs. promessas',
    [
      { linha: 'Educação ou esquema?', titulo: '5 sinais de alerta' },
      { linha: 'Alerta 1', titulo: 'Ganhos garantidos', corpo: 'Nenhum mercado garante resultados. Quem te promete um ganho certo todos os meses está a vender outra coisa.' },
      { linha: 'Alerta 2', titulo: 'Ganhas por recrutar', corpo: 'Se o dinheiro vem sobretudo de trazer pessoas e não do produto, o modelo depende de entrar sempre gente nova.' },
      { linha: 'Alerta 3', titulo: 'Dás-lhes o teu dinheiro', corpo: 'Educação séria nunca precisa de guardar o teu capital. A conta deve estar em teu nome, numa entidade regulada.' },
      { linha: 'Alerta 4', titulo: 'Só mostram carros', corpo: 'Estilo de vida não é prova. Prova é historial completo, com as perdas incluídas.' },
      { linha: 'Alerta 5', titulo: 'Pressa para decidir', corpo: '«Só hoje», «últimas vagas». Uma boa decisão aguenta uma noite de reflexão.' },
      { linha: 'Na MTM', titulo: 'Transparência', corpo: 'Ensinamos método, mostramos resultados com origem e o teu dinheiro fica sempre na tua conta.' },
    ],
    legendaMtm(
      'Antes de entrares em qualquer projeto de dinheiro, confirma estes cinco pontos. 🚩',
      ['Ganhos garantidos', 'Ganhar por recrutar', 'Entregar o teu capital', 'Estilo de vida como prova', 'Pressa para decidir'],
      'QUERO',
      'como trabalhamos na MTM',
    ),
    'QUERO',
  ),
]

export const BANCO: Record<Perfil, Carrossel[]> = { ricardo: BANCO_RICARDO, mtm: BANCO_MTM }
