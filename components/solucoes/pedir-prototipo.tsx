"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Bot, Check, Loader2, Palette, Smartphone, Sparkles } from "lucide-react"
import { useT } from "@/components/solucoes/idioma"
import { KITS, MODELOS } from "@/lib/site-solucoes/showroom"
import { SECTOR_OUTRO, SOLUCOES_PROTOTIPO } from "@/lib/site-solucoes/prototipo"

/**
 * «Receber o protótipo da minha solução»: o formulário. Chega pré-preenchido do relatório da
 * análise (sessionStorage), da proposta em PDF (?proposta=) e do showroom (?modelo=&negocio=&cor=).
 * Ao enviar, a IA prepara o protótipo e abrimos logo a página dele; a reunião marca-se lá.
 */

const campo =
  "mt-1.5 w-full rounded-xl border border-white/15 bg-[#0B0D12] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#D2A63C] focus:outline-none"

export const CHAVE_PRE_PROTOTIPO = "mtm_prototipo_pre"
export const CHAVE_PRE_AGENDA = "mtm_agenda_pre"

const PASSOS = ["A ler o teu negócio", "A desenhar a tua app", "A escrever o teu assistente", "A montar o plano da demo"]

export function PedirPrototipo({ inicial }: { inicial: Record<string, string | undefined> }) {
  const { t, idioma } = useT()
  const router = useRouter()
  const sectorInicial = MODELOS.some((m) => m.id === inicial.modelo) ? inicial.modelo! : MODELOS.some((m) => m.id === inicial.sector) ? inicial.sector! : ""
  const [f, setF] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: inicial.negocio ?? inicial.empresa ?? "",
    sector: sectorInicial,
    sectorLivre: sectorInicial ? "" : inicial.sector ?? "",
    cidade: "",
    cor: /^#[0-9a-fA-F]{6}$/.test(inicial.cor ?? "") ? inicial.cor! : MODELOS.find((m) => m.id === sectorInicial)?.corPrincipal ?? "#D2A63C",
    servicos: "",
    dores: "",
    website: "",
  })
  const [solucoes, setSolucoes] = useState<string[]>(() => {
    const q = (inicial.solucoes ?? "").split(",").filter((x) => (SOLUCOES_PROTOTIPO as readonly string[]).includes(x))
    return q.length ? q.slice(0, 3) : ["pagina-app", "agenda-lembretes"]
  })
  const [consentimento, setConsentimento] = useState(false)
  const [estado, setEstado] = useState<"form" | "a_enviar">("form")
  const [passo, setPasso] = useState(0)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  // Dados que a pessoa já deu no relatório da análise: não se pedem duas vezes.
  useEffect(() => {
    try {
      const pre = JSON.parse(sessionStorage.getItem(CHAVE_PRE_PROTOTIPO) || "null") as Partial<typeof f> | null
      if (pre) setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(pre).filter(([k, v]) => typeof v === "string" && v && !(k === "empresa" && x.empresa))) }))
    } catch {}
  }, [])

  useEffect(() => {
    if (estado !== "a_enviar") return
    const id = window.setInterval(() => setPasso((p) => Math.min(p + 1, PASSOS.length - 1)), 2600)
    return () => window.clearInterval(id)
  }, [estado])

  const kits = useMemo(() => SOLUCOES_PROTOTIPO.map((k) => KITS.find((x) => x.kit === k)!).filter(Boolean), [])
  const mudar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const alternar = (k: string) =>
    setSolucoes((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= 3 ? [...s.slice(1), k] : [...s, k]))

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setErros({})
    setPasso(0)
    setEstado("a_enviar")
    const r = await fetch("/api/solucoes/prototipo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, sector: f.sector || SECTOR_OUTRO, solucoes, consentimento, proposta: inicial.proposta ?? "", idioma }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, erro: "Não foi possível preparar o protótipo. Tenta outra vez." }))
    if (r?.ok && r.slug) {
      try {
        sessionStorage.setItem(CHAVE_PRE_AGENDA, JSON.stringify({ nome: f.nome, email: f.email, telefone: f.telefone }))
      } catch {}
      router.push(`/solucoes/prototipo/${r.slug}${idioma !== "pt" ? `?lang=${idioma}` : ""}`)
      return
    }
    setEstado("form")
    if (r?.erros) setErros(r.erros)
    else setErro(r?.erro ?? "Não foi possível preparar o protótipo. Tenta outra vez.")
  }

  if (estado === "a_enviar") {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-[#D2A63C]/30 bg-[#0E0F12] p-8 text-center shadow-2xl shadow-[#D2A63C]/10">
        <div className="relative mx-auto h-20 w-20">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#D2A63C]/20" aria-hidden="true" />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#D2A63C]/15 ring-1 ring-[#D2A63C]/50">
            <Sparkles className="h-8 w-8 text-[#E9C46A]" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-6 text-xl font-bold">{t("A nossa IA está a preparar o teu protótipo")}</p>
        <ol className="mt-6 space-y-2.5 text-left text-sm" aria-live="polite">
          {PASSOS.map((p, i) => (
            <li key={p} className={`flex items-center gap-3 transition-opacity ${i <= passo ? "opacity-100" : "opacity-35"}`}>
              {i < passo ? <Check className="h-4 w-4 text-[#D2A63C]" aria-hidden="true" /> : i === passo ? <Loader2 className="h-4 w-4 animate-spin text-[#E9C46A]" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-white/20" aria-hidden="true" />}
              {t(p)}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="mx-auto grid max-w-3xl gap-6 rounded-3xl border border-white/10 bg-[#0B0D12]/80 p-5 md:p-8" noValidate>
      <input type="text" name="website" value={f.website} onChange={mudar("website")} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">
          <Smartphone className="h-4 w-4" aria-hidden="true" /> {t("O teu negócio")}
        </legend>
        <label className="text-sm text-zinc-300">
          {t("Nome do negócio")}
          <input className={campo} value={f.empresa} onChange={mudar("empresa")} placeholder={t("Ex.: Estúdio Ana")} autoComplete="organization" />
          {erros.empresa && <span className="mt-1 block text-xs text-red-400">{t(erros.empresa)}</span>}
        </label>
        <label className="text-sm text-zinc-300">
          {t("Sector")}
          <select className={campo} value={f.sector} onChange={mudar("sector")}>
            <option value="">{t("Outro (escrevo eu)")}</option>
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>{t(m.sector)}</option>
            ))}
          </select>
        </label>
        {!f.sector && (
          <label className="text-sm text-zinc-300 md:col-span-2">
            {t("Que negócio é?")}
            <input className={campo} value={f.sectorLivre} onChange={mudar("sectorLivre")} placeholder={t("Ex.: escola de surf, lavandaria, óptica")} />
            {erros.sectorLivre && <span className="mt-1 block text-xs text-red-400">{t(erros.sectorLivre)}</span>}
          </label>
        )}
        <label className="text-sm text-zinc-300">
          {t("Cidade")} <span className="text-zinc-600">({t("opcional")})</span>
          <input className={campo} value={f.cidade} onChange={mudar("cidade")} autoComplete="address-level2" />
        </label>
        <label className="text-sm text-zinc-300">
          <span className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" aria-hidden="true" /> {t("A cor da tua marca")}</span>
          <span className="mt-1.5 flex items-center gap-3 rounded-xl border border-white/15 bg-[#0B0D12] px-3 py-1.5">
            <input type="color" value={f.cor} onChange={mudar("cor")} className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent" aria-label={t("A cor da tua marca")} />
            <span className="font-mono text-xs text-zinc-400">{f.cor.toUpperCase()}</span>
          </span>
        </label>
        <label className="text-sm text-zinc-300 md:col-span-2">
          {t("Serviços e preços")} <span className="text-zinc-600">({t("um por linha, opcional")})</span>
          <textarea className={`${campo} min-h-[88px]`} value={f.servicos} onChange={mudar("servicos")} placeholder={t("Ex.: Corte - 15 €; Barba - 10 €")} />
        </label>
      </fieldset>

      <fieldset>
        <legend className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">
          <Bot className="h-4 w-4" aria-hidden="true" /> {t("O que queres no protótipo (até 3)")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {kits.map((k) => {
            const on = solucoes.includes(k.kit)
            return (
              <button
                key={k.kit}
                type="button"
                aria-pressed={on}
                onClick={() => alternar(k.kit)}
                className={`flex min-h-[64px] items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? "border-[#D2A63C]/70 bg-[#D2A63C]/10" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-[#D2A63C] bg-[#D2A63C] text-black" : "border-white/25"}`}>
                  {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{t(k.solucao)}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-400">{t(k.promessa)}</span>
                </span>
              </button>
            )
          })}
        </div>
        {erros.solucoes && <span className="mt-2 block text-xs text-red-400">{t(erros.solucoes)}</span>}
        <label className="mt-4 block text-sm text-zinc-300">
          {t("O que mais te rouba tempo?")} <span className="text-zinc-600">({t("opcional")})</span>
          <textarea className={`${campo} min-h-[72px]`} value={f.dores} onChange={mudar("dores")} placeholder={t("Ex.: responder às mesmas perguntas no WhatsApp e confirmar marcações")} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#E9C46A]">{t("Para te enviarmos o protótipo e marcarmos a reunião")}</legend>
        <label className="text-sm text-zinc-300">
          {t("O teu nome")}
          <input className={campo} value={f.nome} onChange={mudar("nome")} autoComplete="name" />
          {erros.nome && <span className="mt-1 block text-xs text-red-400">{t(erros.nome)}</span>}
        </label>
        <label className="text-sm text-zinc-300">
          {t("Email")}
          <input className={campo} type="email" value={f.email} onChange={mudar("email")} autoComplete="email" />
          {erros.email && <span className="mt-1 block text-xs text-red-400">{t(erros.email)}</span>}
        </label>
        <label className="text-sm text-zinc-300">
          {t("Telemóvel")}
          <input className={campo} type="tel" value={f.telefone} onChange={mudar("telefone")} autoComplete="tel" />
          {erros.telefone && <span className="mt-1 block text-xs text-red-400">{t(erros.telefone)}</span>}
        </label>
      </fieldset>

      <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-400">
        <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#D2A63C]" />
        <span>
          {t("Autorizo a MoreThanMoney a usar estes dados para preparar o protótipo e combinar a reunião comigo.")}{" "}
          <a href="/privacidade" className="text-[#E9C46A] underline">{t("Privacidade")}</a>
          {erros.consentimento && <span className="mt-1 block text-red-400">{t(erros.consentimento)}</span>}
        </span>
      </label>

      {erro && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{t(erro)}</p>}

      <button type="submit" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-[#D2A63C] px-6 text-base font-bold text-black shadow-lg shadow-[#D2A63C]/25 transition-transform hover:scale-[1.01]">
        <Sparkles className="h-5 w-5" aria-hidden="true" /> {t("Criar o meu protótipo agora")} <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
      <p className="-mt-3 text-center text-xs text-zinc-500">{t("Fica pronto em segundos. A demo com a tua marca segue até 24 h depois da reunião.")}</p>
    </form>
  )
}
