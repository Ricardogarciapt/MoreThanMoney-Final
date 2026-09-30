"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarClock,
  Gauge,
  Scissors,
  LayoutDashboard,
  Users,
  FileText,
  Bell,
  Settings,
  Wallet,
  ArrowLeft,
  Shield,
  GraduationCap,
  Store,
  Brain,
  Network,
  Send,
  Ticket,
  Inbox,
  Film,
  Award,
  Instagram,
  Rocket,
  KeyRound,
  Trophy,
  ChevronDown,
  ArrowLeftRight,
  Mail,
  Menu,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Barra lateral do /admin.
 *
 * Era uma lista corrida de 21 ligações pela ordem em que as páginas foram construídas — ninguém
 * lê uma lista dessas, procura-se. Agora vai por NEGÓCIO (formação, trading, marketing,
 * administração), que é a pergunta que se faz antes de clicar: «isto é de quê?».
 *
 * Dois tipos de entrada convivem de propósito:
 *   - `tab`  — secções da própria página /admin (botões, trocam o conteúdo à direita).
 *   - `link` — páginas com vida própria (/admin/social, /admin/centro, ...).
 * Quem usa não tem de saber a diferença, por isso são pintados igual.
 */

type Item =
  | { tipo: "tab"; id: string; rotulo: string; icone: typeof Users; nota?: string }
  | {
      tipo: "link"
      href: string
      rotulo: string
      icone: typeof Users
      /** Prefixos de rota que também acendem esta entrada (a própria href é sempre incluída). */
      prefixos?: string[]
      nota?: string
      /** Entrada dependente da de cima (indentada e mais apagada). Ex.: a página antiga da cópia. */
      secundaria?: boolean
    }

type Grupo = { id: string; titulo: string; itens: Item[] }

/**
 * Os grupos batem certo com os negócios da casa, não com as pastas do repositório.
 * Administração fica em primeiro porque é onde /admin abre por omissão (secção «overview»).
 */
const GRUPOS: Grupo[] = [
  {
    id: "administracao",
    titulo: "Administração",
    itens: [
      { tipo: "tab", id: "overview", rotulo: "Visão geral", icone: LayoutDashboard },
      { tipo: "tab", id: "users", rotulo: "Utilizadores", icone: Users },
      { tipo: "tab", id: "notifications", rotulo: "Notificações", icone: Bell },
      { tipo: "tab", id: "settings", rotulo: "Configurações", icone: Settings },
    ],
  },
  {
    id: "formacao",
    titulo: "Formação",
    itens: [
      { tipo: "tab", id: "content", rotulo: "Conteúdo", icone: FileText },
      { tipo: "tab", id: "education", rotulo: "Educação (LMS)", icone: GraduationCap },
      { tipo: "tab", id: "dvr", rotulo: "Gravações DVR", icone: Film },
      { tipo: "tab", id: "avaliacoes", rotulo: "Avaliações", icone: Award },
    ],
  },
  {
    id: "trading",
    titulo: "Trading, cópia e funded",
    itens: [
      // O nome no menu dizia só «Centro de Controlo» e por isso confundia-se com o Centro de
      // comando. O que a página é, de facto, é o console do MTM Auto.
      //
      // A «Cópia (página antiga)» (/admin/mtmcopy) saiu do menu a 29/09/2026, a pedido do dono:
      // o Centro já tem a cadeia inteira, com o quadro de arrastar. A PÁGINA continua a existir —
      // não a apaguei — para quem tiver um atalho guardado; o que deixou de existir é o convite.
      {
        tipo: "link",
        href: "/admin/centro",
        rotulo: "Centro de Controlo MTM Auto",
        icone: Send,
        prefixos: ["/admin/centro/", "/admin/mtmcopy"],
      },
      { tipo: "tab", id: "mtmfunded", rotulo: "MTM Funded & Torneios", icone: Trophy },
      { tipo: "link", href: "/admin/licencas", rotulo: "Licenças do EA", icone: KeyRound },
      { tipo: "link", href: "/admin/portfolios", rotulo: "Portfolios", icone: Wallet },
    ],
  },
  {
    id: "marketing",
    titulo: "Marketing e vendas",
    itens: [
      { tipo: "link", href: "/admin/sales-machine", rotulo: "Máquina de Vendas", icone: Rocket },
      {
        tipo: "link",
        href: "/admin/social",
        rotulo: "Conteúdo Social",
        icone: Instagram,
        prefixos: ["/admin/social/"],
      },
      // Ao lado do Conteúdo Social de propósito: os clips acabam na mesma fila de publicação.
      {
        tipo: "link",
        href: "/admin/videocliper",
        rotulo: "Videocliper",
        icone: Scissors,
        prefixos: ["/admin/videocliper/"],
      },
      // Existia a página mas não existia a ligação: só se lá chegava pelo Centro de comando.
      { tipo: "link", href: "/admin/broadcast", rotulo: "Email em massa", icone: Mail },
      { tipo: "link", href: "/admin/forms", rotulo: "Formulários", icone: Inbox },
      { tipo: "link", href: "/admin/coupons", rotulo: "Cupões de Oferta", icone: Ticket },
      // Ao lado dos cupões de propósito: um cupão de âmbito marketplace desconta um produto
      // daqui, e quem anda a criar campanhas mexe nos dois no mesmo minuto.
      { tipo: "tab", id: "marketplace", rotulo: "Marketplace", icone: Store },
      // A agenda vive aqui e não em «Formação»: quem marca uma chamada é um lead, e quem trata de
      // leads passa o dia nesta categoria.
      { tipo: "tab", id: "agenda", rotulo: "Agenda de chamadas", icone: CalendarClock },
      { tipo: "link", href: "/admin/backoffice", rotulo: "MLM / Afiliados", icone: Network },
      // Desde 08/2026 esta página é só agentes, n8n e streaming — e a maior parte dos agentes
      // é de prospeção, setting e conteúdo. É aqui que pertence, não ao pé do Centro de comando.
      {
        tipo: "link",
        href: "/dashboard-gestao",
        rotulo: "Agentes e automações",
        icone: Brain,
        prefixos: ["/dashboard-gestao"],
        nota: "Dashboard Gestão",
      },
    ],
  },
]

const CHAVE_ESTADO = "mtm.admin.sidebar.grupos"

function lerEstadoGuardado(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const cru = window.localStorage.getItem(CHAVE_ESTADO)
    if (!cru) return {}
    const v = JSON.parse(cru)
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {}
  } catch {
    // localStorage bloqueado (Safari privado, por exemplo) não pode partir o menu.
    return {}
  }
}

export default function AdminSidebar({
  activeSection,
  onSectionChange,
  skoolPendingCount = 0,
}: {
  activeSection: string
  onSectionChange: (id: string) => void
  skoolPendingCount?: number
}) {
  const pathname = usePathname() ?? ""
  const [fechados, setFechados] = useState<Record<string, boolean>>({})
  const [abertoMobile, setAbertoMobile] = useState(false)

  // Só depois de montar: ler localStorage no primeiro render dava hidratação diferente do servidor.
  useEffect(() => setFechados(lerEstadoGuardado()), [])

  const naRaizDoAdmin = pathname === "/admin"

  const estaAtivo = useCallback(
    (item: Item) => {
      if (item.tipo === "tab") return naRaizDoAdmin && activeSection === item.id
      if (pathname === item.href) return true
      return (item.prefixos ?? []).some((p) => pathname === p || pathname.startsWith(p))
    },
    [activeSection, naRaizDoAdmin, pathname]
  )

  /** O grupo do item activo fica sempre aberto, tenha ou não sido fechado à mão. */
  const grupoAtivo = useMemo(
    () => GRUPOS.find((g) => g.itens.some(estaAtivo))?.id ?? null,
    [estaAtivo]
  )

  const alternar = useCallback((id: string) => {
    setFechados((anterior) => {
      const seguinte = { ...anterior, [id]: !anterior[id] }
      try {
        window.localStorage.setItem(CHAVE_ESTADO, JSON.stringify(seguinte))
      } catch {
        // Guardar é conveniência, não requisito.
      }
      return seguinte
    })
  }, [])

  const classesItem = (ativo: boolean, secundaria = false) =>
    cn(
      "flex w-full items-center gap-3 rounded-lg py-2 pr-3 text-sm transition-colors",
      secundaria ? "pl-8 text-[13px]" : "pl-3",
      ativo
        // O activo mal se distinguia de um hover. Agora é dourado cheio sobre preto: vê-se de
        // relance, que é a única coisa que se lhe pede.
        ? "bg-[#D2A63C] font-semibold text-black shadow-[0_0_0_1px_rgba(210,166,60,0.5)]"
        : cn(
            "font-medium hover:bg-gray-800/60 hover:text-white",
            secundaria ? "text-gray-500" : "text-gray-400"
          )
    )

  const conteudoItem = (item: Item, ativo: boolean) => {
    const Icone = item.icone
    const badge = item.tipo === "tab" && item.id === "users" ? skoolPendingCount : 0
    return (
      <>
        <Icone className={cn("shrink-0", item.tipo === "link" && item.secundaria ? "h-4 w-4" : "h-5 w-5")} />
        <span className="flex-1 truncate text-left">{item.rotulo}</span>
        {badge > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              ativo ? "bg-black text-[#D2A63C]" : "bg-amber-500 text-black"
            )}
          >
            {badge}
          </span>
        )}
      </>
    )
  }

  const navegacao = (
    <nav className="flex-1 space-y-1 overflow-y-auto p-2">
      {/* O comando fica em cima de tudo, e destacado: é o sítio de onde se parte. Sem isto era
          mais uma ligação no meio de vinte, e o primeiro clique de quem entra voltava a ser
          um palpite. */}
      <Link
        href="/admin/comando"
        onClick={() => setAbertoMobile(false)}
        className={cn(
          "mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
          pathname === "/admin/comando"
            ? "bg-[#D2A63C] text-black"
            : "bg-[#D2A63C]/15 text-[#D2A63C] ring-1 ring-[#D2A63C]/30 hover:bg-[#D2A63C]/25"
        )}
      >
        <Gauge className="h-5 w-5 shrink-0" />
        Centro de comando
      </Link>

      {GRUPOS.map((grupo) => {
        const aberto = grupo.id === grupoAtivo || !fechados[grupo.id]
        return (
          <div key={grupo.id} className="pb-1">
            <button
              type="button"
              onClick={() => alternar(grupo.id)}
              aria-expanded={aberto}
              className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-[#D2A63C]"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !aberto && "-rotate-90")}
              />
              <span className="flex-1 text-left">{grupo.titulo}</span>
            </button>

            {aberto && (
              <div className="mt-0.5 space-y-0.5">
                {grupo.itens.map((item) => {
                  const ativo = estaAtivo(item)
                  if (item.tipo === "tab") {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSectionChange(item.id)
                          setAbertoMobile(false)
                        }}
                        className={classesItem(ativo)}
                        title={item.nota}
                      >
                        {conteudoItem(item, ativo)}
                      </button>
                    )
                  }
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAbertoMobile(false)}
                      className={classesItem(ativo, item.tipo === "link" ? item.secundaria : false)}
                      title={item.nota}
                    >
                      {conteudoItem(item, ativo)}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Em ecrã pequeno a barra saía do lado e comia 256px ao conteúdo. Passa a gaveta, e o
          botão vive em baixo à esquerda para não tapar o título da página. */}
      <button
        type="button"
        onClick={() => setAbertoMobile(true)}
        aria-label="Abrir menu de administração"
        className="fixed bottom-4 left-4 z-40 rounded-full bg-[#D2A63C] p-3 text-black shadow-lg shadow-black/50 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {abertoMobile && (
        <div
          role="presentation"
          onClick={() => setAbertoMobile(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          "z-50 flex w-64 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-gray-950/95 backdrop-blur-sm",
          "fixed inset-y-0 left-0 transition-transform lg:static lg:translate-x-0 lg:transition-none",
          abertoMobile ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 border-b border-[#D2A63C]/15 p-4">
          <Link href="/new-landing" className="min-w-0 flex-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-400 hover:bg-[#D2A63C]/10 hover:text-[#D2A63C]"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao site
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => setAbertoMobile(false)}
            aria-label="Fechar menu"
            className="rounded p-1.5 text-gray-400 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/25">
            <Shield className="h-5 w-5 text-[#D2A63C]" />
          </div>
          <span className="font-semibold tracking-tight text-white">Admin</span>
        </div>

        {navegacao}
      </aside>
    </>
  )
}
