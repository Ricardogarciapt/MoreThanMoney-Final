// Este software e código faz parte integrante da propriedade intelectual de RicardoGarciaPT e sua Empresa MoreThanMoney

export const pineScriptScanner = `//@version=5
indicator("MoreThanMoney - Scanner Site", overlay=true)

// Função para calcular a Média Móvel Exponencial Dupla (DEMA)
dema(src, length) =>
    ema1 = ta.ema(src, length)
    ema2 = ta.ema(ema1, length)
    2 * ema1 - ema2

// Definições para o indicador de Média Móvel DEMA
lengthDEMA15 = 15
lengthDEMA50 = 50
lengthDEMA238 = 238

dema15 = dema(close, lengthDEMA15)
dema50 = dema(close, lengthDEMA50)
dema238 = dema(close, lengthDEMA238)

plot(dema15, color=color.blue, title="DEMA 15")
plot(dema50, color=color.green, title="DEMA 50")
plot(dema238, color=#ffce2b, title="DEMA 238")

// Definições para o indicador de Bollinger Bands
lengthBB = input.int(20, "Período das Bandas de Bollinger")
srcBB = input.source(close, "Fonte para Bandas de Bollinger")
multBB = input.float(2.0, "Multiplicador das Bandas de Bollinger")

// Definições para o indicador de POC
lengthPOC = input.int(14, "Período do POC")
var float highestVolPrice = na
var float highestVol = 0.0

// Reset das variáveis para POC
if (bar_index % lengthPOC == 0)
    highestVol := 0.0
    highestVolPrice := na

for i = 0 to lengthPOC - 1
    if volume[i] > highestVol
        highestVol := volume[i]
        highestVolPrice := close[i]


// Plotando o POC
plot(highestVolPrice, color=color.orange, linewidth=1, title="Linha do POC")

// Cores dos sinais de compra e venda
buySignalColor = color.green
sellSignalColor = color.red

// Lógica de sinais de compra e venda
isBuySignal = ta.crossover(close, highestVolPrice)
isSellSignal = ta.crossunder(close, highestVolPrice)

plotshape(isBuySignal, style=shape.labelup, location=location.belowbar, color=buySignalColor, text="B", size=size.tiny, title="Sinal de Compra")
plotshape(isSellSignal, style=shape.labeldown, location=location.abovebar, color=sellSignalColor, text="S", size=size.tiny, title="Sinal de Venda")

// Fases do Momentum
bGR = 'Fase de Momentum'
bTP = 'A fase de momentum fornece uma indicação do momentum inicial da tendência e identifica um ponto provável de topo ou fundo em mercados laterais.\\n\\n' +
      'Completo - exibe apenas as fases de momentum concluídas\\n' +
      'Detalhado - exibe todo o processo de contagem das fases de momentum\\n' +
      'Nenhum - desativa a exibição das fases de momentum'

bSh = input.string('Nenhum', 'Exibir Fases', options=['Completo', 'Detalhado', 'Nenhum'], group=bGR, tooltip=bTP)

eGR = 'Fase de Exaustão da Tendência'
eTP = 'A fase de exaustão da tendência visa identificar quando a tendência está enfraquecendo/exaurindo e possivelmente começando a reverter. A fase de exaustão da tendência começa apenas se uma fase de momentum já estiver estabelecida.\\n\\n' +
      'Completo - exibe apenas as fases de exaustão da tendência concluídas\\n' +
      'Detalhado - exibe todo o processo de contagem das fases de exaustão da tendência\\n' +
      'Nenhum - desativa a exibição das fases de exaustão da tendência'

eSh = input.string('Nenhum', 'Exibir Fases', options=['Completo', 'Detalhado', 'Nenhum'], group=eGR, tooltip=eTP)

tGR = 'Configurações de Trade'
tTP = 'Todas as configurações de trade específicas de fase, apresentadas como opções, são acionadas uma vez que a fase selecionada esteja concluída e seja seguida por uma reversão de preço na direção da configuração de trade. Preste atenção aos níveis de risco específicos da fase, bem como à direção geral da tendência.\\n' +
      '⚠️ Negociar envolve alto risco, olhe primeiro, depois pule.\\n\\n' +
      'Dicas : \\n' +
      ' - Configurações de trade de momentum não são recomendadas e, se aplicadas, funcionam melhor em mercados laterais\\n' +
      '   Um sinal de trade seguido imediatamente por uma indicação de alerta pode ser assumido como uma continuação da tendência subjacente e pode ser negociado na direção oposta ao sinal sugerido.\\n\\n' +
      ' - Configurações de trade de Exaustão/Qualificado funcionam melhor em mercados de tendência.\\n' +
      '   Exaustão, tipo sugerido de configuração de trade, compre (venda) quando a fase de exaustão da tendência de compra (venda) estiver completa.\\n' +
      '   Qualificado, a fase de exaustão da tendência seguida pela fase de momentum é assumida como configuração de trade qualificada.'

tso = input.string('Momentum', 'Opções Específicas de Configuração de Trade', options=['Momentum', 'Exaustão', 'Qualificado', 'Nenhum'], group=tGR, tooltip=tTP)
war = input.bool(true, 'Reversões de Preço contra as Configurações de Trade Específicas da Fase', group=tGR)

var bool BnoShw = false
Bcmpltd = bSh == 'Completo'
BnoShw := bSh == 'Nenhum' ? false : true

var bool noShw = false
cmpltd = eSh == 'Completo'
noShw := eSh == 'Nenhum' ? false : true

type bar
    float o = open
    float h = high
    float l = low
    float c = close
    int i = bar_index

type trb 
    int bSC
    float bSH
    float bSL

    int sSC
    float sSH
    float sSL

type tre 
    int bCC
    float bC8
    float bCHt
    float bCH
    float bCL
    float bCLt
    float bCD

    int sCC
    float sC8
    float sCHt
    float sCH
    float sCL
    float sCLt
    float sCT

bar b = bar.new()
var trb S = trb.new()
var tre C = tre.new()

noC = #00000000
rdC = #f23645
gnC = #089981
whC = #ffffff
blC = #2962ff
grC = #787b86
bgC = #00bcd4

shpD = shape.labeldown
shpU = shape.labelup
locA = location.abovebar
locB = location.belowbar
dspN = false
pltL = plot.style_circles
pltS = size.tiny

f_xLX(_p, _l) =>
    (_l > _p and _l < _p[1]) or (_l < _p and _l > _p[1])

con = b.c < b.c[4]

if con
    S.bSC := S.bSC == 9 ? 1 : S.bSC + 1
    S.sSC := 0
else
    S.sSC := S.sSC == 9 ? 1 : S.sSC + 1
    S.bSC := 0

pbS = (b.l <= b.l[3] and b.l <= b.l[2]) or (b.l[1] <= b.l[3] and b.l[1] <= b.l[2])

// Funções para exibir fases de momentum
plotshape(BnoShw and not Bcmpltd and S.bSC == 1, '', shpD, locA, na, 0, '₁', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 2, '', shpD, locA, na, 0, '₂', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 3, '', shpD, locA, na, 0, '₃', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 4, '', shpD, locA, na, 0, '₄', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 5, '', shpD, locA, na, 0, '₅', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 6, '', shpD, locA, na, 0, '₆', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 7, '', shpD, locA, na, 0, '₇', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 8, '', shpD, locA, na, 0, '₈', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 9, '', shpD, locA, na, 0, '₉', gnC, dspN)
plotshape(BnoShw and not Bcmpltd and S.bSC == 0, '', shpD, locA, na, 0, '₀', gnC, dspN)

plotshape(Bcmpltd and S.sSC == 1, '', shpD, locA, na, 0, '₁', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 2, '', shpD, locA, na, 0, '₂', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 3, '', shpD, locA, na, 0, '₃', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 4, '', shpD, locA, na, 0, '₄', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 5, '', shpD, locA, na, 0, '₅', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 6, '', shpD, locA, na, 0, '₆', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 7, '', shpD, locA, na, 0, '₇', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 8, '', shpD, locA, na, 0, '₈', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 9, '', shpD, locA, na, 0, '₉', rdC, dspN)
plotshape(Bcmpltd and S.sSC == 0, '', shpD, locA, na, 0, '₀', rdC, dspN)

// Saída de valores dos indicadores para Possivel reversão
plotshape(S.bSC, "Possivel Reversão Compra", style=shape.circle, location=location.belowbar, color=color.green, size=size.tiny, title="Reversão Possivel Compra")
plotshape(S.sSC, "Possivel Reversão Venda", style=shape.circle, location=location.abovebar, color=color.red, size=size.tiny, title="Reversão Possivel Venda")

// ===================== CONFIGURAÇÃO ATR PARA RR 1:6 =====================
// Adiciona grupo de configuração do ATR para Risk-Reward
atrGroup = "==== CONFIGURAÇÃO ATR ===="
useATR = input.bool(true, "Usar ATR para Risk-Reward", group=atrGroup)
atrPeriod = input.int(14, "Período do ATR", minval=1, group=atrGroup)
atrMultiplierSL = input.float(1.0, "Multiplicador ATR para Stop Loss", step=0.1, group=atrGroup)

// Calcula o ATR
atrValue = ta.atr(atrPeriod)

// Configuração dos múltiplos de TP baseados no RR desejado
tp1RR = input.float(2.0, "TP1 Ratio (1:X)", minval=0.1, step=0.1, group=atrGroup, tooltip="TP1 será SL multiplicado por este valor")
tp2RR = input.float(4.0, "TP2 Ratio (1:X)", minval=0.1, step=0.1, group=atrGroup, tooltip="TP2 será SL multiplicado por este valor")
tp3RR = input.float(6.0, "TP3 Ratio (1:X)", minval=0.1, step=0.1, group=atrGroup, tooltip="TP3 será SL multiplicado por este valor")

// Adiciona opções para exibir linhas de TP
showTP1 = input.bool(true, "Exibir TP1 (RR 1:2)", group=atrGroup)
showTP2 = input.bool(true, "Exibir TP2 (RR 1:4)", group=atrGroup)
showTP3 = input.bool(true, "Exibir TP3 (RR 1:6)", group=atrGroup)

//Manuseamento de Risco
tt_cstm_entry = "Desative esta opção para usar a fonte de entrada selecionada e torná-la dinâmica"
tt_cstm_exit = "Defina tanto o TP personalizado quanto o SL personalizado ANTES de ativar esta opção"

// ------------------------ Definições ----------------------
entry_source    = input.source(title="Fonte das Entradas", defval=close, group="===== DEFINIÇÕES =====")
box_length      = input.int(title="Distância da posição Esquerda", defval=4, minval=1, group="===== DEFINIÇÕES =====")
box_length2     = input.int(title="Distância da posição Direita", defval=1, minval=1, group="===== DEFINIÇÕES =====")
use_cstm_entry  = input.bool(title="Usa entrada customizada?", tooltip=tt_cstm_entry, defval=false, group="===== DEFINIÇÕES =====")
custom_entry    = input.price(title="Preço de Entrada: ", confirm=false, defval=0.0, group="===== DEFINIÇÕES =====")
full_custom     = input.bool(title="Usa TP && SL personalizado?", tooltip=tt_cstm_exit, defval=false, group="===== DEFINIÇÕES =====")
custom_tp       = input.float(title="TP Manual", defval=000.0, group="===== DEFINIÇÕES =====")
custom_sl       = input.float(title="SL Manual", defval=000.0, group="===== DEFINIÇÕES =====")

// CORREÇÃO: Removendo o operador condicional do parâmetro defval
use_RR          = input.bool(title="Use Risco Recompensa?", defval=false, group="=== RISK:REWARD ===")
risk            = input.float(title="Valor de Risco", defval=1, minval=0.5, step=0.5, group="=== RISK:REWARD ===")
reward          = input.float(title="Valor Recompensa", defval=5, minval=0.5, step=0.5, group="=== RISK:REWARD ===")
rr_tp           = input.float(title='Percentagem', defval=0.5, step=0.1, group="=== RISK:REWARD ===")

// CORREÇÃO: Removendo o operador condicional do parâmetro defval
use_TPs         = input.bool(title="Usa niveis de TP?", defval=true, group="=== TAKEPROFIT ===")
useTp1          = input.bool(title="Usa TP1?", defval=true, group="=== TAKEPROFIT ===")
useTp2          = input.bool(title="Usa TP2?", defval=true, group="=== TAKEPROFIT ===")
useTp3          = input.bool(title="Usa TP3?", defval=true, group="=== TAKEPROFIT ===")
useTp4          = input.bool(title="Usa TP4?", defval=false, group="=== TAKEPROFIT ===")
useTp5          = input.bool(title="Usa TP5?", defval=false, group="=== TAKEPROFIT ===")

slx             = input.float(title="Percentagem para SL", defval=0.3, step=0.1, group="=== TAKEPROFIT ===")
tp1x            = input.float(title="Percentagem para TP1", defval=0.4, step=0.1, group="=== TAKEPROFIT ===")
tp2x            = input.float(title="Percentagem para TP2", defval=0.8, step=0.1, group="=== TAKEPROFIT ===")
tp3x            = input.float(title="Percentagem para TP3", defval=1.2, step=0.1, group="=== TAKEPROFIT ===")
tp4x            = input.float(title="Percentagem para TP4", defval=0, step=0.1, group="=== TAKEPROFIT ===")
tp5x            = input.float(title="Percentagem para TP5", defval=0, step=0.1, group="=== TAKEPROFIT ===")

long_alert      = input.bool(title="Permite Alertas de COMPRA", defval=true, group="====== ALERTAS ======")
short_alert     = input.bool(title="Permite Alertas de VENDA", defval=true, group="====== ALERTAS ======")
order_type      = input.string(title="Alerta para ordens", options=["LIMIT", "MARKET"], defval="MARKET", group="====== ALERTAS ======")
resop           = input.timeframe(title="timeFrame", defval="", group="====== ALERTAS ======")

// Atribuir dinamicamente a posição com base nos sinais
var string position = na  // Variável global para a posição

if (isBuySignal)
    position := "BUY"
else if (isSellSignal)
    position := "SELL"

// ———————   Lógica para entrada, TP, SL com base na posição e ATR  ———————
round_price(x) =>
    xx = int(x / syminfo.mintick)
    xx * syminfo.mintick

Price_in = use_cstm_entry ? custom_entry : entry_source

var float tp1 = na
var float tp2 = na
var float tp3 = na
var float tp4 = na
var float tp5 = na
var float sl = na
var float entry1 = na
var int et  = 0

line l11    = na
line l2     = na
line l3     = na
line l4     = na
line l5     = na

label lb11  = na
label lb2   = na
label lb3   = na
label lb4   = na
label lb5   = na

dt = time - time[box_length]

// Simplificando a lógica de cálculo dos níveis
if position == "BUY" or position == "SELL"
    entry1 := round_price(Price_in)
    et := time[box_length2]
    
    // ATR mode
    if useATR
        sl_distance = atrValue * atrMultiplierSL
        if position == "BUY"
            sl := round_price(entry1 - sl_distance)
            tp1 := round_price(entry1 + (sl_distance * tp1RR))
            tp2 := round_price(entry1 + (sl_distance * tp2RR))
            tp3 := round_price(entry1 + (sl_distance * tp3RR))
        else // SELL
            sl := round_price(entry1 + sl_distance)
            tp1 := round_price(entry1 - (sl_distance * tp1RR))
            tp2 := round_price(entry1 - (sl_distance * tp2RR))
            tp3 := round_price(entry1 - (sl_distance * tp3RR))
    // Percentage mode
    else if use_TPs
        if position == "BUY"
            tp1 := round_price(entry1 * (1 + (tp1x / 100)))
            tp2 := round_price(entry1 * (1 + (tp2x / 100)))
            tp3 := round_price(entry1 * (1 + (tp3x / 100)))
            tp4 := round_price(entry1 * (1 + (tp4x / 100)))
            tp5 := round_price(entry1 * (1 + (tp5x / 100)))
            sl := round_price(entry1 * (1 - (slx / 100)))
        else // SELL
            tp1 := round_price(entry1 * (1 - (tp1x / 100)))
            tp2 := round_price(entry1 * (1 - (tp2x / 100)))
            tp3 := round_price(entry1 * (1 - (tp3x / 100)))
            tp4 := round_price(entry1 * (1 - (tp4x / 100)))
            tp5 := round_price(entry1 * (1 - (tp5x / 100)))
            sl := round_price(entry1 * (1 + (slx / 100)))

var linefill linefill3 = na
var linefill linefill4 = na
var linefill linefill5 = na
var linefill linefill6 = na

if barstate.islast
    // Apaga os objetos linefill anteriores
    linefill.delete(linefill3)
    linefill.delete(linefill4)
    linefill.delete(linefill5)
    linefill.delete(linefill6)
    
    // Criação de novas linhas e labels
    l11 := line.new(et, entry1, time + dt * 2, entry1, color=color.purple, style=line.style_solid, xloc=xloc.bar_time)
    l2 := line.new(et, sl, time + dt * 2, sl, color=color.red, style=line.style_solid, xloc=xloc.bar_time)
    
    lb11 := label.new(time + dt * 4, entry1, text="Entry:" + str.tostring(entry1), color=color.blue, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
    lb2 := label.new(time + dt * 4, sl, text="Stop:" + str.tostring(sl), color=color.red, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
    
    // Desenha TP lines baseado nos modos
    if useATR
        // Para modo ATR
        if showTP1
            l3 := line.new(et, tp1, time + dt * 2, tp1, color=color.green, style=line.style_solid, xloc=xloc.bar_time)
            lb3 := label.new(time + dt * 4, tp1, text="TP1 (RR 1:" + str.tostring(tp1RR) + "):" + str.tostring(tp1), color=color.green, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
            linefill3 := linefill.new(l11, l3, color=color.new(color.green, 85))
        
        if showTP2
            l4 := line.new(et, tp2, time + dt * 2, tp2, color=color.green, style=line.style_solid, xloc=xloc.bar_time)
            lb4 := label.new(time + dt * 4, tp2, text="TP2 (RR 1:" + str.tostring(tp2RR) + "):" + str.tostring(tp2), color=color.green, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
            linefill5 := linefill.new(l11, l4, color=color.new(color.green, 90))
        
        if showTP3
            l5 := line.new(et, tp3, time + dt * 2, tp3, color=color.green, style=line.style_solid, xloc=xloc.bar_time)
            lb5 := label.new(time + dt * 4, tp3, text="TP3 (RR 1:" + str.tostring(tp3RR) + "):" + str.tostring(tp3), color=color.green, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
            linefill6 := linefill.new(l11, l5, color=color.new(color.green, 95))
    else
        // Para modo percentual
        if useTp1
            l3 := line.new(et, tp1, time + dt * 2, tp1, color=color.green, style=line.style_solid, xloc=xloc.bar_time)
            lb3 := label.new(time + dt * 4, tp1, text="TP1:" + str.tostring(tp1), color=color.green, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
            linefill3 := linefill.new(l11, l3, color=color.new(color.green, 85))
        
        if not use_RR and useTp2
            l4 := line.new(et, tp2, time + dt * 2, tp2, color=color.green, style=line.style_solid, xloc=xloc.bar_time)
            lb4 := label.new(time + dt * 4, tp2, text="TP2:" + str.tostring(tp2), color=color.green, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
        
        if not use_RR and useTp3
            l5 := line.new(et, tp3, time + dt * 2, tp3, color=color.green, style=line.style_solid, xloc=xloc.bar_time)
            lb5 := label.new(time + dt * 4, tp3, text="TP3:" + str.tostring(tp3), color=color.green, textcolor=color.white, style=label.style_label_left, xloc=xloc.bar_time, textalign=text.align_left, size=size.normal)
    
    linefill4 := linefill.new(l2, l11, color=color.new(color.red, 85))

    // Limpando objetos antigos
    label.delete(lb11[1])
    line.delete(l11[1])
    line.delete(l2[1])
    label.delete(lb2[1])
    line.delete(l3[1])
    label.delete(lb3[1])
    line.delete(l4[1])
    label.delete(lb4[1])
    line.delete(l5[1])
    label.delete(lb5[1])


//---------------------------------------------------------------------------------------------------------------------}
//DEFINIÇÕES ESTRUTURAS DE MERCADO
//---------------------------------------------------------------------------------------------------------------------{
len = input(50, 'CHoCH Detection Period')
shortLen = input(3, 'IDM Detection Period')

//Styling
bullCss = input(#089981, 'Bullish Elements', group = 'Style')
bearCss = input(#ff5252, 'Bearish Elements', group = 'Style')

showChoch = input(true, "Show CHoCH", group = 'Style')
showBos = input(true, "Show BOS", group = 'Style')

showIdm = input(true, "Show Inducements", inline = 'idm', group = 'Style')
idmCss = input(color.gray, "", inline = 'idm', group = 'Style')

showSweeps = input(true, "Show Sweeps", inline = 'sweeps', group = 'Style')
sweepsCss = input(color.gray, "", inline = 'sweeps', group = 'Style')

showCircles = input(true, "Show Swings", group = 'Style')

//---------------------------------------------------------------------------------------------------------------------}
//Funções
//---------------------------------------------------------------------------------------------------------------------{
//Swings detection/measurements
n = bar_index

swings(len)=>
    var os = 0
    var int topx = na
    var int btmx = na
    
    upper = ta.highest(len)
    lower = ta.lowest(len)

    os := high[len] > upper ? 0 : low[len] < lower ? 1 : os[1]

    top = os == 0 and os[1] != 0 ? high[len] : na
    topx := os == 0 and os[1] != 0 ? n[len] : topx

    btm = os == 1 and os[1] != 1 ? low[len] : na
    btmx := os == 1 and os[1] != 1 ? n[len] : btmx

    [top, topx, btm, btmx]

//---------------------------------------------------------------------------------------------------------------------}
//Swings
//---------------------------------------------------------------------------------------------------------------------{
[top, topx, btm, btmx] = swings(len)
[stop, stopx, sbtm, sbtmx] = swings(shortLen)

var os = 0
var top_crossed = false
var btm_crossed = false

var float max = na
var float min = na

var int max_x1 = na
var int min_x1 = na

var float topy = na
var float btmy = na
var stop_crossed = false
var sbtm_crossed = false    

//---------------------------------------------------------------------------------------------------------------------}
//Deteção CHoCH
//---------------------------------------------------------------------------------------------------------------------{
if top
    topy := top
    top_crossed := false
if btm
    btmy := btm
    btm_crossed := false

//Testa CHoCH
if close > topy and not top_crossed
    os := 1
    top_crossed := true
if close < btmy and not btm_crossed
    os := 0
    btm_crossed := true

//Mostra CHoCH
if os != os[1]
    max := high
    min := low
    max_x1 := n
    min_x1 := n
    stop_crossed := false
    sbtm_crossed := false

    if os == 1 and showChoch
        line.new(topx, topy, n, topy, color = bullCss, style = line.style_dashed)
        label.new(int(math.avg(n, topx)), topy, 'CHoCH', color = color(na), style = label.style_label_down, textcolor = bullCss, size = size.tiny)
    else if showChoch
        line.new(btmx, btmy, n, btmy, color = bearCss, style = line.style_dashed)
        label.new(int(math.avg(n, btmx)), btmy, 'CHoCH', color = color(na), style = label.style_label_up, textcolor = bearCss, size = size.tiny)

stopy = fixnan(stop)
sbtmy = fixnan(sbtm)

//---------------------------------------------------------------------------------------------------------------------}
//Bullish BOS
//---------------------------------------------------------------------------------------------------------------------{
//IDM
if low < sbtmy and not sbtm_crossed and os == 1 and sbtmy != btmy
    if showIdm
        line.new(sbtmx, sbtmy, n, sbtmy, color = idmCss, style = line.style_dotted)
        label.new(int(math.avg(n, sbtmx)), sbtmy, 'IDM', color = color(na), style = label.style_label_up, textcolor = idmCss, size = size.tiny)
    
    sbtm_crossed := true

//BOS
if close > max and sbtm_crossed and os == 1
    if showBos
        line.new(max_x1, max, n, max, color = bullCss)
        label.new(int(math.avg(n, max_x1)), max, 'BOS', color = color(na), style = label.style_label_down, textcolor = bullCss, size = size.tiny)
    
    sbtm_crossed := false

//---------------------------------------------------------------------------------------------------------------------}
//Bearish BOS
//---------------------------------------------------------------------------------------------------------------------{
//IDM
if high > stopy and not stop_crossed and os == 0 and stopy != topy
    if showIdm
        line.new(stopx, stopy, n, stopy, color = color.gray, style = line.style_dotted)
        label.new(int(math.avg(n, stopx)), stopy, 'IDM', color = color(na), style = label.style_label_down, textcolor = color.gray, size = size.tiny)
    
    stop_crossed := true

//BOS
if close < min and stop_crossed and os == 0
    if showBos
        line.new(min_x1, min, n, min, color = bearCss)
        label.new(int(math.avg(n, min_x1)), min, 'BOS', color = color(na), style = label.style_label_up, textcolor = bearCss, size = size.tiny)
    
    stop_crossed := false

//---------------------------------------------------------------------------------------------------------------------}
//Sweeps
//---------------------------------------------------------------------------------------------------------------------{
if high > max and close < max and os == 1 and n - max_x1 > 1 and showSweeps
    line.new(max_x1, max, n, max, color = sweepsCss, style = line.style_dotted)
    label.new(int(math.avg(n, max_x1)), max, 'x', color = color(na), style = label.style_label_down, textcolor = sweepsCss)

if low < min and close > min and os == 0 and n - min_x1 > 1 and showSweeps
    line.new(min_x1, min, n, min, color = sweepsCss, style = line.style_dotted)
    label.new(int(math.avg(n, min_x1)), min, 'x', color = color(na), style = label.style_label_up, textcolor = sweepsCss)

//Trailing max/min
max := math.max(high, max)
min := math.min(low, min)

if max > max[1]
    max_x1 := n
if min < min[1]
    min_x1 := n

//---------------------------------------------------------------------------------------------------------------------}
//Extensions
//---------------------------------------------------------------------------------------------------------------------{
var ext_choch = line.new(na,na,na,na, style = line.style_dashed)
var ext_bos   = line.new(na,na,na,na)
var ext_idm   = line.new(na,na,na,na, style = line.style_dotted, color = idmCss)

var ext_choch_lbl = label.new(na,na, 'CHoCH', color = color(na), size = size.tiny)
var ext_bos_lbl   = label.new(na,na, 'BOS'  , color = color(na), size = size.tiny)
var ext_idm_lbl   = label.new(na,na, 'IDM'  , color = color(na), size = size.tiny, textcolor = idmCss)

if barstate.islast
    if os == 1
        if showChoch
            ext_choch.set_xy1(btmx, btmy), ext_choch.set_xy2(n, btmy), ext_choch.set_color(bearCss)    
            ext_choch_lbl.set_xy(n, btmy), ext_choch_lbl.set_style(label.style_label_up), ext_choch_lbl.set_textcolor(bearCss)
        
        if showBos
            ext_bos.set_xy1(max_x1, max), ext_bos.set_xy2(n, max), ext_bos.set_color(bullCss)    
            ext_bos_lbl.set_xy(n, max), ext_bos_lbl.set_style(label.style_label_down), ext_bos_lbl.set_textcolor(bullCss)
        
        if not sbtm_crossed and showIdm
            ext_idm.set_xy1(sbtmx, sbtmy), ext_idm.set_xy2(n+15, sbtmy)   
            ext_idm_lbl.set_xy(n+15, sbtmy), ext_idm_lbl.set_style(label.style_label_up)
            ext_idm.set_color(idmCss), ext_idm_lbl.set_textcolor(idmCss)
        else
            ext_idm.set_color(na)
            ext_idm_lbl.set_textcolor(na)
    else
        if showChoch
            ext_choch.set_xy1(topx, topy), ext_choch.set_xy2(n, topy), ext_choch.set_color(bullCss)    
            ext_choch_lbl.set_xy(n, topy), ext_choch_lbl.set_style(label.style_label_down), ext_choch_lbl.set_textcolor(bullCss)
        
        if showBos
            ext_bos.set_xy1(min_x1, min), ext_bos.set_xy2(n, min), ext_bos.set_color(bearCss)    
            ext_bos_lbl.set_xy(n, min), ext_bos_lbl.set_style(label.style_label_up), ext_bos_lbl.set_textcolor(bearCss)

        if not stop_crossed and showIdm
            ext_idm.set_xy1(stopx, stopy), ext_idm.set_xy2(n+15, stopy)   
            ext_idm_lbl.set_xy(n+15, stopy), ext_idm_lbl.set_style(label.style_label_down)
            ext_idm.set_color(idmCss), ext_idm_lbl.set_textcolor(idmCss)
        else
            ext_idm.set_color(na)
            ext_idm_lbl.set_textcolor(na)

//---------------------------------------------------------------------------------------------------------------------}
//Plots
//---------------------------------------------------------------------------------------------------------------------{
plot(showCircles ? top : na, 'Swing High', color.new(bearCss, 50), 5, plot.style_circles, offset = -len)
plot(showCircles ? btm : na, 'Swing Low', color.new(bullCss, 50), 5, plot.style_circles, offset = -len)
`
