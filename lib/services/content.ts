import { supabase } from "@/lib/auth-service"

export interface ScannerContent {
  id: string
  jifuVideoId: string
  jifuDescription: string
  mtmDescription: string
  updatedAt: string
}

export class ContentService {
  async getScannerContent(): Promise<ScannerContent | null> {
    try {
      const { data, error } = await supabase
        .from("scanner_content")
        .select("*")
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error("Erro ao buscar conteúdo do scanner:", error)
      return null
    }
  }

  async updateScannerContent(content: Partial<ScannerContent>): Promise<ScannerContent | null> {
    try {
      const { data, error } = await supabase
        .from("scanner_content")
        .upsert({
          ...content,
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error("Erro ao atualizar conteúdo do scanner:", error)
      return null
    }
  }
}

export const contentService = new ContentService() 