"use client"

import type React from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import MembershipRequired from "@/components/membership-required"

export default function MemberAccessCheck({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  // Se não estiver autenticado, mostra a tela de acesso restrito
  if (!isAuthenticated) {
    return <MembershipRequired />
  }

  // Se estiver autenticado, mostra o conteúdo normal
  return <>{children}</>
}
