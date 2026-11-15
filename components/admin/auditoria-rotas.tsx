"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw, Unlink } from "lucide-react"

/**
 * Links públicos de auditoria das ROTAS de estratégia (contas-mestre MTM Funded).
 * Cada membro emite o da sua conta no WebTrader (A minha conta → Partilhar); as mestres são da casa
 * e emitem-se aqui. API: /api/admin/mtmfunded/auditoria-rotas.
 */

interface Link { url: string; criadoEm: string | null; visitas: number }
interface Rota { slug: string; nome: string; arquivada: boolean; accountId: string; cicloDesde: string | null; link: Link | null }

const absoluto = (url: string) => (typeof window === "undefined" ? url : new URL(url, window.location.origin).toString())
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })

export function AuditoriaRotas() {
  const [rotas, setRotas] = useState<Rota[]>([])
  const [carregar, setCarregar] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const ler = useCallback(async () => {
    setCarregar(true); setErro(null)
    try {
      const r = await fetch("/api/admin/mtmfunded/auditoria-rotas", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "não foi possível ler as rotas")
      setRotas(j.rotas ?? [])
    } catch (e) { setErro((e as Error).message) } finally { setCarregar(false) }
  }, [])
  useEffect(() => { void ler() }, [ler])

  async function agir(accountId: string, metodo: "POST" | "DELETE", novo = false) {
    if (metodo === "DELETE" && !window.confirm("Desligar este link? Quem o tiver deixa de conseguir abrir a página.")) return
    if (novo && !window.confirm("Gerar um endereço novo? O antigo deixa de abrir.")) return
    setOcupado(accountId); setErro(null)
    try {
      const r = await fetch(`/api/admin/mtmfunded/auditoria-rotas${metodo === "DELETE" ? `?accountId=${accountId}` : ""}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: metodo === "POST" ? JSON.stringify({ accountId, novo }) : undefined,
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "falhou")
      setRotas((xs) => xs.map((x) => (x.accountId === accountId ? { ...x, link: j.link ?? null } : x)))
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(null) }
  }

  async function copiar(r: Rota) {
    if (!r.link) return
    try { await navigator.clipboard.writeText(absoluto(r.link.url)); setCopiado(r.accountId); setTimeout(() => setCopiado(null), 1500) } catch { /* sem clipboard */ }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Links de auditoria por rota</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void ler()} disabled={carregar} aria-label="Recarregar">
          {carregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Página pública com o histórico verificável da conta-mestre de cada estratégia: sinais ligados às operações, pips, R,
          drawdown e risco de ruína. Sem nome, email nem login. Cada membro emite o link da sua própria conta no WebTrader
          (A minha conta → Partilhar).
        </p>
        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
        <ul className="divide-y rounded-lg border">
          {rotas.map((r) => (
            <li key={r.accountId} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.nome}
                  {r.arquivada && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">arquivada</span>}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {r.cicloDesde ? `Conta desde o novo ciclo (${dia(r.cicloDesde)})` : "Histórico completo"}
                  {r.link ? ` · ${r.link.visitas} visita(s)` : " · sem link"}
                </p>
              </div>
              {r.link ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => void copiar(r)} aria-label={`Copiar link de ${r.nome}`}>
                    {copiado === r.accountId ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={r.link.url} target="_blank" rel="noreferrer" aria-label={`Abrir auditoria de ${r.nome}`}><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={ocupado === r.accountId} onClick={() => void agir(r.accountId, "POST", true)}>Novo endereço</Button>
                  <Button size="sm" variant="ghost" disabled={ocupado === r.accountId} onClick={() => void agir(r.accountId, "DELETE")} aria-label={`Desligar link de ${r.nome}`}>
                    <Unlink className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" disabled={ocupado === r.accountId} onClick={() => void agir(r.accountId, "POST")} className="bg-[#D2A63C] text-black hover:bg-[#E9C46A]">
                  {ocupado === r.accountId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Gerar link
                </Button>
              )}
            </li>
          ))}
          {!carregar && !rotas.length && <li className="p-3 text-sm text-muted-foreground">Nenhuma estratégia com conta-mestre.</li>}
        </ul>
      </CardContent>
    </Card>
  )
}
