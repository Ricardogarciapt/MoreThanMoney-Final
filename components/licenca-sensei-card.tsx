"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { KeyRound, Copy, Check, Loader2, ExternalLink, Download } from "lucide-react"

type Produto = "sensei_ea" | "sensei_scalp" | "premium_scanner_ea"

interface Licenca {
  id: string
  chave: string
  produto: Produto
  produtoNome: string
  plano: "anual" | "vitalicia" | "incluida"
  estado: "ativa" | "revogada" | "expirada"
  mt5_login: string | null
  contas_permitidas: number
  expira_em: string | null
  criada_em: string
}

/** O ZIP de cada EA, para quem já tem a chave ter logo onde a usar. */
const DOWNLOAD: Record<Produto, string> = {
  sensei_ea: "/downloads/MTM-Sensei-EA.zip",
  sensei_scalp: "/downloads/MTM-Sensei-Scalp.zip",
  premium_scanner_ea: "/downloads/MTM-Premium-Scanner-EA.zip",
}

function nomePlano(p: Licenca["plano"]) {
  return p === "incluida" ? "Incluída na subscrição" : p === "vitalicia" ? "Vitalícia" : "Anual"
}

interface Resposta {
  licencas: Licenca[]
  direitos: {
    podeEmitir: boolean
    temDireito: boolean
    jaEmitida: boolean
    motivo: "admin" | "vip" | "premium" | null
  }
  precos: { anual: number; vitalicia: number }
}

/**
 * A licença do MTM Sensei EA na área de membro.
 *
 * Quem é Premium/VIP/admin emite a sua aqui, de graça, escrevendo o número da conta MT5 — é esse
 * número que prende a licença, por ser a única coisa que o EA não consegue inventar na máquina do
 * cliente. Quem não tem esse direito vê o caminho para a comprar, em vez de um cartão vazio.
 */
export function LicencaSenseiCard() {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [login, setLogin] = useState("")
  const [aEmitir, setAEmitir] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiada, setCopiada] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/licencas")
      if (!r.ok) return
      setDados(await r.json())
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function emitir() {
    setErro(null)
    setAEmitir(true)
    try {
      const r = await fetch("/api/licencas/emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mt5Login: login }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Não foi possível emitir a licença")
      setLogin("")
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setAEmitir(false)
    }
  }

  if (aCarregar) {
    return (
      <Card className="bg-gray-900/50 border-[#D2A63C]/30">
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
        </CardContent>
      </Card>
    )
  }

  if (!dados) return null

  // Revogadas não interessam ao membro (são duplicadas ou retiradas); expiradas mostram-se para
  // ele saber que tem de renovar.
  const visiveis = dados.licencas.filter((l) => l.estado !== "revogada")
  const temSensei = visiveis.some((l) => l.produto === "sensei_ea" && l.estado === "ativa")
  const temScalp = visiveis.some((l) => l.produto === "sensei_scalp" && l.estado === "ativa")

  function copiar(chave: string) {
    void navigator.clipboard.writeText(chave)
    setCopiada(chave)
    setTimeout(() => setCopiada(null), 1500)
  }

  return (
    <Card className="bg-gray-900/50 border-[#D2A63C]/30">
      <CardHeader>
        <CardTitle className="text-[#D2A63C] flex items-center">
          <KeyRound className="w-5 h-5 mr-2" />
          {visiveis.length > 0 ? "As tuas licenças (MetaTrader 5)" : "Licença do MTM Sensei (MetaTrader 5)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visiveis.length > 0 && (
          <>
            <div className="space-y-3">
              {visiveis.map((l) => (
                <div
                  key={l.id}
                  className={`rounded-lg border bg-black/40 p-4 ${
                    l.estado === "ativa" ? "border-[#D2A63C]/30" : "border-gray-800 opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{l.produtoNome}</span>
                    {l.estado !== "ativa" && (
                      <Badge variant="outline" className="border-red-500/40 text-red-400">
                        Expirada
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-base sm:text-lg tracking-widest text-[#D2A63C] break-all">
                      {l.chave}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copiar(l.chave)}
                        className="text-gray-400 hover:text-white"
                        aria-label="Copiar a chave"
                      >
                        {copiada === l.chave ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <a href={DOWNLOAD[l.produto]} download aria-label="Descarregar a EA">
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                          <Download className="w-4 h-4" />
                        </Button>
                      </a>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
                    <Badge variant="outline" className="border-gray-700 text-gray-300">
                      {nomePlano(l.plano)}
                    </Badge>
                    <span className="self-center">
                      {l.mt5_login
                        ? `Conta MT5: ${l.mt5_login}`
                        : l.contas_permitidas > 1
                          ? `Até ${l.contas_permitidas} contas MT5`
                          : "Conta MT5: prende-se na 1.ª utilização"}
                    </span>
                    <span className="self-center">
                      · {l.expira_em
                        ? `válida até ${new Date(l.expira_em).toLocaleDateString("pt-PT")}`
                        : "sem prazo"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-sm text-gray-400 space-y-1">
              <p>
                No MetaTrader: <strong className="text-gray-200">Ferramentas → Opções → Expert
                Advisors</strong>, liga &quot;Permitir WebRequest para os seguintes URLs&quot; e
                acrescenta <code className="text-[#D2A63C]">https://www.morethanmoney.pt</code>.
              </p>
              <p>Depois cola a chave da EA certa no campo &quot;Licença&quot; ao pô-la no gráfico — cada EA tem a sua.</p>
            </div>

            {temSensei && (
              <a href="/api/sensei-ea/guia" target="_blank" rel="noopener noreferrer" className="inline-block">
                <Button variant="ghost" className="text-gray-400 hover:text-white px-0">
                  Guia do Sensei EA em PDF
                  <ExternalLink className="w-3.5 h-3.5 ml-2" />
                </Button>
              </a>
            )}
          </>
        )}

        {temSensei ? null : dados.direitos.podeEmitir ? (
          <>
            <p className="text-sm text-gray-400">
              A tua subscrição inclui uma licença do Expert Advisor para{" "}
              <strong className="text-gray-200">uma conta MT5</strong>. Escreve o número da conta
              onde o vais usar — só dígitos.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={login}
                onChange={(e) => setLogin(e.target.value.replace(/\D/g, ""))}
                placeholder="Ex.: 34368570"
                inputMode="numeric"
                className="max-w-[220px] bg-black/40 border-gray-700 text-white font-mono"
              />
              <Button
                onClick={emitir}
                disabled={aEmitir || login.length < 4}
                className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-medium"
              >
                {aEmitir ? <Loader2 className="w-4 h-4 animate-spin" /> : "Emitir licença"}
              </Button>
            </div>
            {erro && <p className="text-sm text-red-400">{erro}</p>}
            <p className="text-xs text-gray-600">
              A conta pode ser mudada depois — pede-nos e libertamos a licença.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400">
              O MTM Sensei para MetaTrader 5 vende-se à parte: {dados.precos.anual} €/ano ou{" "}
              {dados.precos.vitalicia} € vitalício. Está incluído na subscrição Premium.
            </p>
            <Link href="/sensei-ea" className="inline-block">
              <Button className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-medium">
                Ver o MTM Sensei EA
              </Button>
            </Link>
          </>
        )}
        {/* A SEGUNDA EA vive no mesmo separador, mas com uma linha a separar e a dizer que é
            outra coisa. Não tem botão de emitir porque não é incluída em nenhum plano: quem a
            quer, compra. Pôr aqui um "emitir" que dá erro seria pior do que não pôr nada. */}
        {!temScalp && (
        <div className="mt-6 pt-5 border-t border-gray-800">
          <p className="text-xs uppercase tracking-wider text-gray-500">Outra EA</p>
          <h3 className="mt-1 font-semibold text-white">Sensei Scalp Edition</h3>
          <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">
            Scalper de ouro em M5 — ordens pendentes, trailing imediato e sem stop loss fixo. É uma
            ferramenta diferente do Sensei EA, com licença própria: 200 €/ano ou 697 € vitalícia.
            Não está incluída no Premium.
          </p>
          <Link href="/sensei-scalp" className="mt-3 inline-block">
            <Button variant="outline" size="sm" className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10">
              Ver a Scalp Edition
            </Button>
          </Link>
        </div>
        )}
      </CardContent>
    </Card>
  )
}
