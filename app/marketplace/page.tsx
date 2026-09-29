/**
 * /marketplace — a montra multivendedor da MTM.
 *
 * ── PÚBLICA, E ISSO É UMA MUDANÇA ─────────────────────────────────────────────────────────
 *
 * Estava atrás de `ProtectedPage`. A rota `/api/marketplace/produtos` sempre foi pública — é por
 * isso que era fácil concluir que a montra também era —, mas a PÁGINA mandava quem não tivesse
 * sessão para o login. Quem chegasse do Instagram via um formulário de entrada, não uma loja.
 *
 * Uma montra é o argumento de venda; pedir conta antes de a mostrar é pedir o compromisso antes de
 * dar a razão para ele. Por isso abre-se, e o que continua fechado é o que tem de estar:
 *
 *   · O `conteudo_url` NUNCA sai na resposta pública (ver `COLUNAS_VITRINE` em `servidor.ts`). A
 *     montra mostra o que se compra; a chave entrega-se em `/api/marketplace/biblioteca`, e só a
 *     quem tem compra. Foi por não separar as duas que o cartão de cursos do /live acabou a mandar
 *     o link das playlists VIP a toda a gente com um cadeado desenhado por cima.
 *   · Só produtos `publicado` + `activo` aparecem a quem não é admin (`produtoNaVitrine`).
 *   · O checkout continua a exigir sessão. O cartão de quem não tem sessão diz «Entrar para
 *     comprar» e leva à ficha depois do login — em vez de um erro vermelho.
 *
 * A ficha (`/marketplace/[slug]`) segue a mesma regra e pela mesma razão: um link partilhado de um
 * produto tem de abrir para quem ainda não é membro, senão não serve para ser partilhado.
 */
"use client"

import Vitrine from "@/components/marketplace/vitrine"

export default function MarketplacePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#D2A63C]">Marketplace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Tudo o que a MTM e os seus educadores vendem, num sítio só.
        </h1>
        <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-zinc-400">
          Subscrições, scanners, robôs, cursos e mentorias. Cada produto tem um vendedor — a casa ou
          um educador — e é ele que responde por aquilo que vende.
        </p>
      </header>
      <Vitrine />
    </main>
  )
}
