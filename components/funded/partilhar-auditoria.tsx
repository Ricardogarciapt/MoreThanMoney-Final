"use client"

import { useEffect, useState } from "react"
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw, ShieldCheck, Unlink } from "lucide-react"
import { pedir } from "./api"

/**
 * PARTILHAR A CONTA — link público de auditoria (/mtmfunded/auditoria/<token>).
 *
 * O dono gera o link, copia e envia a quem quiser (investidor, aluno, redes). A página mostra as
 * operações ligadas aos sinais, R, pips, drawdown e risco de ruína — sem nome, email nem passwords.
 * O login só aparece se o dono marcar a caixa. Revogar desliga o link de imediato; gerar de novo
 * cria outro endereço (o antigo deixa de abrir). Sessão investor: vê o link se existir, não mexe.
 *
 * Conta REAL ligada (MT5/TradeLocker, migração 250): passa-se `contaRef` em vez de `accountId`. A
 * página lê o histórico na corretora; o número da conta nunca aparece.
 */

interface Link { url: string; mostrarLogin: boolean; criadoEm: string; visitas: number }

export default function PartilharAuditoria({ accountId, contaRef, podeGerir }: { accountId?: string; contaRef?: string; podeGerir: boolean }) {
  const real = !accountId && !!contaRef
  const alvo = real ? `ref=${encodeURIComponent(contaRef!)}` : `accountId=${accountId}`
  const sessao = real ? null : accountId
  const [link, setLink] = useState<Link | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<"pt" | "en" | null>(null)
  const [mostrarLogin, setMostrarLogin] = useState(false)

  useEffect(() => {
    let vivo = true
    setACarregar(true)
    pedir<{ link: Link | null }>(`/api/mtmfunded/auditoria?${alvo}`, {}, sessao)
      .then((d) => { if (vivo) { setLink(d.link); setMostrarLogin(!!d.link?.mostrarLogin); setErro(null) } })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : "erro") })
      .finally(() => { if (vivo) setACarregar(false) })
    return () => { vivo = false }
  }, [alvo, sessao])

  const completo = link ? `${typeof window !== "undefined" ? window.location.origin : "https://www.morethanmoney.pt"}${link.url}` : ""

  async function accao(fn: () => Promise<{ link: Link | null }>) {
    setOcupado(true); setErro(null)
    try { const d = await fn(); setLink(d.link); setMostrarLogin(!!d.link?.mostrarLogin) }
    catch (e) { setErro(e instanceof Error ? e.message : "erro") }
    finally { setOcupado(false) }
  }
  const gerar = (novo = false, login = mostrarLogin) => accao(() =>
    pedir(`/api/mtmfunded/auditoria`, { method: "POST", body: JSON.stringify(real ? { ref: contaRef, novo } : { accountId, mostrarLogin: login, novo }) }, sessao))
  const revogar = () => {
    if (!window.confirm("Desligar o link? Quem o tiver deixa de conseguir abrir a página.")) return
    void accao(() => pedir(`/api/mtmfunded/auditoria?${alvo}`, { method: "DELETE" }, sessao))
  }
  // A página existe em português (endereço base) e em inglês (/en): traduções revistas, não automáticas.
  async function copiar(l: "pt" | "en" = "pt") {
    try { await navigator.clipboard.writeText(l === "en" ? `${completo}/en` : completo); setCopiado(l); setTimeout(() => setCopiado(null), 2000) } catch { /* sem permissão */ }
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden="true" />
        <div className="text-[11.5px] leading-snug text-zinc-300">
          <p className="font-semibold text-white">Link de auditoria da conta</p>
          {real
            ? "Uma página pública com o histórico desta conta, lido directamente na corretora: operações fechadas, pips, taxa de acerto e evolução. Não mostra o teu nome, email, número de conta nem passwords."
            : "Uma página pública com o histórico verificável desta conta: cada operação ligada ao sinal que a abriu, resultado em R e pips, drawdown e risco de ruína. Não mostra o teu nome, email nem passwords."}
        </div>
      </div>

      {aCarregar ? (
        <p className="flex items-center gap-1.5 text-[11.5px] text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> a ler…</p>
      ) : link ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <input readOnly value={completo} aria-label="Link público da auditoria" onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-2 font-mono text-[11.5px] text-zinc-200" />
            <button type="button" onClick={() => void copiar("pt")} className="flex min-h-9 items-center gap-1 rounded-md border border-[#D2A63C]/50 bg-[#D2A63C]/15 px-2.5 text-[11.5px] text-[#E9C46A]">
              {copiado === "pt" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} {copiado === "pt" ? "Copiado" : "Copiar"}
            </button>
            <a href={link.url} target="_blank" rel="noopener" aria-label="Abrir a página de auditoria" className="flex min-h-9 items-center rounded-md border border-white/10 px-2 text-zinc-300">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
          <button type="button" onClick={() => void copiar("en")} className="flex min-h-8 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-zinc-300">
            {copiado === "en" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} {copiado === "en" ? "Copiado" : "Copiar versão em inglês"}
          </button>
          <p className="text-[10.5px] text-zinc-500">{link.visitas} visita(s) · criado a {new Date(link.criadoEm).toLocaleDateString("pt-PT")}</p>
          {podeGerir && (
            <div className="flex flex-wrap items-center gap-2">
              {!real && (
                <label className="flex items-center gap-1.5 text-[11.5px] text-zinc-300">
                  <input type="checkbox" checked={mostrarLogin} disabled={ocupado} onChange={(e) => { setMostrarLogin(e.target.checked); void gerar(false, e.target.checked) }} />
                  Mostrar o número da conta
                </label>
              )}
              <button type="button" disabled={ocupado} onClick={() => void gerar(true)} className="flex min-h-8 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-zinc-300 disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Novo endereço
              </button>
              <button type="button" disabled={ocupado} onClick={revogar} className="flex min-h-8 items-center gap-1 rounded-md border border-rose-500/30 px-2 text-[11px] text-rose-300 disabled:opacity-50">
                <Unlink className="h-3.5 w-3.5" aria-hidden="true" /> Desligar
              </button>
            </div>
          )}
        </div>
      ) : podeGerir ? (
        <div className="space-y-2">
          {!real && (
            <label className="flex items-center gap-1.5 text-[11.5px] text-zinc-300">
              <input type="checkbox" checked={mostrarLogin} onChange={(e) => setMostrarLogin(e.target.checked)} /> Mostrar o número da conta na página
            </label>
          )}
          <button type="button" disabled={ocupado} onClick={() => void gerar(false)}
            className="flex min-h-10 items-center gap-1.5 rounded-md bg-[#D2A63C] px-3 text-[12px] font-semibold text-black disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />} Criar link de partilha
          </button>
        </div>
      ) : (
        <p className="text-[11.5px] text-zinc-500">O dono da conta ainda não criou um link de partilha.</p>
      )}
      {erro && <p role="alert" className="text-[11px] text-rose-300">{erro}</p>}
      <p className="text-[10.5px] text-zinc-500">{real ? "Conta real na tua corretora" : "Conta simulada"}. Resultados passados não garantem resultados futuros.</p>
    </div>
  )
}
