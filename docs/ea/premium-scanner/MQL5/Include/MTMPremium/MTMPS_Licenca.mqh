//+------------------------------------------------------------------+
//|                                            MTMPS_Licenca.mqh     |
//|  Propriedade intelectual de RicardoGarciaPT / MoreThanMoney      |
//|                                                                  |
//|  Valida a licenca do EA contra morethanmoney.pt.                 |
//|                                                                  |
//|  A prova nao e um segredo dentro do ficheiro: o EA corre na      |
//|  maquina do cliente, onde tudo se le com um editor de texto.     |
//|  A prova e o par CHAVE + NUMERO DA CONTA - o numero e a          |
//|  corretora que o atribui, e nao ha como o inventar.              |
//+------------------------------------------------------------------+
//  Copia da licenca da Sensei Scalp, com nomes proprios (MTMPS_) e o seu
//  `produto`: uma chave de outra EA nao abre esta.
#ifndef MTMPS_LICENCA_MQH
#define MTMPS_LICENCA_MQH

//--- estado, lido pelo resto do EA
bool     g_licOk       = false;
string   g_licMsg      = "Licenca por validar";
string   g_licCodigo   = "";
string   g_licPlano    = "";
datetime g_licUltima   = 0;   // ultima validacao BEM sucedida
datetime g_licTentativa= 0;   // ultima tentativa, boa ou ma

//--- de quanto em quanto tempo se volta a perguntar ao servidor
#define MTMPS_LIC_INTERVALO   (6*3600)
//--- quanto tempo o EA aguenta sem conseguir falar com o servidor.
//    Uma VPS que perde a rede meia hora nao pode fechar a torneira a quem
//    pagou; tres dias chegam para alguem reparar e ninguem abusar.
#define MTMPS_LIC_TOLERANCIA  (72*3600)

//--- nome da variavel global onde fica a ultima validacao boa (sobrevive
//    a reinicios do terminal, que e o caso normal numa VPS)
string LicGvName(const string chave)
  {
   return("MTMPSLIC_"+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"_"+
          IntegerToString(StringLen(chave)));
  }

//--- le um campo de texto simples do JSON da resposta
string LicJson(const string js,const string campo)
  {
   string alvo="\""+campo+"\"";
   int p=StringFind(js,alvo);
   if(p<0) return("");
   p=StringFind(js,":",p+StringLen(alvo));
   if(p<0) return("");
   int a=StringFind(js,"\"",p);
   if(a<0) return("");
   int b=StringFind(js,"\"",a+1);
   if(b<0) return("");
   return(StringSubstr(js,a+1,b-a-1));
  }

bool LicJsonBool(const string js,const string campo)
  {
   string alvo="\""+campo+"\"";
   int p=StringFind(js,alvo);
   if(p<0) return(false);
   int t=StringFind(js,"true",p);
   int f=StringFind(js,"false",p);
   if(t<0) return(false);
   if(f>=0 && f<t) return(false);
   //--- so conta se o "true" vier logo a seguir aos dois pontos deste campo
   return(t-p<20);
  }

string LicUrlEncode(const string s)
  {
   string out="";
   for(int i=0;i<StringLen(s);i++)
     {
      ushort c=StringGetCharacter(s,i);
      if((c>='A' && c<='Z')||(c>='a' && c<='z')||(c>='0' && c<='9')||c=='-'||c=='_'||c=='.')
         out+=ShortToString(c);
      else
         out+=StringFormat("%%%02X",c);
     }
   return(out);
  }

//+------------------------------------------------------------------+
//| Pergunta ao servidor. Devolve true se a licenca serve para esta   |
//| conta. Em caso de falha de rede devolve o que estiver em cache,   |
//| dentro da tolerancia.                                             |
//+------------------------------------------------------------------+
bool LicValidar(const string chave,const string baseUrl,const bool silencioso=false)
  {
   g_licTentativa=TimeCurrent();

   if(StringLen(chave)<8)
     {
      g_licOk=false; g_licCodigo="sem_chave";
      g_licMsg="Falta a chave de licenca. Poe-na no campo \"Licenca\" do EA.";
      return(false);
     }

   long   conta   = AccountInfoInteger(ACCOUNT_LOGIN);
   string corretora= AccountInfoString(ACCOUNT_COMPANY);
   string servidor = AccountInfoString(ACCOUNT_SERVER);

   string url=baseUrl+"/api/licencas/validar"
              +"?chave="+LicUrlEncode(chave)
              +"&conta="+IntegerToString(conta)
              +"&corretora="+LicUrlEncode(corretora)
              +"&servidor="+LicUrlEncode(servidor)
              +"&terminal="+LicUrlEncode(TerminalInfoString(TERMINAL_NAME))
              //--- cada EA e um produto: o servidor so aceita chaves deste
              +"&produto=premium_scanner_ea";

   char post[],result[];
   string headers="";
   ResetLastError();
   int code=WebRequest("GET",url,NULL,NULL,8000,post,0,result,headers);

   if(code!=200)
     {
      int err=GetLastError();
      //--- 4014/4060: o endereco nao esta na lista de permitidos. E o erro
      //    numero um do suporte, por isso diz-se exactamente o que fazer.
      if(err==4014 || err==4060)
        {
         g_licOk=false; g_licCodigo="webrequest";
         g_licMsg="Permite o endereco no MetaTrader: Ferramentas > Opcoes > "
                  "Consultores > \"Permitir WebRequest para os seguintes URLs\" > "+baseUrl;
         if(!silencioso) Print("MTM Premium Scanner LICENCA: ",g_licMsg);
         return(false);
        }

      //--- rede em baixo: vale a ultima validacao boa, dentro da tolerancia
      double cache=GlobalVariableGet(LicGvName(chave));
      if(cache>0 && (TimeCurrent()-(datetime)cache)<MTMPS_LIC_TOLERANCIA)
        {
         g_licOk=true; g_licCodigo="cache";
         g_licUltima=(datetime)cache;
         g_licMsg="Sem ligacao ao servidor - a usar a ultima validacao ("+
                  TimeToString(g_licUltima,TIME_DATE|TIME_MINUTES)+").";
         if(!silencioso) Print("MTM Premium Scanner LICENCA: ",g_licMsg);
         return(true);
        }

      g_licOk=false; g_licCodigo="rede";
      g_licMsg=StringFormat("Nao consegui validar a licenca (HTTP %d, erro %d). Verifica a ligacao.",code,err);
      if(!silencioso) Print("MTM Premium Scanner LICENCA: ",g_licMsg);
      return(false);
     }

   string js=CharArrayToString(result,0,WHOLE_ARRAY,CP_UTF8);
   bool   ok=LicJsonBool(js,"ok");
   g_licCodigo=LicJson(js,"codigo");
   string msg=LicJson(js,"mensagem");
   g_licPlano =LicJson(js,"plano");
   if(msg!="") g_licMsg=msg;

   g_licOk=ok;
   if(ok)
     {
      g_licUltima=TimeCurrent();
      GlobalVariableSet(LicGvName(chave),(double)g_licUltima);
      if(!silencioso)
         PrintFormat("MTM Premium Scanner LICENCA: valida (%s) na conta %I64d.",
                     (g_licPlano==""?"licenca":g_licPlano),conta);
     }
   else
     {
      //--- uma recusa do servidor apaga a cache: quem foi revogado nao pode
      //    continuar a correr so porque desligou a internet.
      GlobalVariableDel(LicGvName(chave));
      if(!silencioso) Print("MTM Premium Scanner LICENCA: ",g_licMsg);
     }
   return(ok);
  }

//+------------------------------------------------------------------+
//| Aviso no grafico. Um EA que nao abre ordens sem dizer porque e um |
//| EA avariado aos olhos de quem o comprou.                          |
//+------------------------------------------------------------------+
#define MTMPS_LIC_OBJ "MTMPSLIC_aviso"

void LicBanner(const bool visivel)
  {
   if(!visivel)
     {
      ObjectDelete(0,MTMPS_LIC_OBJ);
      ObjectDelete(0,MTMPS_LIC_OBJ"2");
      return;
     }
   if(ObjectFind(0,MTMPS_LIC_OBJ)<0)
     {
      ObjectCreate(0,MTMPS_LIC_OBJ,OBJ_LABEL,0,0,0);
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_CORNER,CORNER_RIGHT_UPPER);
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_XDISTANCE,14);
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_YDISTANCE,20);
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_ANCHOR,ANCHOR_RIGHT_UPPER);
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_COLOR,clrTomato);
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_FONTSIZE,11);
      ObjectSetString(0,MTMPS_LIC_OBJ,OBJPROP_FONT,"Arial Bold");
      ObjectSetInteger(0,MTMPS_LIC_OBJ,OBJPROP_SELECTABLE,false);
     }
   ObjectSetString(0,MTMPS_LIC_OBJ,OBJPROP_TEXT,"MTM Premium Scanner - execucao bloqueada");

   if(ObjectFind(0,MTMPS_LIC_OBJ"2")<0)
     {
      ObjectCreate(0,MTMPS_LIC_OBJ"2",OBJ_LABEL,0,0,0);
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_CORNER,CORNER_RIGHT_UPPER);
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_XDISTANCE,14);
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_YDISTANCE,38);
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_ANCHOR,ANCHOR_RIGHT_UPPER);
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_COLOR,clrSilver);
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_FONTSIZE,9);
      ObjectSetString(0,MTMPS_LIC_OBJ"2",OBJPROP_FONT,"Arial");
      ObjectSetInteger(0,MTMPS_LIC_OBJ"2",OBJPROP_SELECTABLE,false);
     }
   ObjectSetString(0,MTMPS_LIC_OBJ"2",OBJPROP_TEXT,g_licMsg);
   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
//| Chamada no OnInit e, de tempos a tempos, no OnTick.               |
//+------------------------------------------------------------------+
void LicInit(const string chave,const string baseUrl)
  {
   //--- no testador nao ha WebRequest nem contas reais: o backtest corre sempre.
   //    Nao e um furo - nenhum trade real sai daqui.
   if(MQLInfoInteger(MQL_TESTER))
     {
      g_licOk=true; g_licCodigo="tester"; g_licMsg="Testador - licenca nao verificada.";
      return;
     }
   LicValidar(chave,baseUrl,false);
   LicBanner(!g_licOk);
  }

void LicTick(const string chave,const string baseUrl)
  {
   if(MQLInfoInteger(MQL_TESTER)) return;
   //--- enquanto esta bloqueada tenta de 10 em 10 minutos, para que colar a
   //    chave certa (ou permitir o URL) faca efeito sem reiniciar o EA
   int intervalo = g_licOk ? MTMPS_LIC_INTERVALO : 600;
   if(TimeCurrent()-g_licTentativa < intervalo) return;
   bool antes=g_licOk;
   LicValidar(chave,baseUrl,true);
   if(antes!=g_licOk)
     {
      Print("MTM Premium Scanner LICENCA: ",g_licMsg);
      LicBanner(!g_licOk);
     }
  }

void LicDeinit()
  {
   LicBanner(false);
  }

#endif // MTMPS_LICENCA_MQH
