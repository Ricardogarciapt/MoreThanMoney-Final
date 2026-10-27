//+------------------------------------------------------------------+
//|                                   MTM_Premium_Scanner_EA.mq5     |
//|  Este software e codigo sao parte integrante da propriedade       |
//|  intelectual de RicardoGarciaPT e da sua empresa MoreThanMoney    |
//|                                                                  |
//|  MTM PREMIUM SCANNER EA — a mesma regra do indicador e da         |
//|  estrategia do TradingView (docs/pine/mtm-premium-scanner*.pine), |
//|  a negociar no MetaTrader 5.                                      |
//|                                                                  |
//|  Ouro (XAUUSD), M15, sessoes de Asia, Londres e Nova Iorque:      |
//|   · direccao por voto de 5 no fecho da vela (abertura da sessao,  |
//|     ha 1 h, ha 4 h, EMA200, EMA9) — Maioria ou Unanime;           |
//|   · ordem limite no meio de uma zona de recuo (4 $ contra o preco,|
//|     zona de 5 $), valida 4 velas;                                 |
//|   · SL 5 $ para la da zona; TP1/TP2/TP3 a 5/10/15 $ da borda;     |
//|   · tres pernas 50/25/25: a primeira fecha no TP1 e o SL das      |
//|     outras passa para a entrada.                                  |
//|  Um grupo de cada vez, como na estrategia do TradingView.         |
//|                                                                  |
//|  As sessoes estao em UTC. O MetaTrader so conhece a hora do       |
//|  servidor da corretora; em conta real a diferenca le-se sozinha,  |
//|  no testador usa-se o parametro "Fuso do servidor".               |
//|                                                                  |
//|  Ferramenta educativa. Nao garante resultados.                    |
//+------------------------------------------------------------------+
#property copyright "RicardoGarciaPT / MoreThanMoney"
#property link      "https://www.morethanmoney.pt"
#property version   "1.00"

#include <Trade/Trade.mqh>

input group                "=== LICENCA ==="
input string   InpLicenseKey    = "";      // Chave (MTM-XXXX-XXXX-XXXX)
input string   InpLicenseUrl    = "https://www.morethanmoney.pt"; // Servidor (permitir em Opcoes > Consultores)

input group                "=== EXECUCAO ==="
input bool     InpComecarLigado = false;   // Comecar a negociar logo ao anexar (senao: botao INICIAR)
input long     InpMagic         = 770303;  // Numero magico (muda se correres duas copias)

input group                "=== SESSOES (UTC) ==="
input bool     InpFusoAuto      = true;    // Ler o fuso do servidor sozinho (conta real/demo)
input int      InpFusoServidor  = 2;       // Fuso do servidor em horas (testador, ou se o automatico estiver desligado)
input bool     InpAsia          = true;    // Asia
input int      InpAsiaIni       = 0;       //   inicio (hora UTC)
input int      InpAsiaFim       = 6;       //   fim (hora UTC)
input bool     InpLondres       = true;    // Londres
input int      InpLdnIni        = 7;       //   inicio (hora UTC)
input int      InpLdnFim        = 11;      //   fim (hora UTC)
input bool     InpNovaIorque    = true;    // Nova Iorque
input int      InpNyIni         = 13;      //   inicio (hora UTC)
input int      InpNyFim         = 16;      //   fim (hora UTC)

input group                "=== DIRECCAO E CADENCIA ==="
input bool     InpUnanime       = false;   // Unanime (5 de 5). Desligado = Maioria (replica)
input int      InpCurto         = 4;       // Momento curto (velas)
input int      InpLongo         = 16;      // Momento longo (velas)
input int      InpPausa         = 2;       // Pausa entre sinais (velas)
input int      InpMaxSessao     = 6;       // Maximo de sinais por sessao

input group                "=== ENTRADA, SL E SAIDAS (em $ do ouro; 1 $ = 10 pips) ==="
input double   InpRecuo         = 4.0;     // Meio da zona a X $ contra o preco
input double   InpLargura       = 5.0;     // Largura da zona $
input int      InpValidade      = 4;       // Ordem limite valida (velas)
input double   InpDistSL        = 5.0;     // SL: $ para la da zona
input double   InpTP1           = 5.0;     // TP1: $ da borda da zona
input int      InpPct1          = 50;      //   % que sai no TP1
input double   InpTP2           = 10.0;    // TP2: $ da borda da zona
input int      InpPct2          = 25;      //   % que sai no TP2
input double   InpTP3           = 15.0;    // TP3: $ da borda da zona
input int      InpPct3          = 25;      //   % que sai no TP3
input bool     InpUsarTP4       = false;   // Ultima perna sai no TP4 (a correr)
input double   InpTP4           = 20.0;    // TP4: $ da borda da zona
input bool     InpBE            = true;    // SL para a entrada depois do TP1

input group                "=== DIMENSIONAMENTO ==="
input bool     InpRiscoPorPct   = false;   // Dimensionar por % do saldo (senao: lote fixo)
input double   InpLote          = 0.04;    // Lote TOTAL do grupo (repartido pelas 3 pernas)
input double   InpRiscoPct      = 1.0;     // Risco do grupo, em % do saldo

input group                "=== PROTECOES ==="
input double   InpPerdaMaxDiaPct= 3.0;     // Perda maxima do dia, em % do saldo (0 = sem limite)
input int      InpMaxSpreadPts  = 0;       // Spread maximo em pontos (0 = sem limite)

input group                "=== ECRA ==="
input bool     InpPainel        = true;    // Mostrar o painel
input bool     InpDesenhar      = true;    // Desenhar zona, entrada, SL e TPs
input int      InpCaixaVelas    = 20;      // Largura do desenho (velas)

#include <MTMPremium/MTMPS_Painel.mqh>
#include <MTMPremium/MTMPS_Licenca.mqh>

CTrade trade;

//--- indicadores
int h_ema200 = INVALID_HANDLE;
int h_ema9   = INVALID_HANDLE;

//--- estado da sessao
double   g_abSess   = 0.0;
int      g_nSess    = 0;
long     g_barN     = 0;        // contador de velas fechadas desde o arranque
long     g_ultimo   = -1000;    // vela do ultimo sinal
string   g_sessAct  = "";
int      g_votoAct  = 0;
datetime g_ultBarra = 0;

//--- o grupo em curso
bool     gAtivo   = false;
bool     gCompra  = true;
bool     gTP1Ok   = false;
bool     gEntrou  = false;
double   gEntrada = 0, gSL = 0, gTP1 = 0, gTP2 = 0, gTP3 = 0, gTP4 = 0;
long     gDesdeN  = 0;

#define PSD "MTMPSD_"   // prefixo dos desenhos no grafico

//+------------------------------------------------------------------+
//| Relogio                                                          |
//+------------------------------------------------------------------+
int FusoSegundos()
  {
   if(InpFusoAuto && !MQLInfoInteger(MQL_TESTER))
     {
      long d=(long)(TimeTradeServer()-TimeGMT());
      return((int)(MathRound(d/3600.0)*3600));
     }
   return(InpFusoServidor*3600);
  }

bool NaJanela(const int h,const int ini,const int fim)
  {
   if(ini<=fim) return(h>=ini && h<fim);
   return(h>=ini || h<fim);          // janela que passa a meia-noite
  }

//--- nome da sessao a que pertence a vela que abriu em `t` (hora do servidor)
string SessaoDe(const datetime t)
  {
   MqlDateTime u; TimeToStruct(t-FusoSegundos(),u);
   if(InpLondres    && NaJanela(u.hour,InpLdnIni,InpLdnFim))   return("LONDRES");
   if(InpNovaIorque && NaJanela(u.hour,InpNyIni,InpNyFim))     return("NOVA IORQUE");
   if(InpAsia       && NaJanela(u.hour,InpAsiaIni,InpAsiaFim)) return("ASIA");
   return("");
  }

//+------------------------------------------------------------------+
//| Posicoes e ordens desta EA                                       |
//+------------------------------------------------------------------+
int ContarPosicoes()
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol && PositionGetInteger(POSITION_MAGIC)==InpMagic) n++;
     }
   return(n);
  }

int ContarPendentes()
  {
   int n=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i);
      if(tk==0) continue;
      if(OrderGetString(ORDER_SYMBOL)==_Symbol && OrderGetInteger(ORDER_MAGIC)==InpMagic) n++;
     }
   return(n);
  }

void ApagarPendentes()
  {
   for(int i=OrdersTotal()-1;i>=0;i--)
     {
      ulong tk=OrderGetTicket(i);
      if(tk==0) continue;
      if(OrderGetString(ORDER_SYMBOL)==_Symbol && OrderGetInteger(ORDER_MAGIC)==InpMagic)
         trade.OrderDelete(tk);
     }
  }

void FecharTudo(const string porque)
  {
   ApagarPendentes();
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol && PositionGetInteger(POSITION_MAGIC)==InpMagic)
         trade.PositionClose(tk);
     }
   gAtivo=false;
   Print("MTM Premium Scanner: tudo fechado (",porque,")");
  }

//--- resultado de hoje desta EA: fechado + flutuante
double ResultadoDoDia()
  {
   MqlDateTime d; TimeToStruct(TimeCurrent(),d);
   d.hour=0; d.min=0; d.sec=0;
   datetime desde=StructToTime(d);
   double r=0;
   if(HistorySelect(desde,TimeCurrent()+60))
     {
      for(int i=HistoryDealsTotal()-1;i>=0;i--)
        {
         ulong tk=HistoryDealGetTicket(i);
         if(tk==0) continue;
         if(HistoryDealGetString(tk,DEAL_SYMBOL)!=_Symbol) continue;
         if(HistoryDealGetInteger(tk,DEAL_MAGIC)!=InpMagic) continue;
         r+=HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
        }
     }
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol && PositionGetInteger(POSITION_MAGIC)==InpMagic)
         r+=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
     }
   return(r);
  }

//+------------------------------------------------------------------+
//| Lotes                                                            |
//+------------------------------------------------------------------+
double NormalizarLote(double v)
  {
   double degrau=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double maximo=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   if(degrau<=0) degrau=0.01;
   v=MathFloor(v/degrau+1e-9)*degrau;
   if(maximo>0 && v>maximo) v=maximo;
   return(NormalizeDouble(v,2));
  }

double LoteTotal(const double entrada,const double sl)
  {
   if(!g_loteModoPct) return(g_lote);
   double tickVal=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
   double tickSz =SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   double dist   =MathAbs(entrada-sl);
   if(tickVal<=0 || tickSz<=0 || dist<=0) return(g_lote);
   double perdaPorLote=dist/tickSz*tickVal;
   return(AccountInfoDouble(ACCOUNT_BALANCE)*g_riscoPct/100.0/perdaPorLote);
  }

//+------------------------------------------------------------------+
//| Desenho no grafico: as mesmas cores e etiquetas do TradingView   |
//+------------------------------------------------------------------+
#define C_ENTRY C'210,166,60'
#define C_TP    C'18,184,134'
#define C_SL    C'214,64,31'

string Fmt(const double x) { return(DoubleToString(x,_Digits)); }

void Caixa(const string n,const datetime t1,const double p1,const datetime t2,const double p2,const color c,const bool borda)
  {
   ObjectDelete(0,n);
   ObjectCreate(0,n,OBJ_RECTANGLE,0,t1,p1,t2,p2);
   ObjectSetInteger(0,n,OBJPROP_COLOR,c);
   ObjectSetInteger(0,n,OBJPROP_FILL,true);
   ObjectSetInteger(0,n,OBJPROP_BACK,true);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
   if(borda) ObjectSetInteger(0,n,OBJPROP_WIDTH,1);
  }

void Nivel(const string n,const datetime t1,const datetime t2,const double y,const string txt,const color c)
  {
   ObjectDelete(0,n);
   ObjectCreate(0,n,OBJ_TREND,0,t1,y,t2,y);
   ObjectSetInteger(0,n,OBJPROP_COLOR,c);
   ObjectSetInteger(0,n,OBJPROP_WIDTH,1);
   ObjectSetInteger(0,n,OBJPROP_RAY_RIGHT,false);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
   string e=n+"_t";
   ObjectDelete(0,e);
   ObjectCreate(0,e,OBJ_TEXT,0,t2,y);
   ObjectSetString (0,e,OBJPROP_TEXT,"  "+txt);
   ObjectSetInteger(0,e,OBJPROP_COLOR,c);
   ObjectSetInteger(0,e,OBJPROP_FONTSIZE,8);
   ObjectSetInteger(0,e,OBJPROP_ANCHOR,ANCHOR_LEFT);
   ObjectSetInteger(0,e,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,e,OBJPROP_HIDDEN,true);
  }

void Seta(const datetime t,const bool compra,const double h,const double l)
  {
   string n=PSD"s_"+IntegerToString((long)t);
   ObjectDelete(0,n);
   ObjectCreate(0,n,OBJ_TEXT,0,t,compra? l : h);
   ObjectSetString (0,n,OBJPROP_TEXT,compra? "▲ BUY" : "▼ SELL");
   ObjectSetInteger(0,n,OBJPROP_COLOR,compra? C_TP : C_SL);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,8);
   ObjectSetInteger(0,n,OBJPROP_ANCHOR,compra? ANCHOR_UPPER : ANCHOR_LOWER);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
  }

void DesenharGrupo(const datetime t1)
  {
   //--- como no TradingView: so o ultimo grupo fica desenhado
   ObjectsDeleteAll(0,PSD"g_");
   datetime t2=t1+(datetime)(InpCaixaVelas*PeriodSeconds());
   double zLo=gEntrada-InpLargura/2.0, zHi=gEntrada+InpLargura/2.0;
   double tpUlt=InpUsarTP4? gTP4 : gTP3;

   Caixa(PSD"g_alvo",t1,gEntrada,t2,tpUlt,C'16,48,40',false);
   Caixa(PSD"g_risco",t1,gEntrada,t2,gSL,C'56,24,18',false);
   Caixa(PSD"g_zona",t1,zHi,t2,zLo,C'70,58,26',true);

   Nivel(PSD"g_e",t1,t2,gEntrada,(gCompra?"COMPRA":"VENDA")+" · Zona: "+Fmt(zLo)+" – "+Fmt(zHi)+" · Entrada: "+Fmt(gEntrada),C_ENTRY);
   Nivel(PSD"g_1",t1,t2,gTP1,"TP1: "+Fmt(gTP1)+(InpPct1>0? " · "+IntegerToString(InpPct1)+"%" : "")+(InpBE? " → SL na entrada" : ""),C_TP);
   Nivel(PSD"g_2",t1,t2,gTP2,"TP2: "+Fmt(gTP2)+" · "+IntegerToString(InpPct2)+"%",C_TP);
   if(InpUsarTP4) Nivel(PSD"g_4",t1,t2,gTP4,"TP4: "+Fmt(gTP4)+" · "+IntegerToString(InpPct3)+"%",C_TP);
   else           Nivel(PSD"g_3",t1,t2,gTP3,"TP3: "+Fmt(gTP3)+" · "+IntegerToString(InpPct3)+"%",C_TP);
   Nivel(PSD"g_sl",t1,t2,gSL,"SL: "+Fmt(gSL),C_SL);
   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
//| Abrir o grupo: tres pernas, mesma entrada e mesmo SL             |
//+------------------------------------------------------------------+
bool Perna(const int idx,const double vol,const double tp)
  {
   if(vol<=0) return(true);
   string com="MTM PS "+IntegerToString(idx);
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double nivelMin=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
   double e=NormalizeDouble(gEntrada,_Digits);
   double sl=NormalizeDouble(gSL,_Digits);
   double t =NormalizeDouble(tp,_Digits);
   bool ok;
   //--- o preco ja passou a entrada (ou esta colado a ela): entra a mercado,
   //    que e o que a ordem limite do TradingView faria na vela seguinte
   if(gCompra)
     {
      if(e < ask-nivelMin) ok=trade.BuyLimit(vol,e,_Symbol,sl,t,ORDER_TIME_GTC,0,com);
      else                 ok=trade.Buy(vol,_Symbol,0,sl,t,com);
     }
   else
     {
      if(e > bid+nivelMin) ok=trade.SellLimit(vol,e,_Symbol,sl,t,ORDER_TIME_GTC,0,com);
      else                 ok=trade.Sell(vol,_Symbol,0,sl,t,com);
     }
   if(!ok) PrintFormat("MTM Premium Scanner: perna %d recusada (%d %s)",idx,trade.ResultRetcode(),trade.ResultRetcodeDescription());
   return(ok);
  }

void AbrirGrupo(const bool compra,const double fecho,const datetime tBarra)
  {
   double sg=compra? 1.0 : -1.0;
   double meio=fecho-sg*InpRecuo;
   double zPerto=meio+sg*InpLargura/2.0;
   double zLonge=meio-sg*InpLargura/2.0;

   gCompra=compra;
   gEntrada=meio;
   gSL =zLonge-sg*InpDistSL;
   gTP1=zPerto+sg*InpTP1;
   gTP2=zPerto+sg*InpTP2;
   gTP3=zPerto+sg*InpTP3;
   gTP4=zPerto+sg*InpTP4;
   gTP1Ok=false; gEntrou=false;
   gDesdeN=g_barN;
   gAtivo=true;

   if(InpDesenhar) DesenharGrupo(tBarra);

   double total=LoteTotal(gEntrada,gSL);
   double soma=MathMax(InpPct1+InpPct2+InpPct3,1);
   double minimo=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double v1=InpPct1>0? MathMax(NormalizarLote(total*InpPct1/soma),minimo) : 0;
   double v2=InpPct2>0? MathMax(NormalizarLote(total*InpPct2/soma),minimo) : 0;
   double v3=InpPct3>0? MathMax(NormalizarLote(total*InpPct3/soma),minimo) : 0;
   if((InpPct1>0 && total*InpPct1/soma<minimo) || (InpPct2>0 && total*InpPct2/soma<minimo) || (InpPct3>0 && total*InpPct3/soma<minimo))
      PrintFormat("MTM Premium Scanner: lote total %.2f nao chega para repartir %d/%d/%d — cada perna sobe ao minimo %.2f",
                  total,InpPct1,InpPct2,InpPct3,minimo);

   PrintFormat("MTM Premium Scanner: %s · zona %s–%s · entrada %s · SL %s · TP1 %s · TP2 %s · TP3 %s · lotes %.2f/%.2f/%.2f",
               compra?"COMPRA":"VENDA",Fmt(MathMin(zPerto,zLonge)),Fmt(MathMax(zPerto,zLonge)),Fmt(gEntrada),Fmt(gSL),
               Fmt(gTP1),Fmt(gTP2),Fmt(InpUsarTP4?gTP4:gTP3),v1,v2,v3);

   Perna(1,v1,gTP1);
   Perna(2,v2,gTP2);
   Perna(3,v3,InpUsarTP4? gTP4 : gTP3);
  }

//+------------------------------------------------------------------+
//| Depois do TP1: SL das pernas que restam para a entrada           |
//+------------------------------------------------------------------+
void GerirBE()
  {
   if(!gAtivo || !InpBE) return;
   double bid=SymbolInfoDouble(_Symbol,SYMBOL_BID);
   double ask=SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   if(!gTP1Ok)
     {
      if(ContarPosicoes()==0) return;
      gTP1Ok = gCompra? (bid>=gTP1) : (ask<=gTP1);
      if(!gTP1Ok) return;
      Print("MTM Premium Scanner: TP1 tocado — SL do resto para a entrada");
     }
   double nivelMin=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      double abre=PositionGetDouble(POSITION_PRICE_OPEN);
      double sl  =PositionGetDouble(POSITION_SL);
      double tp  =PositionGetDouble(POSITION_TP);
      bool compra=PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY;
      double alvo=NormalizeDouble(abre,_Digits);
      bool jaEsta = compra? (sl>=alvo-_Point/2) : (sl>0 && sl<=alvo+_Point/2);
      if(jaEsta) continue;
      //--- a corretora exige distancia minima ao preco; se ainda nao da, tenta no tick seguinte
      if(compra && bid-alvo<nivelMin) continue;
      if(!compra && alvo-ask<nivelMin) continue;
      trade.PositionModify(tk,alvo,tp);
     }
  }

//+------------------------------------------------------------------+
//| Uma vela fechou: ler a sessao, votar, talvez abrir um grupo      |
//+------------------------------------------------------------------+
void NovaVela()
  {
   g_barN++;
   datetime t1=iTime(_Symbol,_Period,1);
   datetime t2=iTime(_Symbol,_Period,2);
   string s1=SessaoDe(t1), s2=SessaoDe(t2);
   g_sessAct=SessaoDe(iTime(_Symbol,_Period,0));

   if(s1!="" && s1!=s2)
     {
      g_abSess=iOpen(_Symbol,_Period,1);
      g_nSess=0;
     }

   //--- o grupo: ordem limite que expirou, ou grupo que terminou
   int nPos=ContarPosicoes(), nPend=ContarPendentes();
   if(gAtivo)
     {
      if(nPos>0) gEntrou=true;
      if(nPos==0 && !gEntrou && g_barN-gDesdeN>=InpValidade)
        {
         ApagarPendentes();
         gAtivo=false;
         Print("MTM Premium Scanner: ordem limite expirou sem entrar");
        }
      else if(nPos==0 && gEntrou)
        {
         ApagarPendentes();
         gAtivo=false;
        }
     }
   else if(nPos==0 && nPend>0)
      ApagarPendentes();   // restos de um arranque anterior

   if(s1=="" || g_abSess<=0) { g_votoAct=0; return; }

   double fecho=iClose(_Symbol,_Period,1);
   double e200[1], e9[1];
   if(CopyBuffer(h_ema200,0,1,1,e200)<1 || CopyBuffer(h_ema9,0,1,1,e9)<1) return;
   double cCurto=iClose(_Symbol,_Period,1+InpCurto);
   double cLongo=iClose(_Symbol,_Period,1+InpLongo);
   if(cCurto<=0 || cLongo<=0) return;

   int voto=(fecho>g_abSess?1:-1)+(fecho>cCurto?1:-1)+(fecho>cLongo?1:-1)+(fecho>e200[0]?1:-1)+(fecho>e9[0]?1:-1);
   g_votoAct=voto;
   bool compra=voto>0;
   bool votoOk=!g_unanime || MathAbs(voto)==5;

   bool sinal=votoOk && g_nSess<InpMaxSessao && g_barN-g_ultimo>=InpPausa;
   if(!sinal) return;
   g_nSess++;
   g_ultimo=g_barN;

   if(InpDesenhar) Seta(t1,compra,iHigh(_Symbol,_Period,1),iLow(_Symbol,_Period,1));

   //--- daqui para baixo: so negoceia quem pode
   if(!g_psLigado)            { Print("MTM Premium Scanner: sinal ",(compra?"BUY":"SELL")," — EA parada, so desenhado"); return; }
   if(!g_licOk)               { Print("MTM Premium Scanner: sinal ignorado — ",g_licMsg); return; }
   if(gAtivo || nPos>0)       return;   // um grupo de cada vez
   if(InpMaxSpreadPts>0 && SymbolInfoInteger(_Symbol,SYMBOL_SPREAD)>InpMaxSpreadPts)
     { PrintFormat("MTM Premium Scanner: spread %d pts acima do maximo %d — sinal ignorado",(int)SymbolInfoInteger(_Symbol,SYMBOL_SPREAD),InpMaxSpreadPts); return; }
   if(InpPerdaMaxDiaPct>0 && ResultadoDoDia() <= -AccountInfoDouble(ACCOUNT_BALANCE)*InpPerdaMaxDiaPct/100.0)
     { Print("MTM Premium Scanner: perda maxima do dia atingida — sem novos grupos ate amanha"); return; }

   AbrirGrupo(compra,fecho,t1);
  }

//+------------------------------------------------------------------+
void PainelRefrescar()
  {
   if(!InpPainel) return;
   string grupo="";
   if(gAtivo)
     {
      int nPos=ContarPosicoes();
      grupo=StringFormat("%s @ %s · %s",gCompra?"COMPRA":"VENDA",Fmt(gEntrada),
                         nPos==0? "a espera da zona" : (gTP1Ok? StringFormat("%d perna(s), SL na entrada",nPos) : StringFormat("%d perna(s) abertas",nPos)));
     }
   string lic = g_licOk? ("licenca valida"+(g_licPlano!=""? " · "+g_licPlano : "")) : g_licMsg;
   string rod = StringFormat("fuso do servidor UTC%+d · spread %d pts",FusoSegundos()/3600,(int)SymbolInfoInteger(_Symbol,SYMBOL_SPREAD));
   PsPainelRefresh(g_sessAct,g_votoAct,g_nSess,InpMaxSessao,ResultadoDoDia(),grupo,lic,g_licOk,rod);
   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(_Symbol);

   if(StringFind(_Symbol,"XAU")<0 && StringFind(_Symbol,"GOLD")<0)
      Print("MTM Premium Scanner: AVISO — a regra foi feita para o ouro (XAUUSD). Neste simbolo as distancias em $ nao fazem sentido.");
   if(_Period!=PERIOD_M15)
      Print("MTM Premium Scanner: AVISO — a regra foi medida em M15. Neste tempo grafico o voto e a validade mudam de significado.");

   h_ema200=iMA(_Symbol,_Period,200,0,MODE_EMA,PRICE_CLOSE);
   h_ema9  =iMA(_Symbol,_Period,9,0,MODE_EMA,PRICE_CLOSE);
   if(h_ema200==INVALID_HANDLE || h_ema9==INVALID_HANDLE) return(INIT_FAILED);

   g_psLigado   =InpComecarLigado;
   g_unanime    =InpUnanime;
   g_loteModoPct=InpRiscoPorPct;
   g_lote       =InpLote;
   g_riscoPct   =InpRiscoPct;

   LicInit(InpLicenseKey,InpLicenseUrl);

   PrintFormat("MTM Premium Scanner: %s %s · fuso do servidor UTC%+d · sessoes Asia %02d–%02d, Londres %02d–%02d, NY %02d–%02d (UTC)",
               _Symbol,EnumToString(_Period),FusoSegundos()/3600,InpAsiaIni,InpAsiaFim,InpLdnIni,InpLdnFim,InpNyIni,InpNyFim);

   //--- a abertura da sessao em curso, para nao perder a primeira sessao
   string sAgora=SessaoDe(iTime(_Symbol,_Period,1));
   if(sAgora!="")
      for(int i=1;i<200;i++)
        {
         if(SessaoDe(iTime(_Symbol,_Period,i+1))!=sAgora) { g_abSess=iOpen(_Symbol,_Period,i); break; }
        }
   g_ultBarra=iTime(_Symbol,_Period,0);

   if(InpPainel)
     {
      ChartSetInteger(0,CHART_EVENT_MOUSE_MOVE,true);
      PsPainelBuild();
      PainelRefrescar();
     }
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   if(h_ema200!=INVALID_HANDLE) IndicatorRelease(h_ema200);
   if(h_ema9!=INVALID_HANDLE)   IndicatorRelease(h_ema9);
   PsPainelDestroy();
   LicDeinit();
   //--- os desenhos do ultimo grupo ficam quando se muda de tempo grafico; saem ao remover a EA
   if(reason==REASON_REMOVE) ObjectsDeleteAll(0,PSD);
  }

void OnTick()
  {
   LicTick(InpLicenseKey,InpLicenseUrl);

   datetime t0=iTime(_Symbol,_Period,0);
   if(t0!=g_ultBarra)
     {
      g_ultBarra=t0;
      NovaVela();
     }
   GerirBE();

   static datetime ultPainel=0;
   if(InpPainel && TimeCurrent()-ultPainel>=1) { ultPainel=TimeCurrent(); PainelRefrescar(); }
  }

void OnChartEvent(const int id,const long &lparam,const double &dparam,const string &sparam)
  {
   if(id==CHARTEVENT_OBJECT_CLICK)
     {
      if(sparam==PSP"go")
        {
         g_psLigado=!g_psLigado;
         Print("MTM Premium Scanner: ",(g_psLigado?"INICIADA":"PARADA")," no painel");
         //--- parar nao fecha o que esta aberto: o grupo tem SL e TP no servidor
         if(!g_psLigado) ApagarPendentes();
        }
      else if(sparam==PSP"kil") FecharTudo("botao FECHAR TUDO");
      else if(sparam==PSP"mod")
        {
         g_unanime=!g_unanime;
         Print("MTM Premium Scanner: direccao -> ",(g_unanime?"UNANIME (5 de 5)":"MAIORIA"));
        }
      else if(sparam==PSP"lot")
        {
         g_loteModoPct=!g_loteModoPct;
         PrintFormat("MTM Premium Scanner: dimensionamento -> %s (vale para o grupo seguinte)",
                     g_loteModoPct? StringFormat("risco %.1f%% do saldo",g_riscoPct) : StringFormat("lote total %.2f",g_lote));
        }
      else if(sparam==PSP"lm" || sparam==PSP"lp") PsPainelLote(sparam==PSP"lp"? +1 : -1);
      else return;
      ObjectSetInteger(0,sparam,OBJPROP_STATE,false);
      PainelRefrescar();
      return;
     }

   if(id==CHARTEVENT_MOUSE_MOVE)
     {
      static bool agarrado=false;
      static int  px=0,py=0;
      int  x=(int)lparam, y=(int)dparam;
      bool botao=((int)StringToInteger(sparam)&1)==1;
      bool naBarra=(x>=g_ppX && x<=g_ppX+240 && y>=g_ppY && y<=g_ppY+26);
      if(botao && !agarrado && naBarra){ agarrado=true; px=x; py=y; ChartSetInteger(0,CHART_MOUSE_SCROLL,false); }
      else if(!botao && agarrado){ agarrado=false; ChartSetInteger(0,CHART_MOUSE_SCROLL,true); }
      else if(agarrado){ PsPainelShift(x-px,y-py); px=x; py=y; }
     }
  }
//+------------------------------------------------------------------+
