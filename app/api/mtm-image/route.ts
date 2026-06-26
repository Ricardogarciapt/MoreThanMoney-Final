import { NextRequest, NextResponse } from "next/server"
import { readFile, readdir } from "fs/promises"
import path from "path"

/**
 * Mapeamento de nomes lógicos para os nomes reais dos ficheiros em public/MTM.
 * Evita problemas de encoding com acentos e espaços nos URLs.
 */
const MTM_IMAGES: Record<string, string> = {
  problema: "Problema.png",
  ecossistema: "ecossistema-mtm.svg",
  estrategia1: "A Escada Do Sucesso - Parte 1 .png",
  estrategia2: "Escada do Sucesso  - Parte 2.png",
  escolhaCaminho: "escolha-caminho-mtm.svg",
  diferenca: "A Diferença.png",
}

function contentTypeFor(filename: string): string {
  return filename.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png"
}

// Fallbacks para "diferenca" (encoding ç pode variar entre macOS/Linux/deploy)
const DIFERENCA_ALTERNATIVES = ["A Diferença.png", "A Diferenca.png", "Diferenca.png", "Diferença.png"]

const ALLOWED = new Set(Object.keys(MTM_IMAGES))

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")
  if (!name || !ALLOWED.has(name)) {
    return NextResponse.json({ error: "Nome de imagem inválido" }, { status: 400 })
  }

  const publicDir = path.join(process.cwd(), "public", "MTM")
  const filenamesToTry =
    name === "diferenca"
      ? DIFERENCA_ALTERNATIVES
      : [MTM_IMAGES[name]]

  for (const filename of filenamesToTry) {
    const filePath = path.join(publicDir, filename)
    try {
      const buffer = await readFile(filePath)
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentTypeFor(filename),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
    } catch {
      continue
    }
  }

  // Para "diferenca": tentar encontrar por padrão no diretório (resiste a NFC/NFD)
  if (name === "diferenca") {
    try {
      const files = await readdir(publicDir)
      const match = files.find(
        (f) => f.toLowerCase().includes("diferenc") && f.toLowerCase().endsWith(".png")
      )
      if (match) {
        const buffer = await readFile(path.join(publicDir, match))
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        })
      }
    } catch (e) {
      console.error("[MTM-IMAGE] Erro ao listar pasta MTM:", e)
    }
  }

  console.error("[MTM-IMAGE] Imagem não encontrada:", name, "tentativas:", filenamesToTry)
  return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 })
}
