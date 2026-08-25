require("dotenv").config({path:"/Users/ricardogarcia/Projetos/morethanmoney/.env.local",quiet:true});
const {createClient}=require("@supabase/supabase-js");
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const desde=process.argv[2];
(async()=>{
 for(let i=0;i<2600;i++){
   const {data}=await s.from("mtmcopy_premium_active").select("*").gt("created_at",desde).order("created_at",{ascending:true}).limit(1);
   if(data&&data.length){
     const t=data[0];
     const {data:log}=await s.from("mtmcopy_signal_log").select("created_at,status,detail").gte("created_at",new Date(Date.parse(t.created_at)-90000).toISOString()).order("created_at",{ascending:true}).limit(30);
     console.log("TRADE_NOVA");
     console.log(JSON.stringify({hora:t.created_at,symbol:t.symbol,direction:t.direction,entry:t.entry,sl:t.sl,tp1:t.tp1,tp2:t.tp2,tp3:t.tp3,lot:t.original_lot,status:t.status},null,0));
     console.log("--- log de execucao ---");
     (log||[]).forEach(r=>console.log(r.created_at.slice(11,19),r.status,(r.detail||"").slice(0,110)));
     process.exit(0);
   }
   await new Promise(r=>setTimeout(r,10000));
 }
 console.log("SEM_TRADE — 7h sem entradas novas no Premium");
})();
