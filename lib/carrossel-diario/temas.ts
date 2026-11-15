/**
 * TEMAS para quando o banco escrito à mão se esgota: a IA escreve um carrossel novo sobre o
 * próximo tema que não saiu nos últimos 60 dias.
 *
 * Ricardo: valor pessoal (disciplina, risco, psicologia, dinheiro, tempo), na primeira pessoa.
 * MTM: roda pelas áreas da casa. Cada tema MTM traz a palavra-chave de uma automação ACTIVA do
 * Instagram (mtm_automacoes), para quem comenta receber a mensagem certa. A IA não escolhe a
 * palavra: um comentário que não dispara nada é um seguidor deixado à espera.
 */
import type { Educador, Perfil } from './tipos'

export type Tema = { slug: string; tema: string; area: string; palavraChave?: string; oQue?: string; educador?: Educador }

export const TEMAS_RICARDO: Tema[] = [
  { slug: 'medo-de-perder', tema: 'O medo de ficar de fora (FOMO) e como deixar de perseguir o preço', area: 'psicologia' },
  { slug: 'diario-de-trading', tema: 'Como montar um diário de trading simples e o que apontar em cada operação', area: 'processo' },
  { slug: 'risco-recompensa', tema: 'Relação risco/recompensa explicada com exemplos simples', area: 'gestão de risco' },
  { slug: 'sequencia-perdas', tema: 'Como lidar com uma sequência de perdas sem destruir a conta', area: 'psicologia' },
  { slug: 'rotina-manha', tema: 'A minha rotina de manhã antes de abrir o gráfico', area: 'disciplina' },
  { slug: 'sobreoperar', tema: 'Sobreoperar: porque fazer mais operações costuma dar piores resultados', area: 'disciplina' },
  { slug: 'noticias-mercado', tema: 'Como lidar com notícias económicas fortes (NFP, juros) sem ser apanhado', area: 'mercado' },
  { slug: 'lote-certo', tema: 'Como calcular o lote certo a partir do risco em euros', area: 'gestão de risco' },
  { slug: 'ouro-xauusd', tema: 'O que mexe com o preço do ouro (XAUUSD), explicado de forma simples', area: 'mercado' },
  { slug: 'conta-pequena', tema: 'Começar com uma conta pequena: vantagens e cuidados', area: 'começar' },
  { slug: 'habitos-dinheiro', tema: 'Hábitos de dinheiro que aprendi tarde e que gostava de saber aos 20 anos', area: 'finanças pessoais' },
  { slug: 'paciencia', tema: 'Paciência no trading: esperar pelo setup certo é trabalho', area: 'psicologia' },
  { slug: 'stop-movido', tema: 'Porque é que afastar o stop loss é o erro mais caro', area: 'gestão de risco' },
  { slug: 'mentor', tema: 'O valor de aprender com quem já errou antes de ti', area: 'aprendizagem' },
  { slug: 'sessoes-mercado', tema: 'As sessões do mercado (Ásia, Londres, Nova Iorque) e quando faz sentido operar', area: 'mercado' },
  { slug: 'objetivos-realistas', tema: 'Como definir objetivos realistas no trading sem prometer números', area: 'mentalidade' },
  { slug: 'break-even', tema: 'Quando passar o stop para a entrada (break-even) e quando não', area: 'gestão de operações' },
  { slug: 'tempo-livre', tema: 'Trading consciente: operar sem ficar o dia inteiro colado ao ecrã', area: 'tempo e liberdade' },
  { slug: 'falhar-bem', tema: 'Falhar bem: o que cada perda te pode ensinar', area: 'mentalidade' },
  { slug: 'alavancagem', tema: 'Alavancagem explicada: a faca de dois gumes', area: 'gestão de risco' },
]

export const TEMAS_MTM: Tema[] = [
  { slug: 'tap-to-trade', tema: 'Tap to Trade: executar um sinal com um toque, mantendo o controlo do risco', area: 'Tap to Trade', palavraChave: 'SINAIS', oQue: 'como funciona o Tap to Trade' },
  { slug: 'webtrader', tema: 'O WebTrader MTM: treinar e operar a partir do telemóvel', area: 'WebTrader', palavraChave: 'APP', oQue: 'o acesso à app' },
  { slug: 'gestao-tp', tema: 'Como gerir uma operação com vários alvos (TP1, TP2, TP3) e saídas parciais', area: 'sinais', palavraChave: 'SINAIS', oQue: 'como funcionam os sinais' },
  { slug: 'premium-trial', tema: 'O que é o MTM Premium e como experimentar antes de decidir', area: 'Premium', palavraChave: 'PREMIUM', oQue: 'o acesso de experiência ao Premium' },
  { slug: 'mt5-ligar', tema: 'Ligar uma conta MT5 ao MTM Auto: o que acontece e o que fica sob o teu controlo', area: 'MTM Auto', palavraChave: 'COPY', oQue: 'como funciona o MTM Auto' },
  { slug: 'goldkiller', tema: 'Estratégia GoldKiller: a lógica de operar ouro com regras', area: 'estratégias', palavraChave: 'ESTRATEGIA', oQue: 'o guia das estratégias' },
  { slug: 'cripto-dca', tema: 'Cripto com cabeça: DCA, custódia e risco', area: 'cripto', palavraChave: 'CRIPTO', oQue: 'o conteúdo de cripto' },
  { slug: 'funded-regras', tema: 'As regras de um desafio em conta simulada: perda diária, perda máxima e consistência', area: 'MTM Funded', palavraChave: 'QUERO', oQue: 'como entrar no MTM Funded' },
  { slug: 'comunidade', tema: 'Porque aprender em comunidade acelera a curva de aprendizagem', area: 'comunidade', palavraChave: 'QUERO', oQue: 'como entrar na comunidade' },
  { slug: 'alertas', tema: 'Alertas de preço na app: deixar o mercado avisar-te em vez de o vigiares', area: 'app', palavraChave: 'APP', oQue: 'o acesso à app' },
  { slug: 'glossario', tema: 'Glossário rápido do trader: pip, lote, spread, margem e alavancagem', area: 'educação', palavraChave: 'GUIA', oQue: 'o guia completo' },
  { slug: 'trendshot', tema: 'Seguir tendência com regras: a lógica por trás do TrendShot', area: 'estratégias', palavraChave: 'ESTRATEGIA', oQue: 'o guia das estratégias' },
  { slug: 'criadores', tema: 'Criar conteúdo sobre finanças com responsabilidade: o que dizer e o que nunca prometer', area: 'criadores', palavraChave: 'CRIAR', oQue: 'o programa de criadores' },
  { slug: 'disciplina-membros', tema: 'Os hábitos que vemos nos membros que ficam e evoluem', area: 'disciplina', palavraChave: 'DISCIPLINA', oQue: 'o plano para começar' },
  { slug: 'conta-propria', tema: 'Porque o teu dinheiro deve estar sempre numa conta em teu nome', area: 'rota corretora', palavraChave: 'QUERO', oQue: 'o passo a passo da rota corretora' },
  { slug: 'grupos-sinais', tema: 'Grupos de sinais: como avaliar um antes de seguir', area: 'copytrading', palavraChave: 'GRUPO', oQue: 'como funcionam os nossos grupos' },
  { slug: 'sensei', tema: 'Automatizar regras com um EA: o que um robô de trading faz e não faz', area: 'estratégias', palavraChave: 'ESTRATEGIA', oQue: 'o guia das estratégias' },
  // Área dos educadores/academias: capa e fecho com a fotografia do educador (pedido do Ricardo, 06/11).
  { slug: 'edu-ricardo-metais', tema: 'Ricardo Garcia ensina: como olhar para o ouro e o forex com regras simples de leitura e risco', area: 'academia Forex e metais', palavraChave: 'ESTRATEGIA', oQue: 'o guia das estratégias', educador: 'ricardo' },
  { slug: 'edu-ruben-cripto', tema: 'Ruben Pereira ensina: cripto com cabeça, DCA, custódia e os erros de quem começa', area: 'academia Criptomoedas', palavraChave: 'CRIPTO', oQue: 'o conteúdo de cripto do Ruben', educador: 'ruben' },
  { slug: 'edu-maria-faceless', tema: 'Maria Costa ensina: criar uma marca digital sem mostrar a cara (faceless), passo a passo', area: 'academia Faceless Marketing', palavraChave: 'FACELESS', oQue: 'o conteúdo da Maria sobre faceless', educador: 'maria' },
  { slug: 'primeiro-passo', tema: 'O primeiro passo na MTM: da curiosidade à primeira operação com risco controlado', area: 'começar', palavraChave: 'COMEÇAR', oQue: 'o plano para começar' },
]

export const TEMAS: Record<Perfil, Tema[]> = { ricardo: TEMAS_RICARDO, mtm: TEMAS_MTM }
