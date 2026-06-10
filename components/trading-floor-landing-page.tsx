"use client"

import Link from "next/link"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, BarChart3, Briefcase, Network, Target, TrendingUp, Users } from "lucide-react"

const WHATSAPP_LINK = "https://wa.link/yyml5v"

export default function TradingFloorLandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/new-landing" className="flex items-center gap-3">
            <Image src="/logo-new.png" alt="MoreThanMoney" width={512} height={512} className="h-9 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/work">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Ver Work
              </Button>
            </Link>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
              <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">Candidatar-me</Button>
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <Badge className="mb-5 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">MTM Trading Floor</Badge>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight">
          Recrutamento para o <span className="text-[#D2A63C]">Trading Floor</span>
        </h1>
        <p className="mt-6 max-w-3xl text-zinc-300 text-lg">
          Estrutura pensada como hedge fund + trading desk + comunidade escalável. Procuramos perfis para
          crescimento de AUM, análise de mercado e execução disciplinada.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
            <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
              Quero entrar no Trading Floor
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <Link href="/work">
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
              Ver outras vagas
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Introducing Broker (IB)",
              icon: Network,
              points: ["Captação de clientes e capital", "10 contactos/dia e 1 apresentação/dia", "Foco em crescimento de AUM"],
            },
            {
              title: "Analista",
              icon: BarChart3,
              points: ["Análise diária de mercado", "Relatórios semanais e setups", "Clareza, probabilidade e consistência"],
            },
            {
              title: "Junior Trader",
              icon: TrendingUp,
              points: ["Execução com gestão de risco", "Jornal diário de trades", "Progressão: Junior → Trader → Senior"],
            },
          ].map((role) => (
            <Card key={role.title} className="border-white/10 bg-white/[0.03]">
              <CardContent className="p-6">
                <role.icon className="h-7 w-7 text-[#D2A63C] mb-4" />
                <h3 className="text-xl font-semibold mb-4">{role.title}</h3>
                <ul className="space-y-2 text-zinc-300 text-sm">
                  {role.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D2A63C]" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Card className="border-[#D2A63C]/30 bg-[#D2A63C]/10">
          <CardContent className="p-7 md:p-10">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="text-2xl font-bold mb-3">Como funciona o Trading Floor</h2>
                <p className="text-zinc-300 text-sm">
                  Analyst cria insights e estratégias, Trader executa com disciplina, IB expande capital e rede.
                  O resultado é uma estrutura operacional focada em performance e crescimento sustentável.
                </p>
              </div>
              <div className="space-y-3 text-sm text-zinc-200">
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-[#D2A63C]" /> KPI por função</div>
                <div className="flex items-center gap-2"><Target className="h-4 w-4 text-[#D2A63C]" /> Onboarding orientado por papel</div>
                <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-[#D2A63C]" /> Progressão interna e accountability</div>
              </div>
            </div>
            <div className="mt-7">
              <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
                <Button className="bg-black text-white border border-white/20 hover:bg-white/10">
                  Iniciar candidatura
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

