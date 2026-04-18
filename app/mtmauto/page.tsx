"use client"

import ProtectedPage from "@/components/protected-page"
import { MtmAutoAccessGate } from "@/components/mtm-auto-access-gate"
import { MTMAutoApp } from "@mtm-auto/components/mtm-auto-app"

export default function MtmAutoPage() {
  return (
    <ProtectedPage
      redirectPath="/login?redirect=/mtmauto"
      loadingMessage="A validar sessão para o MTM Auto..."
    >
      <MtmAutoAccessGate>
        <MTMAutoApp />
      </MtmAutoAccessGate>
    </ProtectedPage>
  )
}
