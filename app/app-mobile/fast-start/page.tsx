"use client"

// Reaproveita o conteúdo completo do Fast Start (app/fast-start) dentro do shell
// app-mobile — acessível pelo "Mais" e por /app-mobile/fast-start (e via webview na
// app iOS/Android). O próprio Fast Start já traz ProtectedPage (gate de sessão).
import FastStart from "@/app/fast-start/page"

export default function AppMobileFastStartPage() {
  return <FastStart />
}
