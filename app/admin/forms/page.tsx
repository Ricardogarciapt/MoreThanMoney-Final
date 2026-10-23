"use client"

import ProtectedPage from "@/components/protected-page"
import FormsAdmin from "@/components/admin/formularios-admin"

export default function AdminFormsPage() {
  return (
    <ProtectedPage requireAdmin redirectPath="/login?redirect=/admin/forms" loadingMessage="A validar acesso de administrador...">
      <FormsAdmin />
    </ProtectedPage>
  )
}
