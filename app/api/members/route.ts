import { type NextRequest, NextResponse } from "next/server"
import { memberService } from "@/lib/member-service"

// API para gerenciar membros
export async function GET(request: NextRequest) {
  try {
    // Verificar autenticação (em produção, isso seria mais robusto)
    // const session = await getServerSession(authOptions);
    // if (!session || !session.user.isAdmin) {
    //   return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    // }

    const members = await memberService.getAllMembers()
    return NextResponse.json({ members })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    // Validar dados (em produção, isso seria mais robusto)
    if (!data.username || !data.name || !data.email) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
    }

    const member = await memberService.registerMember(data)
    return NextResponse.json({ member }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
