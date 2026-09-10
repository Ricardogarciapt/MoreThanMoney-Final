'use client'

import { useEffect, useRef } from 'react'

/**
 * A atmosfera do MTM Funded: paleta, auras, malha e revelação por scroll.
 *
 * Mesma linguagem da /new-landing — auras que derivam, malha dourada, blocos que sobem ao
 * entrar no ecrã — mas com o prefixo `.fx` em vez de `.l2`. Duas razões para não reaproveitar
 * o outro ficheiro: o Funded tem navegação e rodapé PRÓPRIOS (o `.l2` está escrito a contar
 * com os globais do site) e a paleta é a dele. Copiar a técnica e não o ficheiro deixa as
 * duas páginas evoluírem sem se partirem uma à outra.
 *
 * Tudo é `position:fixed` dentro de um `isolate`, para as camadas não passarem por cima do
 * rodapé. E tudo pára com `prefers-reduced-motion`: uma página que continua a mexer para quem
 * pediu que não mexesse não é bonita, é ignorante.
 */

export const CSS_FUNDED = String.raw`
.fx{
  --ground:#07070a;--panel:#101018;--panel2:#16161f;--line:#25252f;--line2:#3a3a47;
  --ink:#f6f5f2;--dim:#a9a49a;--faint:#7b756a;
  --gold:#d2a63c;--gold-lt:#eccb78;--gold-dp:#7a5d16;--live:#4fc98a;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;
  --disp:"Archivo","Helvetica Neue",system-ui,sans-serif;
}
.fx{position:relative;isolation:isolate;z-index:0;background:var(--ground);color:var(--ink);overflow-x:hidden}
.fx h1,.fx h2,.fx h3{font-family:var(--disp);letter-spacing:-.028em;text-wrap:balance;line-height:1.06}
.fx h1{letter-spacing:-.038em}

/* camadas de fundo */
.fx .aur{position:fixed;border-radius:50%;filter:blur(90px);opacity:.30;pointer-events:none;z-index:0}
.fx .aur.a{width:620px;height:620px;background:radial-gradient(circle,#d2a63c,transparent 66%);top:-10%;left:-12%;animation:fxf1 36s ease-in-out infinite alternate}
.fx .aur.b{width:460px;height:460px;background:radial-gradient(circle,#7a5d16,transparent 66%);bottom:4%;right:-10%;animation:fxf2 43s ease-in-out infinite alternate}
@keyframes fxf1{to{transform:translate3d(15vw,20vh,0) scale(1.2)}}
@keyframes fxf2{to{transform:translate3d(-13vw,-16vh,0) scale(.85)}}
.fx .mesh{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.45;
  background-image:linear-gradient(rgba(210,166,60,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(210,166,60,.07) 1px,transparent 1px);
  background-size:76px 76px;animation:fxm 36s linear infinite;
  -webkit-mask-image:radial-gradient(ellipse 120% 70% at 50% 30%,#000 18%,transparent 76%);
  mask-image:radial-gradient(ellipse 120% 70% at 50% 30%,#000 18%,transparent 76%)}
@keyframes fxm{to{background-position:76px 76px}}
.fx section,.fx header{position:relative;z-index:2}

/* revelação */
.fx .r{opacity:0;transform:translateY(22px);transition:opacity .85s cubic-bezier(.16,.7,.3,1),transform .85s cubic-bezier(.16,.7,.3,1)}
.fx .r.on{opacity:1;transform:none}
.fx .d1{transition-delay:.08s}.fx .d2{transition-delay:.16s}.fx .d3{transition-delay:.24s}
.fx .d4{transition-delay:.32s}.fx .d5{transition-delay:.4s}

/* peças */
.fx .kicker{font-family:var(--mono);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.fx .vidro{background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012));
  border:1px solid var(--line);border-radius:18px;backdrop-filter:blur(10px)}
.fx .vidro:hover{border-color:var(--line2)}
.fx .destaque{border-color:rgba(210,166,60,.38);
  box-shadow:0 0 0 1px rgba(210,166,60,.10),0 24px 60px -30px rgba(210,166,60,.5)}
.fx .btn{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;
  padding:12px 24px;border-radius:999px;background:var(--gold);color:#08080a;
  transition:transform .25s,box-shadow .25s}
.fx .btn:hover{transform:translateY(-2px);box-shadow:0 12px 34px rgba(210,166,60,.32)}
.fx .btn.g{background:transparent;color:var(--ink);border:1px solid var(--line2)}
.fx .btn.g:hover{border-color:var(--gold);box-shadow:none}
.fx .pulso{position:relative}
.fx .pulso::before{content:"";position:absolute;inset:-3px;border-radius:999px;
  background:var(--live);opacity:.25;animation:fxp 2.4s ease-out infinite}
@keyframes fxp{0%{transform:scale(.85);opacity:.35}70%{transform:scale(1.5);opacity:0}100%{opacity:0}}

@media(prefers-reduced-motion:reduce){
  .fx .r{opacity:1;transform:none;transition:none}
  .fx *{animation:none!important}
  .fx .aur,.fx .mesh{display:none}
}
`

export default function Atmosfera({ children }: { children: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const no = raiz.current
    if (!no) return

    // Revelação por scroll. `unobserve` depois de revelar: um bloco que já apareceu não
    // precisa de voltar a ser observado, e observadores que ficam a correr numa página longa
    // custam no telemóvel.
    const io = new IntersectionObserver(
      (entradas) =>
        entradas.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    no.querySelectorAll('.r').forEach((el) => io.observe(el))

    // Quem chega por âncora já vem a meio da página: o que está acima mostra-se feito, em vez
    // de ficar invisível à espera de um scroll que já aconteceu.
    if (window.scrollY > window.innerHeight * 0.4) {
      no.querySelectorAll('.r').forEach((el) => el.classList.add('on'))
    }

    return () => io.disconnect()
  }, [])

  return (
    <div ref={raiz} className="fx">
      <style dangerouslySetInnerHTML={{ __html: CSS_FUNDED }} />
      <div className="aur a" aria-hidden />
      <div className="aur b" aria-hidden />
      <div className="mesh" aria-hidden />
      {children}
    </div>
  )
}
