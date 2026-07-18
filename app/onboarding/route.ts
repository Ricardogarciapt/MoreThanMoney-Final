import { promises as fs } from 'fs'
import path from 'path'

/**
 * /onboarding — Guia de Onboarding MTM (multilingue PT/EN/ES/DE/FR).
 *
 * Serve o HTML auto-contido public/onboarding-mtm.html (screenshots embutidos,
 * seletor de idioma client-side). Item "Onboarding" da navbar/rodapé aponta aqui.
 * Para atualizar o guia basta substituir o ficheiro em public/ — sem tocar nesta rota.
 * `force-static`: renderizado no build (o ficheiro existe no repo), servido como estático.
 */
export const dynamic = 'force-static'

export async function GET() {
  const file = path.join(process.cwd(), 'public', 'onboarding-mtm.html')
  const html = await fs.readFile(file, 'utf-8')
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
