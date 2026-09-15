import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import FundedWebtrader from "@/components/funded/funded-webtrader"
import { scriptPreCarga } from "@/lib/webtrader/pre-carga-inline"

/**
 * /webtrader — o WebTrader do MTM Funded em ecrã inteiro, sem a moldura da app-mobile.
 *
 * É a mesma peça do sub-separador «Web trader» (components/funded/funded-webtrader.tsx), com a
 * mesma entrada: sessão MTM (cookie ou Bearer) mostra as contas da pessoa; sem sessão, entra-se
 * com Login + Password da conta simulada. Não passa pelo middleware de membros — uma conta de
 * torneio ou um investor com a password de leitura têm de conseguir abrir.
 *
 * Os links «Negociar» de fora da app-mobile (scanner-access, /alertas-mtm) chegam aqui com
 * ?symbol=&dir=&sl=&tp=&origem=.
 *
 * O WebTrader v2 ocupa o ecrã todo: a barra (marca, conta, SIMPLE|PRO) é do próprio componente.
 *
 * Componente de servidor (2026-09) só para pôr no HTML o script de pré-carga: a ficha, o preço e as
 * velas do símbolo começam a vir durante o parse, em paralelo com o JS (lib/webtrader/pre-carga-inline.ts).
 * A página continua estática.
 */
const PRE_CARGA = scriptPreCarga()

export default function WebtraderPage() {
  return (
    <main
      className="min-h-[100dvh] bg-[#131722] text-white"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <script dangerouslySetInnerHTML={{ __html: PRE_CARGA }} />
      <Suspense fallback={<div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-[#2962FF]" /></div>}>
        <FundedWebtrader contexto="app" />
      </Suspense>
    </main>
  )
}
