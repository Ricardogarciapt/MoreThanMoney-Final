"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { KeyRound, Copy, Check, Loader2, ExternalLink } from "lucide-react"

interface Licenca {
  id: string
  chave: string
  plano: "anual" | "vitalicia" | "incluida"
  estado: "ativa" | "revogada" | "expirada"
  mt5_login: string | null
  expira_em: string | null
  criada_em: string
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
  const [copiada, setCopiada] = useState(false)

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

  const ativa = dados.licencas.find((l) => l.estado === "ativa")

  return (
    <Card className="bg-gray-900/50 border-[#D2A63C]/30">
      <CardHeader>
        <CardTitle className="text-[#D2A63C] flex items-center">
          <KeyRound className="w-5 h-5 mr-2" />
          Licença do MTM Sensei (MetaTrader 5)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ativa ? (
          <>
            <div className="rounded-lg border border-[#D2A63C]/30 bg-black/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-lg tracking-widest text-[#D2A63C]">
                  {ativa.chave}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(ativa.chave)
                    setCopiada(true)
                    setTimeout(() => setCopiada(false), 1500)
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  {copiada ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-400">
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  {ativa.plano === "incluida"
                    ? "Incluída na subscrição"
                    : ativa.plano === "vitalicia"
                      ? "Vitalícia"
                      : "Anual"}
                </Badge>
                <span className="self-center">
                  Conta MT5: {ativa.mt5_login || "prende-se na 1.ª utilização"}
                </span>
                {ativa.expira_em && (
                  <span className="self-center">
                    · válida até {new Date(ativa.expira_em).toLocaleDateString("pt-PT")}
                  </span>
                )}
              </div>
            </div>

            <div className="text-sm text-gray-400 space-y-1">
              <p>
                No MetaTrader: <strong className="text-gray-200">Ferramentas → Opções → Expert
                Advisors</strong>, liga &quot;Permitir WebRequest para os seguintes URLs&quot; e
                acrescenta <code className="text-[#D2A63C]">https://www.morethanmoney.pt</code>.
              </p>
              <p>Depois cola a chave no campo &quot;Licença&quot; ao pôr o EA no gráfico.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href="/downloads/MTM-Sensei-EA.zip" download>
                <Button variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C]">
                  Descarregar o EA e os presets
                </Button>
              </a>
              <a href="/api/sensei-ea/guia" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" className="text-gray-400 hover:text-white">
                  Guia em PDF
                  <ExternalLink className="w-3.5 h-3.5 ml-2" />
                </Button>
              </a>
            </div>
          </>
        ) : dados.direitos.podeEmitir ? (
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
      </CardContent>
    </Card>
  )
}
