"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { MENU, type Trabalho } from "@/lib/site-solucoes/conteudo"
import { useT } from "@/components/solucoes/idioma"

/** O menu de trabalhos, por grupo. Preço só onde está decidido; o resto é sob proposta. */

const GRUPOS: Trabalho["grupo"][] = ["Presença", "Atendimento e vendas", "Operação", "Conteúdo", "Trading"]

export function MenuTrabalhos({ agendar }: { agendar: string }) {
  const { t } = useT()
  const [grupo, setGrupo] = useState<Trabalho["grupo"]>("Presença")
  const itens = MENU.filter((m) => m.grupo === grupo)

  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label={t("Grupos de trabalhos")}>
        {GRUPOS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={g === grupo}
            onClick={() => setGrupo(g)}
            className={[
              "shrink-0 rounded-full border px-4 py-2 text-sm transition active:scale-[0.97]",
              g === grupo ? "border-[#D2A63C] bg-[#D2A63C] font-semibold text-[#08090C]" : "border-white/15 text-zinc-300 hover:border-[#D2A63C]/50",
            ].join(" ")}
          >
            {t(g)}
          </button>
        ))}
      </div>
      <div key={grupo} className="mt-8 grid gap-4 md:grid-cols-3">
        {itens.map((m, i) => (
          <article
            key={m.nome}
            className={[
              "flex flex-col rounded-2xl border p-6 animate-in fade-in slide-in-from-bottom-2 duration-500",
              m.destaque ? "border-[#D2A63C]/50 bg-gradient-to-b from-[#D2A63C]/15 to-transparent" : "border-white/10 bg-white/[0.03]",
            ].join(" ")}
            style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
          >
            <h3 className="text-lg font-bold">{t(m.nome)}</h3>
            <p className={m.destaque ? "mt-1 text-xl font-black text-[#E9C46A]" : "mt-1 font-semibold text-[#E9C46A]"}>{t(m.preco)}</p>
            <ul className="mt-5 space-y-2 text-sm text-zinc-300">
              {m.inclui.map((x) => (
                <li key={x} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" /> {t(x)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm text-zinc-500">
        {t("Os trabalhos combinam-se. No diagnóstico montamos contigo o pacote certo e damos o preço fechado.")}{" "}
        <a href={agendar} className="font-semibold text-[#E9C46A] hover:underline">
          {t("Marcar diagnóstico")}
        </a>
      </p>
    </div>
  )
}
