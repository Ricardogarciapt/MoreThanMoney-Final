// Fast Start Forex · Lições 2 a 4 (narração completa, duração = áudio a 30 fps).
// Cada cena usa um print real do MT5 mobile. Ainda não há gráficos próprios de pips, lotes e checklist.
import type { Cena } from './cenas'
export const FPS = 30
export const DISCLAIMER = 'Conteúdo educativo. Não constitui aconselhamento financeiro. O risco de perda é real. Exemplos ilustrativos.'

type Base = { titulo: string; dicas: string[]; img: string; grafico?: { titulo: string; linhas: [string, string][] } }
const distribuir = (base: Base[], total: number): Cena[] => {
  const d = Math.floor(total / base.length)
  return base.map((b, i) => ({ ...b, dur: i === base.length - 1 ? total - d * (base.length - 1) : d }))
}

const L2: Base[] = [
  { titulo: 'O pip', grafico: { titulo: 'Quanto vale 1 pip', linhas: [['EUR/USD', '0,0001 = 1 pip'], ['USD/JPY', '0,01 = 1 pip'], ['Ouro (XAU/USD)', 'convenção do corretor']] }, dicas: ['Quarta casa decimal na maioria dos pares', 'Um pip no iene é a segunda casa'], img: 'mt5-tel-cotacoes.png' },
  { titulo: 'O lote', grafico: { titulo: 'Valor de 1 pip no EUR/USD', linhas: [['Standard 1,00', '≈ 10 USD'], ['Mini 0,10', '≈ 1 USD'], ['Micro 0,01', '≈ 0,10 USD']] }, dicas: ['Standard 1,00 · mini 0,10 · micro 0,01', 'Cada pip depende do lote'], img: 'mt5-tel-procurar-simbolo.png' },
  { titulo: 'Spread e swap', grafico: { titulo: 'Custo por operação', linhas: [['Spread de 1 pip, mini lote', '≈ 1 USD'], ['20 operações no mês', '≈ 20 USD']] }, dicas: ['Compras ao ask, vendes ao bid', 'O custo repete-se em cada operação'], img: 'mt5-tel-cotacoes.png' },
  { titulo: 'Alavancagem', dicas: ['A margem não é o risco', 'Na UE a ESMA limita a alavancagem'], img: 'mt5-tel-conta.png' },
  { titulo: 'Tipos de ordem', grafico: { titulo: 'Acima ou abaixo do preço', linhas: [['Sell Limit', 'acima · vende se o preço subir'], ['Buy Stop', 'acima · compra se romper'], ['Buy Limit', 'abaixo · compra se o preço descer'], ['Sell Stop', 'abaixo · vende se romper']] }, dicas: ['Limit: o preço volta até ti', 'Stop: o preço rompe e segue'], img: 'mt5-tel-trio.png' },
  { titulo: 'Stop e alvo', dicas: ['Nenhuma ordem sai sem stop', 'O stop só se move a favor'], img: 'mt5-tel-grafico.png' },
  { titulo: 'Ordem passo a passo', dicas: ['Lê o volume em voz alta', 'Antes de Colocar, responde às perguntas'], img: 'mt5-tel-trio.png' },
]
const L3: Base[] = [
  { titulo: 'O risco em dinheiro', grafico: { titulo: 'Conta de 500 dólares', linhas: [['Risco máximo (1 %)', '5 USD'], ['Stop de 25 pips', '0,02 lotes']] }, dicas: ['Não arrisques mais de 1 % por operação', 'O stop decide o lote'], img: 'mt5-tel-conta.png' },
  { titulo: 'A fórmula', grafico: { titulo: 'O lote', linhas: [['Lote', 'risco ÷ (pips × valor do pip)'], ['Prova', '25 × 0,02 × 10 = 5 USD']] }, dicas: ['Lote = risco ÷ (pips × valor do pip)', 'Prova com números redondos'], img: 'mt5-tel-definicoes-grafico.png' },
  { titulo: 'Conta de 500 dólares', dicas: ['Risco de 5 dólares', 'Stop de 25 pips dá 0,02 lotes'], img: 'mt5-tel-trio.png' },
  { titulo: 'Lotes que não cabem', dicas: ['Stop maior, lote menor', 'Nunca aumentes para recuperar'], img: 'mt5-tel-grafico.png' },
  { titulo: 'Risco e recompensa', grafico: { titulo: 'Relação risco : alvo (exemplo)', linhas: [['Stop de 25 pips', 'risco'], ['Alvo de 37,5 pips', '1:1,5 mínimo']] }, dicas: ['Relação mínima de 1:1,5', 'Exemplo ilustrativo, não promessa'], img: 'mt5-tel-periodos.png' },
  { titulo: 'Contas pequenas', dicas: ['Com pouco capital, o risco é o mesmo', 'Não é saída arriscar mais'], img: 'mt5-tel-conta.png' },
  { titulo: 'A regra desta aula', dicas: ['No máximo 1 % por operação', 'Depois de perder, o lote não sobe'], img: 'mt5-tel-definicoes-grafico.png' },
]
const L4: Base[] = [
  { titulo: 'Erros de ecrã', dicas: ['A vírgula no volume', 'Limit trocado por Stop'], img: 'mt5-tel-trio.png' },
  { titulo: 'O campo do stop', dicas: ['Confirma se é preço, pips ou dinheiro', 'Nunca arrastes o stop para longe'], img: 'mt5-tel-grafico.png' },
  { titulo: 'A checklist', grafico: { titulo: 'Antes de cada ordem', linhas: [['1', 'Par e hora no plano?'], ['2', 'Notícias nos próximos 30 min?'], ['3', 'O stop e o lote saíram do cálculo?']] }, dicas: ['Par e hora no plano?', 'Notícias nos próximos 30 minutos?', 'Se alguma resposta é não, não entras'], img: 'mt5-tel-conta.png' },
  { titulo: 'Calendário económico', grafico: { titulo: 'Regra dos 30 minutos', linhas: [['Domingo', 'marca os eventos de 3 estrelas'], ['Antes do evento', 'não entras 30 min antes nem depois']] }, dicas: ['Marca os eventos de três estrelas', 'Regra dos 30 minutos'], img: 'mt5-tel-periodos.png' },
  { titulo: 'A tua janela', dicas: ['Londres com Nova Iorque é a mais movimentada', 'Escolhe uma janela que cumpras'], img: 'mt5-tel-periodos.png' },
  { titulo: 'Da demo para o real', dicas: ['Passas com critérios, não com lucro', 'Começa pelo lote mínimo'], img: 'mt5-tel-cotacoes.png' },
  { titulo: 'Próximo passo', dicas: ['Conta demo 77471528 no WebTrader', 'Sem promessa de resultados'], img: 'mt5-tel-trio.png' },
]

export const LICAO2 = distribuir(L2, 13820)
export const LICAO3 = distribuir(L3, 11412)
export const LICAO4 = distribuir(L4, 13080)
