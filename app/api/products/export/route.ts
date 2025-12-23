import { type NextRequest, NextResponse } from "next/server"
import { productsService } from "@/lib/products-service"

export async function GET(request: NextRequest) {
  try {
    const jsonData = await productsService.exportProducts()

    return new NextResponse(jsonData, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="products-export-${Date.now()}.json"`,
      },
    })
  } catch (error) {
    console.error("Erro ao exportar produtos:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao exportar produtos",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}
