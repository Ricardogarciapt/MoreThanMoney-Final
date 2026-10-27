//+------------------------------------------------------------------+
//|                                          MTMPS_Painel.mqh        |
//|  Propriedade intelectual de RicardoGarciaPT / MoreThanMoney      |
//|                                                                  |
//|  Painel do MTM Premium Scanner EA: iniciar/parar, fechar tudo,   |
//|  lote, modo da direccao e o estado da sessao.                    |
//|                                                                  |
//|  Mesma regra da Sensei Scalp: `g_psLigado` e a UNICA verdade     |
//|  sobre se a EA pode abrir ordens. O input so decide o estado     |
//|  inicial; a partir dai manda o botao.                            |
//+------------------------------------------------------------------+
#ifndef MTMPS_PAINEL_MQH
#define MTMPS_PAINEL_MQH

#define PSP "MTMPSP_"

bool   g_psLigado    = false;
bool   g_unanime     = false;   // false = Maioria (replica), true = Unanime (5 de 5)
bool   g_loteModoPct = false;   // false = lote total fixo, true = % do saldo em risco
double g_lote        = 0.04;    // lote TOTAL do grupo (repartido 50/25/25)
double g_riscoPct    = 1.0;

int g_ppX = 14, g_ppY = 34;

//--- cores da casa: ouro sobre carvao
#define PS_OURO   C'210,166,60'
#define PS_OURO2  C'233,196,106'
#define PS_FUNDO  C'14,14,18'
#define PS_CINZA  C'148,163,184'
#define PS_VERDE  C'18,184,134'
#define PS_VERM   C'214,64,31'

void PpRect(const string n,const int x,const int y,const int w,const int h,const color bg,const color borda)
  {
   if(ObjectFind(0,n)<0)
     {
      ObjectCreate(0,n,OBJ_RECTANGLE_LABEL,0,0,0);
      ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,n,OBJPROP_BACK,false);
      ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
      ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
     }
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);  ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);      ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);   ObjectSetInteger(0,n,OBJPROP_COLOR,borda);
  }

void PpText(const string n,const int x,const int y,const string t,const color c,const int size=8,const string fonte="Segoe UI")
  {
   if(ObjectFind(0,n)<0)
     {
      ObjectCreate(0,n,OBJ_LABEL,0,0,0);
      ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
      ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
     }
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x); ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_COLOR,c);     ObjectSetInteger(0,n,OBJPROP_FONTSIZE,size);
   ObjectSetString (0,n,OBJPROP_FONT,fonte);  ObjectSetString (0,n,OBJPROP_TEXT,t);
  }

void PpBtn(const string n,const int x,const int y,const int w,const int h,const string t,const color bg,const color fg,const int size=9)
  {
   if(ObjectFind(0,n)<0)
     {
      ObjectCreate(0,n,OBJ_BUTTON,0,0,0);
      ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
      ObjectSetInteger(0,n,OBJPROP_BORDER_COLOR,clrDimGray);
      ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
      ObjectSetInteger(0,n,OBJPROP_HIDDEN,true);
      ObjectSetString (0,n,OBJPROP_FONT,"Segoe UI Semibold");
     }
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x); ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);     ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);  ObjectSetInteger(0,n,OBJPROP_COLOR,fg);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,size);
   ObjectSetInteger(0,n,OBJPROP_STATE,false);
   ObjectSetString (0,n,OBJPROP_TEXT,t);
  }

void PsPainelBuild()
  {
   int X=g_ppX, Y=g_ppY, W=240;

   PpRect(PSP"bg",X,Y,W,312,PS_FUNDO,PS_OURO);
   PpRect(PSP"hd",X,Y,W,26,PS_OURO,PS_OURO);
   PpText(PSP"ti",X+10,Y+6,"MTM PREMIUM SCANNER  ·  arrasta aqui",C'20,20,20',8,"Segoe UI Semibold");

   PpBtn(PSP"go" ,X+10,Y+34,W-20,30,"INICIAR",C'70,75,90',clrWhite,10);
   PpBtn(PSP"kil",X+10,Y+70,W-20,22,"FECHAR TUDO",C'150,50,50',clrWhite,8);
   PpBtn(PSP"mod",X+10,Y+96,W-20,22,"DIRECCAO: MAIORIA",C'70,75,90',clrWhite,8);

   PpBtn(PSP"lot",X+10 ,Y+122,W-74,22,"LOTE 0.04 total",C'52,58,74',clrWhite,8);
   PpBtn(PSP"lm" ,X+W-60,Y+122,24,22,"-",C'70,75,90',clrWhite,9);
   PpBtn(PSP"lp" ,X+W-32,Y+122,22,22,"+",C'70,75,90',clrWhite,9);

   PpText(PSP"l1",X+10,Y+156,"SESSAO",PS_CINZA,7);
   PpText(PSP"v1",X+10,Y+168,"—",clrWhite,9,"Segoe UI Semibold");

   PpText(PSP"l2",X+128,Y+156,"VOTO (5)",PS_CINZA,7);
   PpText(PSP"v2",X+128,Y+168,"—",clrWhite,9,"Segoe UI Semibold");

   PpText(PSP"l3",X+10,Y+190,"SINAIS NA SESSAO",PS_CINZA,7);
   PpText(PSP"v3",X+10,Y+202,"—",clrWhite,9,"Segoe UI Semibold");

   PpText(PSP"l4",X+128,Y+190,"RESULTADO DO DIA",PS_CINZA,7);
   PpText(PSP"v4",X+128,Y+202,"—",clrWhite,9,"Segoe UI Semibold");

   PpText(PSP"l5",X+10,Y+224,"GRUPO",PS_CINZA,7);
   PpText(PSP"v5",X+10,Y+236,"—",C'200,205,215',8);

   PpText(PSP"v6",X+10,Y+262,"—",C'120,130,145',7);   // licenca
   PpText(PSP"v7",X+10,Y+280,"—",C'120,130,145',7);   // relogio / spread
  }

void PsPainelDestroy() { ObjectsDeleteAll(0,PSP); }

void PsPainelRefresh(const string sessao,const int voto,const int sinaisSessao,const int maxSessao,
                     const double resultadoDia,const string grupo,const string licenca,const bool licOk,
                     const string rodape)
  {
   if(ObjectFind(0,PSP"bg")<0) return;

   ObjectSetString (0,PSP"go",OBJPROP_TEXT,g_psLigado? "A TRABALHAR  ·  parar" : "INICIAR");
   ObjectSetInteger(0,PSP"go",OBJPROP_BGCOLOR,g_psLigado? C'40,160,90' : C'70,75,90');

   ObjectSetString (0,PSP"mod",OBJPROP_TEXT,g_unanime? "DIRECCAO: UNANIME (5 de 5)" : "DIRECCAO: MAIORIA");
   ObjectSetInteger(0,PSP"mod",OBJPROP_BGCOLOR,g_unanime? C'120,95,30' : C'70,75,90');

   ObjectSetString(0,PSP"lot",OBJPROP_TEXT,
                   g_loteModoPct ? StringFormat("RISCO %.1f%% do saldo",g_riscoPct)
                                 : StringFormat("LOTE %.2f total",g_lote));

   ObjectSetString (0,PSP"v1",OBJPROP_TEXT,sessao==""? "fora de sessao" : sessao);
   ObjectSetInteger(0,PSP"v1",OBJPROP_COLOR,sessao==""? PS_CINZA : PS_OURO2);

   string vt = (voto>0? "COMPRA " : voto<0? "VENDA " : "") + StringFormat("%+d",voto);
   ObjectSetString (0,PSP"v2",OBJPROP_TEXT,vt);
   ObjectSetInteger(0,PSP"v2",OBJPROP_COLOR,voto>0? PS_VERDE : voto<0? PS_VERM : clrWhite);

   ObjectSetString(0,PSP"v3",OBJPROP_TEXT,StringFormat("%d / %d",sinaisSessao,maxSessao));

   ObjectSetString (0,PSP"v4",OBJPROP_TEXT,StringFormat("%+.2f",resultadoDia));
   ObjectSetInteger(0,PSP"v4",OBJPROP_COLOR,resultadoDia>=0? PS_VERDE : PS_VERM);

   ObjectSetString(0,PSP"v5",OBJPROP_TEXT,grupo==""? "sem grupo aberto" : grupo);

   ObjectSetString (0,PSP"v6",OBJPROP_TEXT,licenca);
   ObjectSetInteger(0,PSP"v6",OBJPROP_COLOR,licOk? C'90,150,110' : PS_VERM);

   ObjectSetString(0,PSP"v7",OBJPROP_TEXT,rodape);
  }

void PsPainelShift(const int dx,const int dy)
  {
   g_ppX+=dx; g_ppY+=dy;
   if(g_ppX<0) g_ppX=0;
   if(g_ppY<0) g_ppY=0;
   PsPainelBuild();
  }

//--- lote: degraus de 0,01 (lote) ou 0,1% (risco), com tectos
void PsPainelLote(const int passo)
  {
   if(g_loteModoPct)
     {
      g_riscoPct+=passo*0.1;
      if(g_riscoPct<0.1)  g_riscoPct=0.1;
      if(g_riscoPct>5.0)  g_riscoPct=5.0;
     }
   else
     {
      double degrau=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
      if(degrau<=0) degrau=0.01;
      g_lote+=passo*degrau;
      if(g_lote<degrau) g_lote=degrau;
      if(g_lote>10.0)   g_lote=10.0;
      g_lote=NormalizeDouble(g_lote,2);
     }
  }

#endif // MTMPS_PAINEL_MQH
