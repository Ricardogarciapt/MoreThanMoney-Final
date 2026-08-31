"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle2, FileText, Mail } from "lucide-react"

/**
 * Depois do pagamento.
 *
 * A chave não aparece aqui: quem a emite é o webhook do Stripe, e mostrar "a tua chave é X" antes
 * de o webhook ter corrido seria mentir a quem acabou de pagar. O email é a entrega — esta página
 * diz o que esperar e o que fazer enquanto isso.
 */
export default function ObrigadoPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
        </div>

        <h1 className="mt-6 text-3xl font-bold">Pagamento confirmado</h1>
        <p className="mt-3 text-gray-400 leading-relaxed">
          A tua chave de licença vai a caminho por email, com o pacote do EA e o guia de instalação.
          Costuma chegar em menos de um minuto — se não vires, olha na pasta de spam.
        </p>

        <div className="mt-8 rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-left space-y-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#D2A63C]" />
            Enquanto esperas
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            Abre o MetaTrader e vai a{" "}
            <strong className="text-gray-200">Ferramentas → Opções → Consultores</strong>. Liga
            &quot;Permitir WebRequest para os seguintes URLs&quot; e acrescenta{" "}
            <code className="text-[#D2A63C]">https://www.morethanmoney.pt</code>. É o passo onde
            toda a gente tropeça — feito agora, poupa-te a dúvida depois.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <a href="/api/sensei-ea/guia" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C]">
              <FileText className="w-4 h-4 mr-2" />
              Abrir o guia
            </Button>
          </a>
          <Link href="/member-area?tab=subscription">
            <Button className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-medium">
              Ver a minha licença
            </Button>
          </Link>
        </div>

        <p className="mt-8 text-xs text-gray-600">
          Alguma coisa não bateu certo? Responde ao email da compra e resolvemos.
        </p>
      </div>
    </div>
  )
}
