import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

/**
 * Mapeamento de nomes lógicos para os nomes reais dos ficheiros em public/MTM.
 * Evita problemas de encoding com acentos e espaços nos URLs.
 */
const MTM_IMAGES: Record<string, string> = {
  problema: "Problema.png",
  ecossistema: "Ecossistema.png",
  estrategia1: "Estratégia. image 1png.png",
  estrategia2: "A Estratégia image 2.png",
  escolhaCaminho: "Escolha de Caminho.png",
  diferenca: "Diferença.png",
}

const ALLOWED = new Set(Object.keys(MTM_IMAGES))

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")
  if (!name || !ALLOWED.has(name)) {
    return NextResponse.json({ error: "Nome de imagem inválido" }, { status: 400 })
  }

  const filename = MTM_IMAGES[name]
  const publicDir = path.join(process.cwd(), "public", "MTM")
  const filePath = path.join(publicDir, filename)

  try {
    const buffer = await readFile(filePath)
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[MTM-IMAGE] Erro ao ler ficheiro:", filePath, err)
    return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 })
  }
}
