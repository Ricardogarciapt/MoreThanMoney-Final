import { type NextRequest, NextResponse } from "next/server"
import { ideasService } from "@/lib/ideas-service"

// API para curtir uma ideia de trading
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idea = await ideasService.likeIdea(params.id)

    if (!idea) {
      return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ idea })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
