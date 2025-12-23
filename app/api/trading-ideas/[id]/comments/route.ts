import { type NextRequest, NextResponse } from "next/server"
import { ideasService } from "@/lib/ideas-service"

// API para gerenciar comentários de uma ideia de trading
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { authorId, content } = await request.json()

    // Validar dados
    if (!authorId || !content) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
    }

    const comment = await ideasService.addComment(params.id, authorId, content)

    if (!comment) {
      return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ comment }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
