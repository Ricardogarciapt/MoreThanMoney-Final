// Fast Start Forex · Vídeo 1 (Introdução + MetaTrader 5 mobile). Duração total = narração (≈352,9 s a 30 fps).
export const FPS = 30
export const BLOCO = 'Vídeo 1'
export const DISCLAIMER = 'Conteúdo educativo. Não constitui aconselhamento financeiro. O risco de perda é real. Exemplos ilustrativos.'

export type Grafico = { titulo: string; linhas: [string, string][] }
export type Cena = { titulo: string; dicas: string[]; img: string; dur: number; grafico?: Grafico }

export const CENAS: Cena[] = [
  { titulo: 'Prepara a bancada', img: 'mt5-tel-conta.png', dur: 1512, dicas: ['Instala o MetaTrader 5', 'Usa o servidor da corretora', 'Confirma se é Demo ou Live'] },
  { titulo: 'Procura o símbolo', img: 'mt5-tel-procurar-simbolo.png', dur: 1512, dicas: ['Procura EURUSD', 'Adiciona o par às Cotações'] },
  { titulo: 'Cotações', img: 'mt5-tel-cotacoes.png', dur: 1512, dicas: ['Dois preços: venda e compra', 'A diferença é o spread'] },
  { titulo: 'O gráfico', img: 'mt5-tel-grafico.png', dur: 1512, dicas: ['Abre o gráfico do par', 'Lê as velas, uma de cada vez'] },
  { titulo: 'Arruma o ecrã', img: 'mt5-tel-definicoes-grafico.png', dur: 1512, dicas: ['Velas japonesas', 'Linha Ask ligada', 'Nenhum indicador'] },
  { titulo: 'Períodos de tempo', img: 'mt5-tel-periodos.png', dur: 1512, dicas: ['Escolhe um período que consigas acompanhar', 'Não mudes de período a cada minuto'] },
  { titulo: 'Teste final', img: 'mt5-tel-trio.png', dur: 1515, dicas: ['Identifica o último preço', 'Pronto para o próximo vídeo'] },
]

export const TOTAL = CENAS.reduce((a, c) => a + c.dur, 0)
