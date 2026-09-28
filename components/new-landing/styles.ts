/**
 * CSS da landing pública (/new-landing). Vive num <style> em vez de Tailwind porque a página é
 * uma peça de design fechada — paleta, tipografia, animações de scroll e demos mudam juntas.
 * Gerado com todos os seletores escopados por `.l2`: a navbar e o rodapé são os globais do site
 * e não podem ser afetados por nada daqui.
 */
export const LANDING_CSS = String.raw`
.l2{
  --ground:#0e0e12;--panel:#191920;--panel2:#212129;--line:#2f2f39;--line2:#43434f;
  --ink:#f8f6f0;--dim:#b0aa9d;--faint:#837c6e;
  --gold:#d2a63c;--gold-lt:#eccb78;--gold-dp:#7a5d16;--live:#4fc98a;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;--disp:"Archivo","Helvetica Neue",system-ui,sans-serif;
  --serif:"Fraunces",Georgia,serif;--body:"Instrument Sans",system-ui,sans-serif;
}
.l2 *{box-sizing:border-box}
.l2{scroll-behavior:smooth}
.l2{margin:0;background:var(--ground);color:var(--ink);font-family:var(--body);font-size:16.5px;line-height:1.65;overflow-x:hidden}
/* As camadas de atmosfera (canvas, auras, malha, grao) sao position:fixed e cobririam a
   viewport inteira — incluindo o rodape global do site, que fica FORA de .l2. O isolate cria
   um contexto de empilhamento: tudo o que e daqui fica preso aqui, e o rodape pinta por cima. */
.l2{position:relative;isolation:isolate;z-index:0}
.l2 .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.l2 h1, .l2 h2, .l2 h3{font-family:var(--disp);font-weight:700;letter-spacing:-.028em;text-wrap:balance;margin:0;line-height:1.05}
.l2 h1{font-weight:800;letter-spacing:-.038em}
.l2 em.acc{font-family:var(--serif);font-style:italic;font-weight:600;letter-spacing:-.01em;color:var(--gold-lt)}
.l2 a{color:inherit;text-decoration:none}
.l2 .kicker{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin:0 0 18px}
.l2 .r{opacity:0;transform:translateY(24px);transition:opacity .9s cubic-bezier(.16,.7,.3,1),transform .9s cubic-bezier(.16,.7,.3,1)}
.l2 .r.on{opacity:1;transform:none}
.l2 .d1{transition-delay:.1s}
.l2 .d2{transition-delay:.2s}
.l2 .d3{transition-delay:.3s}
.l2 .d4{transition-delay:.4s}
.l2 .d5{transition-delay:.5s}
.l2 .d6{transition-delay:.6s}
.l2 #l2-amb{position:fixed;inset:0;z-index:0;pointer-events:none}
.l2 .aur{position:fixed;border-radius:50%;filter:blur(88px);opacity:.34;pointer-events:none;z-index:0}
.l2 .aur.a{width:600px;height:600px;background:radial-gradient(circle,#d2a63c,transparent 66%);top:-8%;left:-10%;animation:l2float1 34s ease-in-out infinite alternate}
.l2 .aur.b{width:430px;height:430px;background:radial-gradient(circle,#7a5d16,transparent 66%);bottom:6%;right:-8%;animation:l2float2 41s ease-in-out infinite alternate}
@keyframes l2float1{to{transform:translate3d(16vw,22vh,0) scale(1.22)}}
@keyframes l2float2{to{transform:translate3d(-14vw,-18vh,0) scale(.84)}}
.l2 .mesh{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(rgba(210,166,60,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(210,166,60,.07) 1px,transparent 1px);
  background-size:78px 78px;animation:l2mesh 34s linear infinite;
  -webkit-mask-image:radial-gradient(ellipse 120% 70% at 50% 40%,#000 20%,transparent 78%);mask-image:radial-gradient(ellipse 120% 70% at 50% 40%,#000 20%,transparent 78%)}
@keyframes l2mesh{to{background-position:78px 78px}}
.l2 header, .l2 section, .l2 .strip, .l2 .nar{position:relative;z-index:2}
@media(prefers-reduced-motion:reduce){
.l2 .r{opacity:1;transform:none;transition:none}
.l2 *{animation:none!important}
.l2 #l2-amb{display:none}
}
.l2 .btn{display:inline-block;font-weight:600;font-size:14px;padding:10px 21px;border-radius:999px;background:var(--gold);color:#08080a;transition:transform .25s,box-shadow .25s}
.l2 .btn:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(210,166,60,.3)}
.l2 .btn.g{background:transparent;color:var(--ink);border:1px solid var(--line2)}
.l2 .btn.g:hover{border-color:var(--gold);box-shadow:none}
.l2 .open2{min-height:100vh;display:flex;align-items:center;overflow:hidden}
.l2 .open2__bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.68;transform:scale(1.08);animation:l2drift 28s ease-in-out infinite alternate}
@keyframes l2drift{to{transform:scale(1.16) translate3d(-1.5%,-1%,0)}}
.l2 .open2__veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,14,18,.94) 4%,rgba(14,14,18,.72) 42%,rgba(14,14,18,.18) 74%,transparent),linear-gradient(0deg,var(--ground),transparent 52%)}
.l2 .open2 .wrap{position:relative;z-index:2;padding:120px 24px 70px}
.l2 .open2 h1{font-size:clamp(38px,6.6vw,76px);max-width:15ch}
.l2 .open2 h1 em{font-style:italic;color:var(--gold-lt)}
.l2 .ln{display:block;overflow:hidden}
.l2 .ln>span{display:block;transform:translateY(105%);transition:transform 1.05s cubic-bezier(.16,.72,.24,1)}
.l2 .on .ln>span, .l2 .open2.go .ln>span{transform:none}
.l2 .open2 .ln:nth-child(2)>span{transition-delay:.13s}
.l2 .open2 p.l{font-size:clamp(17px,1.9vw,20px);color:var(--dim);max-width:50ch;margin:26px 0 34px}
.l2 .acts{display:flex;flex-wrap:wrap;gap:12px}
.l2 .hint{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);z-index:2;font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);animation:l2bob 2.6s ease-in-out infinite}
@keyframes l2bob{50%{transform:translate(-50%,7px)}}
.l2 .strip{border-block:1px solid var(--line);background:rgba(16,16,19,.6);overflow:hidden;padding:15px 0}
.l2 .strip__t{display:flex;gap:40px;width:max-content;animation:l2slide 46s linear infinite;font-family:var(--mono);font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
.l2 .strip__t b{color:var(--gold);font-weight:400}
@keyframes l2slide{to{transform:translateX(-50%)}}
.l2 section{padding:118px 0}
.l2 section[id], .l2 header[id]{scroll-margin-top:86px}
.l2 .band{background:rgba(33,33,41,.74);border-block:1px solid var(--line)}
.l2 .head{max-width:62ch;margin-bottom:54px}
.l2 .head h2{font-size:clamp(28px,4.4vw,50px)}
.l2 .head p{color:var(--dim);margin:18px 0 0;font-size:18px}
.l2 .nums{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:18px;overflow:hidden}
@media(max-width:1000px){
.l2 .nums{grid-template-columns:repeat(2,1fr)}
}
.l2 .num{background:var(--ground);padding:32px 24px}
.l2 .num .v{font-family:var(--mono);font-size:clamp(25px,3.1vw,36px);font-weight:700;color:var(--gold);font-variant-numeric:tabular-nums;line-height:1}
.l2 .num .l{font-size:13px;color:var(--dim);margin-top:9px}
.l2 .scene{min-height:70vh;display:flex;align-items:center;overflow:hidden;border-block:1px solid var(--line);padding:100px 0}
.l2 .scene__bg{position:absolute;inset:-12% 0;background-size:cover;background-position:center;opacity:.56;will-change:transform}
.l2 .scene__veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,14,18,.93) 7%,rgba(14,14,18,.64) 46%,transparent)}
.l2 .scene .wrap{position:relative;z-index:2}
.l2 .scene h2{font-size:clamp(26px,4vw,44px);max-width:16ch}
.l2 .scene p{color:var(--dim);max-width:46ch;margin-top:18px;font-size:17px}
.l2 .day{display:grid;grid-template-columns:1fr 380px;gap:68px;align-items:start}
@media(max-width:960px){
.l2 .day{grid-template-columns:1fr;gap:42px}
}
.l2 .beat{padding:28px 0;border-top:1px solid var(--line);opacity:.32;transition:opacity .6s}
.l2 .beat.on{opacity:1}
.l2 .beat:first-child{border-top:0}
.l2 .beat .t{font-family:var(--mono);font-size:11px;letter-spacing:.16em;color:var(--gold)}
.l2 .beat h3{font-size:23px;margin:9px 0 7px}
.l2 .beat p{margin:0;color:var(--dim);font-size:15.5px;max-width:44ch}
.l2 .beat .tool{display:inline-block;margin-top:13px;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-lt);border:1px solid var(--gold-dp);border-radius:999px;padding:4px 11px}
.l2 .phone{position:sticky;top:110px;justify-self:center}
@media(max-width:960px){
.l2 .phone{position:static}
}
.l2 .phone__b{width:322px;max-width:88vw;border-radius:38px;border:1px solid var(--line2);background:#0b0b0d;padding:13px;box-shadow:0 40px 90px rgba(0,0,0,.7)}
.l2 .phone__s{border-radius:26px;background:#08080a;height:512px;overflow:hidden;display:flex;flex-direction:column}
.l2 .phone__bar{padding:13px 15px 9px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
.l2 .phone__bar .dot{width:7px;height:7px;border-radius:50%;background:var(--gold);animation:l2pulse 2s ease-in-out infinite}
@keyframes l2pulse{50%{opacity:.35;transform:scale(.8)}}
.l2 .phone__bar span{font-size:12.5px;font-weight:600}
.l2 .feed{flex:1;overflow:hidden;padding:13px 13px 15px;display:flex;flex-direction:column;gap:8px}
.l2 .msg{border-radius:13px;padding:9px 11px;font-size:12px;line-height:1.5;border:1px solid var(--line);background:var(--panel);opacity:0;transform:translateY(9px);transition:.5s;white-space:pre-line}
.l2 .msg.on{opacity:1;transform:none}
.l2 .msg .who{font-family:var(--mono);font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);display:block;margin-bottom:4px}
.l2 .msg.win{border-color:rgba(79,201,138,.4);background:rgba(79,201,138,.07)}
.l2 .msg.act{border-color:var(--gold);background:rgba(210,166,60,.1)}
.l2 .tapbtn{margin-top:8px;display:inline-block;font-size:10.5px;font-weight:600;background:var(--gold);color:#08080a;padding:5px 13px;border-radius:999px}
.l2 .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
.l2 .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.l2 .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media(max-width:1000px){
.l2 .grid4{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:860px){
.l2 .grid2, .l2 .grid3{grid-template-columns:1fr}
}
@media(max-width:560px){
.l2 .grid4{grid-template-columns:1fr}
}
.l2 .card{position:relative;border:1px solid var(--line);border-radius:20px;padding:30px 26px;overflow:hidden;
  background:radial-gradient(120% 100% at 0% 0%,rgba(210,166,60,.07),transparent 58%),var(--panel);transition:border-color .4s,transform .4s}
.l2 .card::after{content:"";position:absolute;inset:0;border-radius:20px;pointer-events:none;opacity:0;transition:opacity .5s;
  background:radial-gradient(320px 220px at var(--mx,50%) var(--my,0%),rgba(210,166,60,.13),transparent 70%)}
.l2 .card:hover::after{opacity:1}
.l2 .card:hover{border-color:var(--gold-dp);transform:translateY(-4px)}
.l2 .card .n{font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:var(--faint);text-transform:uppercase}
.l2 .card h3{font-size:22px;margin:10px 0 11px}
.l2 .card p{color:var(--dim);margin:0;font-size:15px}
.l2 .card .ic{font-size:20px;line-height:1;margin-bottom:14px;display:block}
.l2 .shot{border:1px solid var(--line2);border-radius:16px;overflow:hidden;background:var(--panel);box-shadow:0 30px 70px rgba(0,0,0,.55)}
.l2 .shot__bar{display:flex;gap:6px;padding:11px 14px;border-bottom:1px solid var(--line);background:var(--panel2);align-items:center}
.l2 .shot__bar i{width:9px;height:9px;border-radius:50%;background:var(--line2);display:block}
.l2 .shot__bar em{font-style:normal;font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--faint);margin-left:9px;text-transform:uppercase}
.l2 .shot img{display:block;width:100%;height:auto}
.l2 .reveal img{clip-path:inset(0 100% 0 0);transition:clip-path 1.15s cubic-bezier(.16,.72,.24,1) .1s}
.l2 .reveal.on img{clip-path:inset(0 0 0 0)}
.l2 .split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
@media(max-width:900px){
.l2 .split{grid-template-columns:1fr;gap:36px}
}
.l2 .split h2{font-size:clamp(26px,3.6vw,40px)}
.l2 .split p{color:var(--dim);font-size:16.5px}
/* ─── Pilares (#areas) ────────────────────────────────────────────────────────
   Três blocos, e a grelha passa a ter duas dimensões: pilar (a que parte da casa
   pertence) e família (já dá aulas / está a abrir). A 375px não há espaço para as
   duas ao mesmo tempo, por isso em telemóvel a coisa fica LINEAR e é o pilar que dá
   a ordem: título do pilar → o que já acontece → o que está a abrir. */
.l2 .pil{border-top:1px solid var(--line);padding-top:34px;margin-top:48px}
.l2 .pil.p1{border-top:0;margin-top:0;padding-top:0}
.l2 .pil__n{font-family:var(--disp);font-size:clamp(23px,3.1vw,32px);font-weight:800;letter-spacing:-.03em;
  margin:0;display:flex;align-items:baseline;gap:13px}
.l2 .pil__n b{font-family:var(--mono);font-size:11px;font-weight:400;letter-spacing:.2em;color:var(--gold);flex:none}
.l2 .pil__d{color:var(--dim);font-size:15.5px;margin:10px 0 0;max-width:64ch}
.l2 .pil__c{display:flex;flex-wrap:wrap;gap:7px;margin:15px 0 0}
.l2 .pil__c span{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--faint);border:1px solid var(--line2);border-radius:999px;padding:4px 10px}
.l2 .pil__sub{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--faint);margin:28px 0 13px}
/* "Também neste pilar": o que já vive noutras secções da página. Serve para dar corpo ao
   pilar sem repetir o catálogo — e um pilar magro fica magro, que é informação. */
.l2 .also{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;align-items:center}
.l2 .also em{font-style:normal;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--faint);margin-right:3px}
.l2 .also span, .l2 .also a{font-size:12.5px;border-radius:999px;padding:5px 12px;
  border:1px solid var(--line);color:var(--dim);background:rgba(255,255,255,.02)}
.l2 .also a{color:var(--gold-lt);border-color:var(--gold-dp)}
.l2 .also a:hover{background:rgba(210,166,60,.1)}

/* ─── Áreas (#areas) ──────────────────────────────────────────────────────────
   Duas famílias na mesma secção, e a diferença tem de ler-se sem ler o texto:
   .ar = já dá aulas (painel cheio, ouro, nome do educador, link);
   .ab = ainda não (traço interrompido, sem preenchimento, sem botão).
   Se algum dia isto passar a uma grelha só, volta a mentir. */
.l2 .aw{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.l2 .aw3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
@media(max-width:860px){
.l2 .aw, .l2 .aw3{grid-template-columns:1fr}
}
.l2 .ar{position:relative;border:1px solid var(--line);border-radius:20px;padding:26px 24px;overflow:hidden;
  background:radial-gradient(130% 110% at 0% 0%,rgba(210,166,60,.09),transparent 60%),var(--panel);
  transition:border-color .4s,transform .4s;display:flex;flex-direction:column}
.l2 .ar:hover{border-color:var(--gold-dp);transform:translateY(-4px)}
.l2 .ar.big{padding:30px 28px}
.l2 .ar .who3{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.l2 .ar .av2{width:42px;height:42px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
  background:rgba(210,166,60,.16);border:1px solid var(--gold-dp);color:var(--gold);
  font-family:var(--mono);font-size:13px;font-weight:700;letter-spacing:.04em}
.l2 .ar .en{font-size:14.5px;font-weight:600;color:var(--ink);display:block;line-height:1.3}
.l2 .ar .er{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);display:block;margin-top:3px}
.l2 .ar h3{font-size:21px;margin:0 0 9px}
.l2 .ar.big h3{font-size:26px}
.l2 .ar p{color:var(--dim);margin:0;font-size:14.5px}
.l2 .ar .mt{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}
.l2 .ar .mt span{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--gold-lt);border:1px solid var(--gold-dp);border-radius:999px;padding:4px 10px;white-space:nowrap}
.l2 .ar .go2{margin-top:auto;padding-top:18px;font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--gold);display:inline-flex;align-items:center;gap:7px;align-self:flex-start}
.l2 .ar .go2::after{content:"→";transition:transform .3s}
.l2 .ar:hover .go2::after{transform:translateX(4px)}
.l2 .ar .lz{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--live);
  display:inline-flex;align-items:center;gap:7px;margin-bottom:14px}
.l2 .ar .lz b{width:6px;height:6px;border-radius:50%;background:var(--live);animation:l2pulse 2.4s ease-in-out infinite}
/* Área real mas sem educador: ocupa a mesma linha da ficha do educador, para o cartão não
   encolher, e não pisca a verde — não há aula a acontecer. */
.l2 .ar .nt{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  display:inline-flex;align-items:center;gap:7px;margin:0 0 14px;min-height:42px}
.l2 .ar .nt b{width:6px;height:6px;border-radius:50%;background:var(--gold-dp);flex:none}
/* A família que ainda não entrega. Sem ouro de fundo, sem botão, sem número inventado. */
.l2 .soon{margin-top:14px}
.l2 .ab{border:1px dashed var(--line2);border-radius:16px;padding:20px 22px;background:transparent;transition:border-color .4s}
.l2 .ab:hover{border-color:var(--faint)}
.l2 .ab .lb3{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);
  display:inline-flex;align-items:center;gap:7px;margin-bottom:11px}
.l2 .ab .lb3 b{width:5px;height:5px;border-radius:50%;background:var(--line2);flex:none}
.l2 .ab h3{font-size:17px;margin:0 0 7px;color:var(--dim);letter-spacing:-.018em}
.l2 .ab p{margin:0;font-size:13.5px;color:var(--faint);line-height:1.55}
.l2 .tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.l2 .tag{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-lt);border:1px solid var(--gold-dp);border-radius:999px;padding:5px 12px}
.l2 .certs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:860px){
.l2 .certs{grid-template-columns:1fr}
}
.l2 .cert{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel);transition:transform .5s,border-color .5s}
.l2 .cert:hover{transform:translateY(-6px) rotate(-.5deg);border-color:var(--gold-dp)}
.l2 .cert img{display:block;width:100%;height:auto}
.l2 .cert .cc{padding:18px 20px 22px}
.l2 .cert h3{font-size:17px;margin:0 0 6px}
.l2 .cert p{margin:0;color:var(--dim);font-size:13.5px}
.l2 .rail{overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 7%,#000 93%,transparent)}
.l2 .rail__t{display:flex;gap:18px;width:max-content;animation:l2slide 68s linear infinite}
.l2 .rail:hover .rail__t{animation-play-state:paused}
.l2 .story{width:232px;flex:none;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel)}
.l2 .story img{display:block;width:100%;height:auto;filter:saturate(.9)}
.l2 .story .sc{padding:15px 16px 18px}
.l2 .story .sn{font-family:var(--serif);font-weight:600;font-size:15px}
.l2 .story .sr{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:3px}
.l2 .story .sq{font-size:13px;color:var(--dim);margin:11px 0 0;line-height:1.55}
.l2 .packs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:940px){
.l2 .packs{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:560px){
.l2 .packs{grid-template-columns:1fr}
}
.l2 .pk{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:26px 22px;display:flex;flex-direction:column;transition:transform .35s,border-color .35s}
.l2 .pk:hover{transform:translateY(-5px);border-color:var(--line2)}
.l2 .pk.star{border-color:var(--gold);background:linear-gradient(180deg,rgba(210,166,60,.1),var(--panel) 56%)}
.l2 .pk .fl{font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);display:block;margin-bottom:11px}
.l2 .pk .nm{font-family:var(--serif);font-weight:600;font-size:19px}
.l2 .pk .pr{font-family:var(--mono);font-size:29px;font-weight:700;margin:11px 0 2px}
.l2 .pk .pe{font-size:12px;color:var(--faint)}
.l2 .pk .ln2{font-size:13.5px;color:var(--dim);margin:13px 0 17px;min-height:54px;line-height:1.5}
.l2 .pk ul{list-style:none;padding:0;margin:0 0 21px;font-size:13.5px;color:var(--dim);flex:1}
.l2 .pk li{padding-left:17px;position:relative;margin-bottom:8px}
.l2 .pk li::before{content:"";position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:50%;background:var(--gold-dp)}
.l2 .pk .btn{text-align:center}
.l2 .risk{border-left:2px solid var(--gold-dp);padding-left:16px;color:var(--faint);font-size:12.5px;max-width:76ch;margin-top:26px}
.l2 .crail{overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.l2 .crail__t{display:flex;align-items:stretch;gap:16px;width:max-content;animation:l2slide 90s linear infinite}
.l2 .crail:hover .crail__t{animation-play-state:paused}
.l2 .cf{width:250px;flex:none;display:flex;border-radius:13px;padding:2px;background:linear-gradient(135deg,#D2A63C,#8a6a1e 52%,#5a4614);box-shadow:0 14px 34px rgba(0,0,0,.5)}
.l2 .cf__in{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center;border-radius:11px;background:linear-gradient(135deg,#0b0b0d,#000 48%,#0b0b0d);padding:22px 18px;text-align:center;overflow:hidden}
.l2 .cf__in::before{content:"";position:absolute;inset:-64px 0 auto;height:120px;background:rgba(210,166,60,.11);filter:blur(30px)}
.l2 .cf__c{position:absolute;width:15px;height:15px;border:0 solid rgba(210,166,60,.5)}
.l2 .cf__c.tl{top:7px;left:7px;border-left-width:2px;border-top-width:2px}
.l2 .cf__c.tr{top:7px;right:7px;border-right-width:2px;border-top-width:2px}
.l2 .cf__c.bl{bottom:7px;left:7px;border-left-width:2px;border-bottom-width:2px}
.l2 .cf__c.br{bottom:7px;right:7px;border-right-width:2px;border-bottom-width:2px}
.l2 .cf .seal{width:44px;height:44px;margin:0 auto 11px;border-radius:50%;background:linear-gradient(135deg,#F0D488,#BB8525);
  display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px rgba(210,166,60,.3);position:relative}
.l2 .cf .seal svg{width:21px;height:21px;stroke:#000;fill:none;stroke-width:2}
.l2 .cf .lb{font-family:var(--mono);font-size:8.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);position:relative}
.l2 .cf .at{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b73;margin-top:13px;position:relative}
.l2 .cf .nm2{font-family:"Great Vibes",cursive;font-size:29px;line-height:1.15;color:#ecc76b;margin-top:2px;white-space:nowrap;position:relative}
.l2 .cf .rule{height:1px;width:104px;margin:11px auto;background:linear-gradient(90deg,transparent,rgba(210,166,60,.6),transparent);position:relative}
.l2 .cf .co{font-size:12.5px;color:#d8d8dc;font-weight:500;position:relative}
.l2 .cf .gr{font-size:12.5px;font-weight:700;color:var(--gold);margin-top:3px;position:relative}
.l2 .cf .sg{font-size:9.5px;color:#6b6b73;margin-top:13px;position:relative}
.l2 .pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--gold-dp);background:rgba(210,166,60,.1);
  color:var(--gold);border-radius:999px;padding:7px 16px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.l2 .tw{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:900px){
.l2 .tw{grid-template-columns:1fr}
}
.l2 .tm{border:1px solid rgba(210,166,60,.2);border-radius:18px;padding:26px 24px;
  background:linear-gradient(135deg,rgba(210,166,60,.055),transparent 62%),var(--panel);
  display:flex;flex-direction:column;transition:border-color .4s,transform .4s}
.l2 .tm:hover{border-color:rgba(210,166,60,.5);transform:translateY(-4px)}
.l2 .tm .st{color:var(--gold);letter-spacing:2px;font-size:13px}
.l2 .tm .qm{font-family:var(--serif);font-size:36px;line-height:.6;color:rgba(210,166,60,.32);margin:12px 0 4px}
.l2 .tm .qt{font-style:italic;color:#c9c6bd;font-size:14.5px;line-height:1.7;flex:1;margin:0 0 22px}
.l2 .tm .who2{display:flex;align-items:center;gap:11px}
.l2 .tm .av{width:40px;height:40px;border-radius:50%;background:rgba(210,166,60,.16);color:var(--gold);
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none}
.l2 .tm .nn{font-weight:600;font-size:14px}
.l2 .tm .lo{font-size:12px;color:var(--faint);display:flex;align-items:center;gap:5px}
.l2 .tm .vf{color:var(--live);font-size:11px}
.l2 .tm .rs{margin-top:18px;padding-top:16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:13.5px}
.l2 .tm .rs b{color:var(--live);font-family:var(--mono)}
.l2 .tm .rs span{color:var(--faint)}
.l2 .nar{border-block:1px solid var(--line);background:
  radial-gradient(90% 130% at 50% 0%,rgba(210,166,60,.09),transparent 62%),rgba(20,20,26,.86);padding:82px 0}
.l2 .nar .wrap{max-width:760px}
.l2 .nar .lb2{font-family:var(--mono);font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);
  display:flex;align-items:center;gap:12px;margin-bottom:24px}
.l2 .nar .lb2::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--gold-dp),transparent)}
.l2 .nar q{quotes:none;display:block;font-family:var(--serif);font-size:clamp(20px,2.7vw,29px);line-height:1.42;
  font-style:italic;color:#e8e4d9;text-wrap:balance}
.l2 .nar p{color:var(--dim);font-size:15.5px;margin:22px 0 0}
.l2 .nar .sig2{font-family:var(--mono);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:26px}
.l2 .ch{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);
  display:flex;align-items:center;gap:11px;margin:0 0 18px}
.l2 .ch b{font-weight:400;color:var(--faint)}
.l2 .ch::after{content:"";width:46px;height:1px;background:var(--gold-dp)}
.l2 .vbtn{display:inline-flex;align-items:center;gap:11px;font-weight:600;font-size:14px;padding:9px 20px 9px 10px;
  border-radius:999px;border:1px solid var(--line2);color:var(--ink);background:rgba(255,255,255,.03);
  transition:border-color .3s,background .3s;cursor:pointer;font-family:var(--body)}
.l2 .vbtn:hover{border-color:var(--gold);background:rgba(210,166,60,.08)}
.l2 .vbtn i{width:28px;height:28px;border-radius:50%;background:var(--gold);color:#08080a;display:flex;
  align-items:center;justify-content:center;font-style:normal;font-size:11px;flex:none}
.l2 .vbtn i::after{content:"▶";transform:translateX(1px)}
.l2 .vm{position:fixed;inset:0;z-index:200;background:rgba(4,4,6,.9);backdrop-filter:blur(9px);
  display:flex;align-items:center;justify-content:center;padding:26px;opacity:0;visibility:hidden;transition:.35s}
.l2 .vm.on{opacity:1;visibility:visible}
.l2 .vm__c{width:min(920px,100%);transform:translateY(14px) scale(.98);transition:.45s cubic-bezier(.16,.72,.24,1)}
.l2 .vm.on .vm__c{transform:none}
.l2 .vm__f{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;border:1px solid var(--line2);
  background:#000;box-shadow:0 40px 100px rgba(0,0,0,.75)}
.l2 .vm__f img{width:100%;height:100%;object-fit:cover;display:block;opacity:.72}
.l2 .vm__f iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.l2 .vm__p{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:linear-gradient(0deg,rgba(8,8,10,.6),transparent 55%)}
.l2 .vm__p span{width:74px;height:74px;border-radius:50%;background:var(--gold);color:#08080a;display:flex;
  align-items:center;justify-content:center;font-size:24px;box-shadow:0 0 0 12px rgba(210,166,60,.16);transition:transform .3s}
.l2 .vm__p:hover span{transform:scale(1.08)}
.l2 .vm__h{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:16px}
.l2 .vm__h h3{font-size:22px}
.l2 .vm__h p{margin:5px 0 0;color:var(--dim);font-size:14px}
.l2 .vm__x{background:none;border:1px solid var(--line2);color:var(--dim);border-radius:999px;width:34px;height:34px;
  cursor:pointer;font-size:16px;flex:none;font-family:var(--body)}
.l2 .vm__x:hover{border-color:var(--gold);color:var(--ink)}
.l2 .vm__l{margin:14px 0 0;font-size:13px;color:var(--faint);text-align:center}
.l2 .vm__l a{color:var(--gold);border-bottom:1px solid var(--gold-dp)}
.l2 .stamp{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  display:inline-flex;align-items:center;gap:8px;margin-top:20px}
.l2 .stamp b{width:6px;height:6px;border-radius:50%;background:var(--live);animation:l2pulse 2.4s ease-in-out infinite}
.l2 #l2-grain{position:fixed;inset:-50%;z-index:1;pointer-events:none;opacity:.03;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  animation:l2grain 1.1s steps(4) infinite}
@keyframes l2grain{0%{transform:translate(0,0)}25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-2%)}}
.l2 #l2-rail{transition:opacity .4s;position:fixed;left:22px;top:50%;transform:translateY(-50%);z-index:60;display:flex;flex-direction:column;gap:14px}
@media(max-width:1340px){
.l2 #l2-rail{display:none}
}
.l2 #l2-rail a{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;color:var(--faint);transition:color .35s}
.l2 #l2-rail i{display:block;width:16px;height:1px;background:var(--line2);transition:width .45s cubic-bezier(.16,.72,.24,1),background .45s}
.l2 #l2-rail a span{opacity:0;transform:translateX(-4px);transition:.35s;white-space:nowrap}
.l2 #l2-rail a:hover span, .l2 #l2-rail a.act span{opacity:1;transform:none}
.l2 #l2-rail a.act{color:var(--gold)}
.l2 #l2-rail a.act i{width:32px;background:var(--gold)}
.l2 .w{display:inline-block;overflow:hidden;vertical-align:top}
.l2 .w>b{display:inline-block;font-weight:inherit;transform:translateY(102%);transition:transform .8s cubic-bezier(.16,.72,.24,1)}
.l2 .on .w>b, .l2 .wgo .w>b{transform:none}
.l2 .mag{will-change:transform}
.l2 .demo{border:1px solid var(--line2);border-radius:18px;background:linear-gradient(180deg,var(--panel2),var(--panel));
  overflow:hidden;box-shadow:0 34px 80px rgba(0,0,0,.6)}
.l2 .demo__bar{display:flex;align-items:center;gap:9px;padding:12px 16px;border-bottom:1px solid var(--line);background:rgba(8,8,10,.5)}
.l2 .demo__bar .lv{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--live);border:1px solid rgba(79,201,138,.35);border-radius:999px;padding:3px 9px}
.l2 .demo__bar .lv b{width:5px;height:5px;border-radius:50%;background:var(--live);animation:l2pulse 1.9s ease-in-out infinite}
.l2 .demo__bar em{font-style:normal;font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--faint);text-transform:uppercase}
.l2 .demo__bd{padding:22px}
.l2 .tsig{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.l2 .tsig .bull{font-family:var(--mono);font-weight:700;font-size:13px;letter-spacing:.1em;color:var(--live);
  border:1px solid rgba(79,201,138,.4);background:rgba(79,201,138,.1);border-radius:9px;padding:8px 15px}
.l2 .tsig .cv{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.l2 .tsig .cv b{display:block;font-family:var(--body);font-size:14px;letter-spacing:0;text-transform:none;color:var(--ink);font-weight:600;margin-top:2px}
.l2 .tsig .px2{margin-left:auto;font-family:var(--mono);font-size:20px;font-weight:700;color:var(--gold);font-variant-numeric:tabular-nums}
.l2 .tline{color:var(--dim);font-size:14.5px;line-height:1.6;margin:0 0 20px;min-height:3.2em}
.l2 .tline .cur{display:inline-block;width:8px;height:1em;background:var(--gold);vertical-align:-2px;animation:l2blink .9s steps(2) infinite}
@keyframes l2blink{50%{opacity:0}}
.l2 .gauges{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
@media(max-width:760px){
.l2 .gauges{grid-template-columns:1fr}
}
.l2 .ga{border:1px solid var(--line);border-radius:13px;padding:15px 16px;background:rgba(8,8,10,.4)}
.l2 .ga .gl{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.l2 .ga .gv{font-family:var(--mono);font-size:22px;font-weight:700;margin:9px 0 8px;font-variant-numeric:tabular-nums}
.l2 .ga .gt{height:4px;border-radius:999px;background:var(--line);overflow:hidden}
.l2 .ga .gt i{display:block;height:100%;width:0;border-radius:999px;transition:width 1.5s cubic-bezier(.16,.72,.24,1)}
.l2 .ga .gs{font-size:11.5px;color:var(--faint);margin-top:7px}
.l2 .scen{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
@media(max-width:760px){
.l2 .scen{grid-template-columns:1fr}
}
.l2 .sc{border:1px solid var(--line);border-radius:13px;padding:14px 15px;background:rgba(8,8,10,.4);
  opacity:0;transform:translateY(12px);transition:.7s cubic-bezier(.16,.72,.24,1)}
.l2 .on .sc{opacity:1;transform:none}
.l2 .on .sc:nth-child(2){transition-delay:.12s}
.l2 .on .sc:nth-child(3){transition-delay:.24s}
.l2 .sc .sh{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase}
.l2 .sc .sh b{font-size:14px;letter-spacing:0}
.l2 .sc p{margin:10px 0 0;font-size:12.5px;color:var(--dim);line-height:1.55}
.l2 .sc .bar{height:3px;border-radius:999px;background:var(--line);margin-top:10px;overflow:hidden}
.l2 .sc .bar i{display:block;height:100%;width:0;transition:width 1.2s cubic-bezier(.16,.72,.24,1) .3s}
.l2 .alerts{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media(max-width:940px){
.l2 .alerts{grid-template-columns:1fr}
}
.l2 .al{border:1px solid var(--line);border-radius:15px;background:var(--panel);padding:16px 17px;
  opacity:0;transform:translateY(26px) rotate(-1.4deg) scale(.97);transition:.85s cubic-bezier(.16,.72,.24,1)}
.l2 .on .al{opacity:1;transform:none}
.l2 .on .al:nth-child(2){transition-delay:.13s}
.l2 .on .al:nth-child(3){transition-delay:.26s}
.l2 .al__t{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:13px}
.l2 .al__t .sym{font-family:var(--serif);font-weight:600;font-size:19px;margin-right:2px}
.l2 .chip{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;padding:3px 9px;border:1px solid}
.l2 .chip.buy{color:var(--live);border-color:rgba(79,201,138,.4);background:rgba(79,201,138,.09)}
.l2 .chip.sell{color:#e0755f;border-color:rgba(224,117,95,.4);background:rgba(224,117,95,.09)}
.l2 .chip.tf{color:var(--dim);border-color:var(--line2)}
.l2 .chip.pd{color:var(--gold);border-color:var(--gold-dp);background:rgba(210,166,60,.09)}
.l2 .lvls{display:flex;flex-direction:column;gap:6px;font-family:var(--mono);font-size:11.5px;font-variant-numeric:tabular-nums}
.l2 .lvls div{display:flex;justify-content:space-between;gap:10px;color:var(--dim)}
.l2 .lvls div b{font-weight:600}
.l2 .lvls .sl b{color:#e0755f}
.l2 .lvls .tp b{color:var(--live)}
.l2 .conf{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}
.l2 .cf2{font-family:var(--mono);font-size:9px;letter-spacing:.06em;border-radius:7px;padding:4px 8px;border:1px solid var(--line2);color:var(--faint)}
.l2 .cf2.ok{color:var(--live);border-color:rgba(79,201,138,.35)}
.l2 .cf2.no{color:#8a5548;border-color:rgba(224,117,95,.25)}
.l2 .al__f{margin-top:13px;padding-top:11px;border-top:1px solid var(--line);display:flex;justify-content:space-between;
  font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.l2 .dca{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:20px}
@media(max-width:940px){
.l2 .dca{grid-template-columns:1fr}
}
.l2 .dc{border:1px solid var(--line);border-radius:15px;padding:16px 17px;background:var(--panel);
  opacity:0;transform:translateY(20px);transition:.75s cubic-bezier(.16,.72,.24,1)}
.l2 .on .dc{opacity:1;transform:none}
.l2 .on .dc:nth-child(2){transition-delay:.12s}
.l2 .on .dc:nth-child(3){transition-delay:.24s}
.l2 .dc__t{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.l2 .dc__t b{font-family:var(--serif);font-size:17px;font-weight:600}
.l2 .dc .tk{font-family:var(--mono);font-size:10px;color:var(--faint);letter-spacing:.1em}
.l2 .dc .px3{font-family:var(--mono);font-size:23px;font-weight:700;margin:13px 0 3px;font-variant-numeric:tabular-nums}
.l2 .dc .sub2{font-size:11.5px;color:var(--faint)}
.l2 .dc .why{font-size:12.5px;color:var(--dim);margin:13px 0 0;line-height:1.55}
.l2 .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:860px){
.l2 .tiles{grid-template-columns:repeat(2,1fr)}
}
.l2 .tl{border:1px solid var(--line);border-radius:13px;padding:16px;background:rgba(8,8,10,.4)}
.l2 .tl .tv{font-family:var(--mono);font-size:24px;font-weight:700;color:var(--gold);font-variant-numeric:tabular-nums;line-height:1}
.l2 .tl .tn{font-size:11.5px;color:var(--dim);margin-top:7px;line-height:1.45}
.l2 .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:960px){
.l2 .two{grid-template-columns:1fr}
}
.l2 .way{border:1px solid var(--line);border-radius:20px;overflow:hidden;background:var(--panel);
  display:flex;flex-direction:column;transition:border-color .5s,transform .5s}
.l2 .way:hover{border-color:var(--gold-dp);transform:translateY(-4px)}
.l2 .way__s{position:relative;padding:30px 26px 26px;background:
  radial-gradient(120% 110% at 50% 0%,rgba(210,166,60,.11),transparent 62%),
  linear-gradient(180deg,#0d0d10,#08080a);border-bottom:1px solid var(--line);min-height:322px;
  display:flex;align-items:center;justify-content:center}
.l2 .way__c{padding:26px}
.l2 .way__c .n{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.l2 .way__c h3{font-size:24px;margin:9px 0 4px}
.l2 .way__c .sb{font-size:13.5px;color:var(--gold-lt);font-family:var(--mono);letter-spacing:.04em}
.l2 .way__c p{color:var(--dim);font-size:15px;margin:16px 0 0}
.l2 .way__c .flow{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:18px 0 0;
  font-family:var(--mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint)}
.l2 .way__c .flow b{color:var(--gold-lt);font-weight:400;border:1px solid var(--gold-dp);border-radius:999px;padding:4px 11px}
.l2 .t2t{width:230px;border-radius:26px;border:1px solid var(--line2);background:#0b0b0d;padding:11px;
  box-shadow:0 26px 60px rgba(0,0,0,.65)}
.l2 .t2t__s{border-radius:18px;background:#08080a;padding:15px 14px;border:1px solid var(--line)}
.l2 .t2t__h{display:flex;justify-content:space-between;align-items:center;margin-bottom:13px}
.l2 .t2t__h b{font-family:var(--mono);font-size:13px;font-weight:700}
.l2 .t2t__r{display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;padding:5px 0;
  border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.l2 .t2t__r:first-of-type{border-top:0}
.l2 .t2t__r span{color:var(--faint)}
.l2 .t2t__b{margin-top:14px;text-align:center;background:var(--gold);color:#08080a;border-radius:11px;
  padding:10px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;position:relative;overflow:hidden}
.l2 .t2t__b::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.55),transparent 70%);
  transform:translateX(-130%);animation:l2sheen 3.4s ease-in-out infinite}
@keyframes l2sheen{45%,100%{transform:translateX(130%)}}
.l2 .t2t__f{text-align:center;font-family:var(--mono);font-size:8.5px;letter-spacing:.13em;color:var(--faint);margin-top:11px;text-transform:uppercase}
.l2 .tap{position:absolute;width:44px;height:44px;border-radius:50%;border:1.5px solid var(--gold);
  left:50%;bottom:74px;transform:translateX(-50%);opacity:0;animation:l2tap 3.4s ease-out infinite}
@keyframes l2tap{0%{opacity:0;transform:translateX(-50%) scale(.35)}12%{opacity:.85}45%{opacity:0;transform:translateX(-50%) scale(1.55)}100%{opacity:0}}
.l2 .copy{width:100%;max-width:330px}
.l2 .copy svg{width:100%;height:auto;overflow:visible}
.l2 .copy .lnk{fill:none;stroke:var(--gold-dp);stroke-width:1.4;stroke-dasharray:200;stroke-dashoffset:200;
  transition:stroke-dashoffset 1.3s cubic-bezier(.16,.72,.24,1)}
.l2 .on .copy .lnk{stroke-dashoffset:0}
.l2 .on .copy .lnk:nth-of-type(2){transition-delay:.16s}
.l2 .on .copy .lnk:nth-of-type(3){transition-delay:.32s}
.l2 .copy .dot2{fill:var(--gold);r:3.2;opacity:0}
.l2 .on .copy .dot2{animation:l2travel 2.6s linear infinite}
.l2 .on .copy .dot2.b{animation-delay:.85s}
.l2 .on .copy .dot2.c{animation-delay:1.7s}
@keyframes l2travel{0%{opacity:0}8%{opacity:1}92%{opacity:1}100%{opacity:0}}
.l2 .copy .mast{fill:none;stroke:var(--gold);stroke-width:1.6}
.l2 .copy .halo{fill:none;stroke:var(--gold);stroke-width:1;opacity:.35;animation:l2halo 3s ease-out infinite}
@keyframes l2halo{0%{r:26;opacity:.5}100%{r:46;opacity:0}}
.l2 .copy text{font-family:var(--mono);fill:var(--dim)}
.l2 .copy .cli{fill:var(--panel2);stroke:var(--line2);stroke-width:1}
.l2 .fig{margin:0;position:relative}
.l2 .fig img{display:block;width:100%;height:auto;border-radius:18px;border:1px solid var(--line2);
  box-shadow:0 34px 80px rgba(0,0,0,.62)}
.l2 .fig::after{content:"";position:absolute;inset:0;border-radius:18px;pointer-events:none;
  background:linear-gradient(180deg,transparent 52%,rgba(8,8,10,.55));}
.l2 .fig figcaption{position:absolute;left:20px;right:20px;bottom:16px;z-index:2;
  font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-lt)}
.l2 .reveal.fig img{clip-path:inset(0 100% 0 0);transition:clip-path 1.15s cubic-bezier(.16,.72,.24,1) .1s}
.l2 .reveal.fig.on img{clip-path:inset(0 0 0 0)}
.l2 #l2-cta{position:fixed;left:0;right:0;bottom:0;z-index:80;transform:translateY(115%);
  transition:transform .5s cubic-bezier(.16,.72,.24,1);pointer-events:none}
.l2 #l2-cta.on{transform:none;pointer-events:auto}
.l2 #l2-cta .in{max-width:1180px;margin:0 auto;padding:0 24px 18px}
.l2 #l2-cta .bar{display:flex;align-items:center;gap:18px;background:rgba(25,25,32,.93);backdrop-filter:blur(16px);
  border:1px solid var(--line2);border-radius:16px;padding:13px 15px 13px 20px;
  box-shadow:0 20px 60px rgba(0,0,0,.6)}
.l2 #l2-cta .tx{flex:1;min-width:0}
.l2 #l2-cta .tx b{display:block;font-family:var(--disp);font-weight:700;font-size:15.5px;letter-spacing:-.02em}
.l2 #l2-cta .tx span{display:block;font-size:12.5px;color:var(--dim);margin-top:2px}
.l2 #l2-cta .ac{display:flex;gap:9px;flex:none}
.l2 #l2-cta .btn{padding:10px 20px;font-size:13.5px}
.l2 #l2-cta .x{background:none;border:0;color:var(--faint);cursor:pointer;font-size:16px;padding:6px 2px 6px 8px;font-family:var(--body)}
.l2 #l2-cta .x:hover{color:var(--ink)}
@media(max-width:720px){
.l2 #l2-cta .in{padding:0 12px 12px}
.l2 #l2-cta .bar{padding:11px 12px;gap:10px}
.l2 #l2-cta .tx span{display:none}
.l2 #l2-cta .tx b{font-size:14px}
.l2 #l2-cta .btn.g{display:none}
}
.l2 .jump{display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap;
  border:1px solid var(--line2);border-radius:18px;padding:24px 26px;margin-top:44px;
  background:radial-gradient(120% 160% at 0% 0%,rgba(210,166,60,.11),transparent 62%),var(--panel)}
.l2 .jump p{margin:0;font-family:var(--disp);font-weight:700;font-size:19px;letter-spacing:-.02em;max-width:46ch}
.l2 .jump p span{display:block;font-family:var(--body);font-weight:400;font-size:14px;color:var(--dim);
  letter-spacing:0;margin-top:5px}
.l2 .jump .ac{display:flex;gap:10px;flex-wrap:wrap}
.l2 .faq{max-width:820px;margin:0 auto}
.l2 .fq{border-bottom:1px solid var(--line)}
.l2 .fq:first-child{border-top:1px solid var(--line)}
.l2 .fq button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:20px;
  background:none;border:0;color:var(--ink);text-align:left;cursor:pointer;padding:22px 4px;
  font-family:var(--disp);font-weight:700;font-size:17.5px;letter-spacing:-.018em;transition:color .25s}
.l2 .fq button:hover{color:var(--gold-lt)}
.l2 .fq button i{font-style:normal;color:var(--gold);font-size:20px;flex:none;transition:transform .35s;line-height:1}
.l2 .fq.aberta button i{transform:rotate(45deg)}
.l2 .fq .ans{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s cubic-bezier(.16,.72,.24,1)}
.l2 .fq.aberta .ans{grid-template-rows:1fr}
.l2 .fq .ans>.in2{overflow:hidden;min-height:0}
.l2 .fq .ans p{margin:0 0 20px;color:var(--dim);font-size:15px;line-height:1.7;max-width:70ch}
.l2 .fq .ans a{color:var(--gold-lt);border-bottom:1px solid var(--gold-dp)}
.l2 .strip, .l2 .nar{position:relative;z-index:2}

`
