import { type NextRequest, NextResponse } from "next/server"
import { productsService } from "@/lib/products-service"

export async function POST(request: NextRequest) {
  try {
    const { products } = await request.json()

    if (!Array.isArray(products)) {
      return NextResponse.json(
        {
          success: false,
          error: "Formato inválido. Esperado array de produtos",
        },
        { status: 400 },
      )
    }

    const result = await productsService.importProducts(JSON.stringify(products))

    return NextResponse.json({
      success: true,
      data: result,
      message: `Importação concluída: ${result.success} sucessos, ${result.errors.length} erros`,
    })
  } catch (error) {
    console.error("Erro ao importar produtos:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao importar produtos",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}
