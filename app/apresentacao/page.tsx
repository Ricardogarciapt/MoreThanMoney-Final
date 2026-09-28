"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function ApresentacaoPage() {
  const router = useRouter()
  const { user } = useAuth()

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", background: "#080808", overflow: "hidden" }}>
      {/* Minimal header — Voltar + Login */}
      <div
        style={{
          flexShrink: 0,
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "rgba(8,8,8,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(210,166,60,0.15)",
          zIndex: 50,
        }}
      >
        <button
          onClick={() => router.back()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "#D2A63C",
            fontSize: "13px",
            fontWeight: 600,
            background: "none",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          <ArrowLeft size={15} />
          Voltar
        </button>

        {!user ? (
          <Link
            href="/login"
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#D2A63C",
              padding: "6px 16px",
              background: "rgba(210,166,60,0.1)",
              border: "1px solid rgba(210,166,60,0.3)",
              borderRadius: "8px",
              textDecoration: "none",
              letterSpacing: "0.04em",
            }}
          >
            Entrar
          </Link>
        ) : (
          <Link
            href="/member-area"
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#D2A63C",
              padding: "6px 16px",
              background: "rgba(210,166,60,0.1)",
              border: "1px solid rgba(210,166,60,0.3)",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            Área de Membro
          </Link>
        )}
      </div>

      {/* Presentation iframe — fills remaining height */}
      <iframe
        src="/apresentacoes/mtm-oportunidade.html?v=15"
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          display: "block",
        }}
        title="MoreThanMoney — Apresentação de Oportunidade 2026"
        allow="fullscreen"
      />
    </div>
  )
}
