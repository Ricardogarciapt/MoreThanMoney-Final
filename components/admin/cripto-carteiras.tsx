"use client"

/**
 * AS CARTEIRAS DO AGENTE (/admin/cripto) — o que lá está agora, lido na blockchain.
 *
 * Carteira Solana (memecoins na Pump.fun/Jupiter): SOL, USDC e cada token, com valor de agora; QR e
 * endereço para depositar; atalhos para a ver no Solscan, na Pump.fun e na Jupiter. AURUM (perps) à
 * parte, só a parte do agente. E o histórico dos envios de lucros.
 *
 * O ecrã nunca vê a chave privada. Para abrir a carteira no Phantom, o dono exporta-a no SEU
 * terminal (comando abaixo); a chave aparece lá e em mais lado nenhum.
 */

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Copy, ExternalLink, KeyRound, Loader2, RefreshCw, Wallet } from "lucide-react"

type Linha = Record<string, any>

const CAIXA = "rounded-lg border border-gray-800 bg-gray-900/60 p-4"
const usd = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`)
const qtd = (v: number) => v.toLocaleString("pt-PT", { maximumFractionDigits: v < 1 ? 6 : v < 1000 ? 4 : 0 })
const hora = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—")
const curto = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`
const EXPORTAR = `ssh -t mtm-stream 'sudo -u mtm-cripto env $(sudo cat /etc/mtm-cripto/executor.env | xargs) node /opt/mtm/cripto-executor/executor.js --exportar-chave'`

export default function CriptoCarteiras() {
  const { toast } = useToast()
  const [d, setD] = useState<Linha | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [qr, setQr] = useState<Record<string, string>>({})
  const [verChave, setVerChave] = useState(false)

  const carregar = useCallback(async () => {
    setOcupado(true)
    try {
      const r = await fetch("/api/admin/cripto/carteiras").then((x) => x.json())
      if (r.ok) setD(r)
    } finally {
      setOcupado(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
    const t = setInterval(() => void carregar(), 60_000)
    return () => clearInterval(t)
  }, [carregar])

  useEffect(() => {
    for (const c of (d?.solana ?? []) as Linha[]) {
      if (qr[c.endereco]) continue
      // `solana:` é o esquema que o Phantom e o Solflare abrem directamente para enviar.
      void QRCode.toDataURL(`solana:${c.endereco}`, { margin: 1, width: 168, color: { dark: "#0b0b0d", light: "#E9C46A" } })
        .then((url) => setQr((q) => ({ ...q, [c.endereco]: url })))
    }
  }, [d, qr])

  const copiar = (t: string, o = "Copiado") => { void navigator.clipboard.writeText(t); toast({ title: o }) }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-200"><Wallet className="h-4 w-4 text-[#D2A63C]" /> Carteiras</p>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {d && <span>lido na blockchain {hora(d.lidoEm)}</span>}
          <Button variant="ghost" size="sm" onClick={() => void carregar()} disabled={ocupado}>{ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</Button>
        </div>
      </div>

      {!d ? (
        <div className={`${CAIXA} flex items-center gap-2 text-sm text-gray-500`}><Loader2 className="h-4 w-4 animate-spin" /> A ler as carteiras…</div>
      ) : (
        <div className="space-y-3">
          {(d.solana as Linha[]).length === 0 && (
            <div className={`${CAIXA} text-sm text-gray-500`}>Ainda nenhuma carteira: nasce no 1.º arranque do executor na VPS.</div>
          )}

          {(d.solana as Linha[]).map((c) => (
            <div key={c.endereco} className={CAIXA}>
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="shrink-0">
                  {qr[c.endereco] ? <img src={qr[c.endereco]} alt="QR do endereço" className="h-[168px] w-[168px] rounded-md" /> : <div className="h-[168px] w-[168px] rounded-md bg-gray-800" />}
                  <p className="mt-1 text-center text-[10px] text-gray-500">deposita USDC + ~0,05 SOL<br />só na rede Solana</p>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#D2A63C]/15 px-2 py-0.5 text-[11px] text-[#E9C46A]">Solana · {c.papel === "trading" ? "memecoins (Pump.fun / Jupiter)" : c.papel}</span>
                    {!c.lidoOk && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">RPC não respondeu, a tentar de novo</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="truncate rounded bg-black px-2 py-1 text-xs text-[#E9C46A]" title={c.endereco}>{c.endereco}</code>
                    <Button size="sm" variant="ghost" onClick={() => copiar(c.endereco, "Endereço copiado")}><Copy className="h-4 w-4" /></Button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-6">
                    <div><p className="text-[11px] uppercase tracking-wider text-gray-500">Total agora</p><p className="text-2xl font-semibold tabular-nums text-[#D2A63C]">{usd(c.totalUsd)}</p></div>
                    <div><p className="text-[11px] uppercase tracking-wider text-gray-500">SOL (taxas)</p><p className="text-sm tabular-nums text-gray-200">{c.sol == null ? "—" : qtd(c.sol)} <span className="text-gray-500">· {usd(c.valorSol)}</span></p>{c.sol != null && c.sol < 0.02 && <p className="text-[11px] text-amber-300">pouco SOL: sem isto não há swaps</p>}</div>
                    <div><p className="text-[11px] uppercase tracking-wider text-gray-500">Desde</p><p className="text-sm text-gray-300">{hora(c.criada_em)}</p></div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["Solscan", `https://solscan.io/account/${c.endereco}`],
                      ["Pump.fun", `https://pump.fun/profile/${c.endereco}`],
                      ["Jupiter", `https://jup.ag/portfolio/${c.endereco}`],
                    ].map(([n, h]) => (
                      <a key={n} href={h} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:border-[#D2A63C] hover:text-[#E9C46A]">{n} <ExternalLink className="h-3 w-3" /></a>
                    ))}
                    <button onClick={() => setVerChave((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:border-[#D2A63C] hover:text-[#E9C46A]"><KeyRound className="h-3 w-3" /> Abrir no Phantom</button>
                  </div>
                  {verChave && (
                    <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-100/90">
                      <p className="mb-1">A chave privada nunca passa por este ecrã. Corre isto no Terminal do Mac: aparece só aí, uma vez. Importa-a no Phantom (Adicionar carteira → Importar chave privada), guarda-a no gestor de palavras-passe e fecha o terminal.</p>
                      <div className="flex items-center gap-2">
                        <code className="block flex-1 overflow-x-auto whitespace-nowrap rounded bg-black px-2 py-1 text-[11px] text-gray-300">{EXPORTAR}</code>
                        <Button size="sm" variant="ghost" onClick={() => copiar(EXPORTAR, "Comando copiado")}><Copy className="h-4 w-4" /></Button>
                      </div>
                      <p className="mt-1 text-red-200/70">Com a carteira no Phantom, qualquer movimento que lá faças conta para o agente: ele lê o saldo a cada minuto e ajusta-se.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full">
                  <thead className="bg-gray-900/80"><tr>{["Token", "Quantidade", "Preço", "Valor", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-500">{h}</th>)}</tr></thead>
                  <tbody>
                    {(c.tokens as Linha[]).length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-3 text-sm text-gray-500">Sem tokens. Os comprados na Pump.fun/Jupiter aparecem aqui.</td></tr>
                    ) : (c.tokens as Linha[]).map((t) => (
                      <tr key={t.mint} className="border-t border-gray-800 text-sm text-gray-300">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            {t.icone ? <img src={t.icone} alt="" className="h-5 w-5 rounded-full" /> : <span className="h-5 w-5 rounded-full bg-gray-800" />}
                            <span className="font-medium">{t.simbolo}</span>
                            <span className="hidden text-[11px] text-gray-500 md:inline">{t.nome}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{qtd(t.quantidade)}</td>
                        <td className="px-3 py-2 tabular-nums">{t.precoUsd == null ? "—" : t.precoUsd < 0.01 ? `${t.precoUsd.toPrecision(3)} $` : usd(t.precoUsd)}</td>
                        <td className="px-3 py-2 tabular-nums text-[#E9C46A]">{usd(t.valorUsd)}</td>
                        <td className="px-3 py-2"><a href={`https://solscan.io/token/${t.mint}`} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-[#E9C46A]" title={curto(t.mint)}><ExternalLink className="h-3.5 w-3.5" /></a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="grid gap-3 md:grid-cols-2">
            <div className={CAIXA}>
              <p className="mb-1 text-sm font-medium">AURUM · Bybit (perps)</p>
              <p className="text-[11px] text-gray-500">Mestre do Copy Trading. Aqui só a parte do agente; o lucro fica na AURUM.</p>
              <div className="mt-2 flex gap-6">
                <div><p className="text-[11px] uppercase tracking-wider text-gray-500">Equity do agente</p><p className="text-lg font-semibold tabular-nums">{usd(d.aurum?.equity)}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider text-gray-500">Livre</p><p className="text-lg tabular-nums text-gray-300">{usd(d.aurum?.livre)}</p></div>
              </div>
              <p className="mt-1 text-[11px] text-gray-600">lido {hora(d.aurum?.em)}</p>
            </div>
            <div className={CAIXA}>
              <p className="mb-2 text-sm font-medium">Envios de lucros</p>
              {(d.envios as Linha[]).length === 0 ? <p className="text-sm text-gray-500">Ainda nenhum. Às 00:00 UTC o lucro acima da base vai para o teu endereço.</p> : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto">
                  {(d.envios as Linha[]).map((e) => (
                    <div key={`${e.modo}-${e.inicio}`} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{hora(e.inicio)} · <span className={e.varredura_estado === "enviada" ? "text-emerald-400" : e.varredura_estado === "falhada" ? "text-red-400" : "text-gray-400"}>{e.varredura_estado}</span>{e.modo === "papel" ? " (papel)" : ""}</span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {usd(e.varredura_usd)}
                        {e.varredura_tx && <a href={`https://solscan.io/tx/${String(e.varredura_tx).split(" ")[0]}`} target="_blank" rel="noreferrer" className="text-[#D2A63C]"><ExternalLink className="h-3 w-3" /></a>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
