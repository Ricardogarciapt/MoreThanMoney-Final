"use client"

import { Suspense, useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import MTMcopierManager from "@/components/admin/mtmcopier-manager"
import MtmcopyTestPanel from "@/components/admin/mtmcopy-test-panel"
import MtmcopySenderLog from "@/components/admin/mtmcopy-sender-log"
import MtmcopyStrategyControl from "@/components/admin/mtmcopy-strategy-control"
import MtmcopyTelegramSenders from "@/components/admin/mtmcopy-telegram-senders"
import MtmcopyProviderPipeline from "@/components/admin/mtmcopy-provider-pipeline"
import MtmcopyProviderAccounts from "@/components/admin/mtmcopy-provider-accounts"
import MtmcopySubscriberHealth from "@/components/admin/mtmcopy-subscriber-health"
import MtmcopyFontesVivas from "@/components/admin/mtmcopy-fontes-vivas"
import MtmcopyGlobalPerformance from "@/components/admin/mtmcopy-global-performance"
import { TrailingEstrategias } from "@/components/admin/trailing-estrategias"
import { EstrategiasDesempenho } from "@/components/admin/estrategias-desempenho"
import { EquidadeCasaCard } from "@/components/admin/equidade-casa-card"
import {
  MtmcopyAdminSection,
  MtmcopyAdminTabNav,
  MTMCOPY_ADMIN_TABS,
  TABS_ANTIGAS,
  type MtmcopyAdminTab,
} from "@/components/admin/mtmcopy-admin-shell"
import VisaoGeralCopia from "@/components/admin/mtmauto-copia/visao-geral"
import ContasCopia from "@/components/admin/mtmauto-copia/contas"
import EstrategiasCopia from "@/components/admin/mtmauto-copia/estrategias"
import { Recolhivel } from "@/components/admin/centro/ui"
import CopiaEntreContas from "@/components/admin/mtmauto-copia/copia-entre-contas"
import EventosCopia from "@/components/admin/mtmauto-copia/eventos"
import SincronizacaoCopia from "@/components/admin/mtmauto-copia/sincronizacao"
import ProvidersEquipas from "@/components/admin/mtmauto-copia/providers-equipas"
import DecideNoCentro, { LinksParaOCentro } from "@/components/admin/decide-no-centro"
import MotorMestres from "@/components/admin/mtmauto-copia/motor-mestres"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowLeftRight, Copy, LayoutDashboard, ListTree, Loader2, RefreshCcw, ScrollText, Wallet } from "lucide-react"

/**
 * «MTM Auto · Cópia» — o admin da cópia (antes «Consola MTMcopier»). Rota de sempre /admin/mtmcopy
 * (o alias /admin/mtmauto-copia foi apagado; os links apontam para aqui ou para /admin/centro).
 *
 *   Visão geral · Contas · Estratégias · Cópia entre contas · Eventos · Sincronização
 *
 * O MTM Copy foi descontinuado a 15/09 (direito único direitoMtmAuto). O que era desta consola e
 * continua a fazer falta (senders/rotas provider, controlo de estratégias, trailing, desempenho,
 * testes, log de sinais, gestão detalhada por utilizador) vive DENTRO das secções novas; o que
 * duplicava (sinergia, painel MetaApi, sincronização total antiga, hub de operações) saiu.
 */

function parseTab(raw: string | null, userId: string | null, routeId: string | null): MtmcopyAdminTab {
  const valid = MTMCOPY_ADMIN_TABS.map((t) => t.id)
  if (raw && valid.includes(raw as MtmcopyAdminTab)) return raw as MtmcopyAdminTab
  if (raw && TABS_ANTIGAS[raw]) return TABS_ANTIGAS[raw]
  if (userId) return "contas"
  if (routeId) return "estrategias"
  return "visao"
}

const ICONE = { visao: LayoutDashboard, contas: Wallet, estrategias: ListTree, copia: ArrowLeftRight, eventos: ScrollText, sincronizacao: RefreshCcw }
const DESCRICAO: Record<MtmcopyAdminTab, string> = {
  visao: "Entrega aos subscritores, reconciliação CopyFactory, custo MetaApi, serviços do VPS e últimos erros.",
  contas: "Todas as contas ligadas nos produtos (T2T/site, MTM Auto, WebTrader, MTM Funded): dono, plano, quota MetaApi, estado e para que servem.",
  estrategias: "Motor das mestres (quem executa cada estratégia, sombra/live, contas, ordens, kill-switch), seguidores por plataforma com as divergências — e as afinações.",
  copia: "Rotas conta → conta entre MTM Funded, MT4, MT5 e TradeLocker. Nesta entrega o motor corre só em sombra.",
  eventos: "Registo unificado: o que aconteceu na origem, o que o motor quis fazer no destino, o resultado e a latência.",
  sincronizacao: "«Sincronizar tudo»: pré-visualiza órfãs, estratégias mortas, duplicados e quota; aplica só o que escolheres.",
}

const carregar = <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" /></div>

function PaginaAdminCopia() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || "/admin/mtmcopy"
  const searchParams = useSearchParams()
  const highlightUserId = searchParams.get("userId")
  const highlightRouteId = searchParams.get("routeId")
  const [mounted, setMounted] = useState(false)

  const initialTab = useMemo(() => parseTab(searchParams.get("tab"), highlightUserId, highlightRouteId), [searchParams, highlightUserId, highlightRouteId])
  const [activeTab, setActiveTab] = useState<MtmcopyAdminTab>(initialTab)
  useEffect(() => { setActiveTab(initialTab) }, [initialTab])

  const setTab = useCallback(
    (tab: string) => {
      const t = parseTab(tab, null, null)
      setActiveTab(t)
      const params = new URLSearchParams(searchParams.toString())
      if (t === "visao") params.delete("tab")
      else params.set("tab", t)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, searchParams, pathname],
  )

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    if (!mounted || isLoading) return
    if (!user) { router.replace(`/login?redirect=${pathname}`); return }
    if (!isAdmin) router.replace("/member-area")
  }, [mounted, isLoading, user, isAdmin, router, pathname])

  if (!mounted || isLoading) return carregar
  if (!user || !isAdmin) return null

  const Icone = ICONE[activeTab]
  const titulo = MTMCOPY_ADMIN_TABS.find((t) => t.id === activeTab)?.label ?? ""

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-zinc-950/90 p-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-400 hover:text-[#D2A63C] mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Admin
          </Button>
        </Link>
        <div className="flex items-center gap-2 px-1 mb-4">
          <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/25"><Copy className="h-4 w-4 text-[#D2A63C]" /></div>
          <span className="font-semibold text-sm">MTM Auto · Cópia</span>
        </div>
        <nav className="space-y-1 text-sm">
          {MTMCOPY_ADMIN_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${activeTab === item.id ? "bg-[#D2A63C]/15 text-[#D2A63C] border-l-2 border-[#D2A63C]" : "text-zinc-500 hover:text-white hover:bg-zinc-800/50"}`}
            >
              {item.label}
            </button>
          ))}
          <div className="pt-4 mt-2 border-t border-zinc-800 space-y-1">
            <Link href="/mtmauto" className="block px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/50">Página cliente (MTM Auto)</Link>
            <Link href="/webtrader" className="block px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/50">WebTrader</Link>
          </div>
        </nav>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <header className="border-b border-[#D2A63C]/15 bg-black/40 px-4 sm:px-6 py-4 backdrop-blur-sm sticky top-0 z-20">
          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs text-[#D2A63C] mb-1">Admin · MTM Auto</div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Copy className="w-6 h-6 text-[#D2A63C]" /> MTM Auto · Cópia</h1>
          </div>
          <MtmcopyAdminTabNav active={activeTab} onChange={setTab} />
        </header>

        <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
          <MtmcopyAdminSection title={titulo} description={DESCRICAO[activeTab]} icon={Icone} accent={activeTab === "copia" ? "sky" : activeTab === "sincronizacao" ? "violet" : "gold"}>
            {activeTab === "visao" && <VisaoGeralCopia irPara={setTab} />}

            {activeTab === "contas" && (
              <ContasCopia
                userIdInicial={highlightUserId}
                extraPorUtilizador={
                  <Recolhivel titulo="Gestão detalhada deste utilizador" descricao="Lotes, prop firm, trailing, ligações MT5 e histórico — o gestor de sempre." aberto={Boolean(highlightUserId)}>
                    <MTMcopierManager highlightUserId={highlightUserId} />
                  </Recolhivel>
                }
              />
            )}

            {/* 05/10: o Centro é o único sítio onde se DECIDE uma estratégia. Aqui mostra-se o estado
                (painéis dentro de DecideNoCentro, só leitura) e o diagnóstico continua vivo. A criação de
                provider externo saiu daqui (duplicado) — está em Centro › Estratégias › Motor e criação. */}
            {activeTab === "estrategias" && (
              <EstrategiasCopia
                topo={
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/[0.05] p-3">
                      <p className="mb-2 text-[12.5px] text-zinc-200">Esta página é de <b>diagnóstico</b>. Mudar o que uma estratégia faz (modos, trailing, rotas, T2T, opções, apagar) faz-se na página dela no Centro.</p>
                      <LinksParaOCentro />
                    </div>
                    <DecideNoCentro titulo="Motor das mestres"><MotorMestres /></DecideNoCentro>
                  </div>
                }
                afinacoes={
                  <div className="space-y-3 pt-2">
                    <Recolhivel titulo="Providers por equipa (MTM Auto)" descricao="Contas de estratégia de cada equipa — MT4/MT5 na chave certa, MTM Funded e TradeLocker — e as rotas de cópia que as usam como fonte.">
                      <ProvidersEquipas />
                    </Recolhivel>
                    <Recolhivel titulo="Fontes · estado real" descricao="Cada estratégia, a conta que a publica e o que a MetaApi diz sobre ela.">
                      <MtmcopyFontesVivas />
                    </Recolhivel>
                    <Recolhivel titulo="Controlo das estratégias (só leitura)" descricao="On/off por estratégia, limites dos perps e trailing — o estado; muda-se no Centro.">
                      <DecideNoCentro titulo="Controlo e trailing"><div className="space-y-6"><MtmcopyStrategyControl /><TrailingEstrategias /></div></DecideNoCentro>
                    </Recolhivel>
                    <Recolhivel titulo="Desempenho e equidade" descricao="Resultados por estratégia e equidade da casa.">
                      <div className="space-y-6"><EstrategiasDesempenho /><EquidadeCasaCard /></div>
                    </Recolhivel>
                    <Recolhivel titulo="Saúde das ligações (regras de risco)" descricao="Multiplicador sem risco, T2T com grupos, sem baseline, MT5 em erro.">
                      <MtmcopySubscriberHealth />
                    </Recolhivel>
                    <Recolhivel titulo="Senders · Telegram e chats (só leitura)" aberto={Boolean(highlightRouteId)}>
                      <DecideNoCentro titulo="Senders"><MtmcopyTelegramSenders /></DecideNoCentro>
                    </Recolhivel>
                    <Recolhivel titulo="Rotas provider (só leitura)" aberto={Boolean(highlightRouteId)}>
                      <DecideNoCentro titulo="Rotas provider"><MtmcopyProviderPipeline initialRouteId={highlightRouteId} /></DecideNoCentro>
                    </Recolhivel>
                    <Recolhivel titulo="Contas provider (mestre, só leitura)">
                      <DecideNoCentro titulo="Contas provider"><MtmcopyProviderAccounts /></DecideNoCentro>
                    </Recolhivel>
                    <Recolhivel titulo="Testes · provider e Telegram">
                      <MtmcopyTestPanel />
                    </Recolhivel>
                    <Recolhivel titulo="Visão global do sistema" descricao="Performance agregada de todas as contas (só admin).">
                      <MtmcopyGlobalPerformance />
                    </Recolhivel>
                  </div>
                }
              />
            )}

            {activeTab === "copia" && <CopiaEntreContas userIdInicial={highlightUserId} />}

            {activeTab === "eventos" && <EventosCopia sinais={<MtmcopySenderLog />} />}

            {activeTab === "sincronizacao" && <SincronizacaoCopia />}
          </MtmcopyAdminSection>
        </div>
      </main>
    </div>
  )
}

export default function AdminMtmautoCopiaPage() {
  return (
    <Suspense fallback={carregar}>
      <PaginaAdminCopia />
    </Suspense>
  )
}
