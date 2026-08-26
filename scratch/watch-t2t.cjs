require("dotenv").config({path:"/Users/ricardogarcia/Projetos/morethanmoney/.env.local",quiet:true});
const {createClient}=require("@supabase/supabase-js");
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const desde=process.argv[2];
(async()=>{
 for(let i=0;i<3000;i++){
   const {data}=await s.from("mtmcopy_premium_active")
     .select("*").eq("profile","trailing").gt("created_at",desde)
     .order("created_at",{ascending:true}).limit(1);
   if(data&&data.length){
     const t=data[0];
     const {data:msg}=await s.from("chat_messages").select("channel_slug,content").eq("id",t.chat_message_id).maybeSingle();
     console.log("TRADE_T2T");
     console.log(JSON.stringify({hora:t.created_at,fonte:t.source_key,canal:msg?.channel_slug,symbol:t.symbol,direction:t.direction,entry:t.entry,sl:t.sl,tp1:t.tp1,tp2:t.tp2,tp3:t.tp3,lote:t.original_lot}));
     console.log("--- sinal ---");
     console.log((msg?.content||"(sem mensagem)").slice(0,300));
     process.exit(0);
   }
   await new Promise(r=>setTimeout(r,10000));
 }
 console.log("SEM_TRADE");
})();
