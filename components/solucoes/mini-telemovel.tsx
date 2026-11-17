import type { ModeloSector } from "@/lib/site-solucoes/showroom"

/** Telemóvel pequeno e estático com a cara de um modelo por sector (topo do /demos e vitrine do /solucoes). */
export function MiniTelemovel({ m, t, className = "" }: { m: ModeloSector; t: (s: string) => string; className?: string }) {
  const escuro = parseInt(m.corFundo.slice(1, 3), 16) < 80
  const linha = escuro ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.08)"
  return (
    <div className={`w-[150px] rounded-[1.75rem] border border-white/15 bg-black p-1.5 shadow-2xl shadow-black/60 md:w-[180px] ${className}`} aria-hidden="true">
      <div className="overflow-hidden rounded-[1.4rem]" style={{ background: m.corFundo, color: m.corTexto }}>
        <div className="px-3 pb-4 pt-6" style={{ background: m.corPrincipal, color: "#fff" }}>
          <div className="h-7 w-7 rounded-lg bg-white/25" />
          <p className="mt-2 text-sm font-bold leading-tight">{m.marca}</p>
          <p className="mt-0.5 text-[9px] opacity-90">{t(m.slogan)}</p>
        </div>
        <div className="space-y-1.5 p-2.5">
          <p className="text-[8px] font-bold uppercase tracking-wider opacity-60">{t(m.destaque.titulo)}</p>
          {m.servicos.map((s) => (
            <div key={s.s} className="flex justify-between gap-1 rounded-md border px-2 py-1.5 text-[9px]" style={{ borderColor: linha }}>
              <span className="truncate">{t(s.s)}</span>
              <span className="shrink-0 opacity-60">{t(s.p)}</span>
            </div>
          ))}
          <div className="rounded-md py-1.5 text-center text-[9px] font-bold text-white" style={{ background: m.corPrincipal }}>{t("Marcar pelo WhatsApp")}</div>
        </div>
      </div>
    </div>
  )
}
