/**
 * TEXTO DENTRO DAS 24 H, TEMPLATE FORA (19/11/2026).
 *
 * Quem tem uma mensagem para alguém (aviso de marcação, primeiro contacto de um funil) não devia ter
 * de saber da janela da Meta. Aqui lê-se o estado da pessoa: se ela nos escreveu há menos de 24 h,
 * vai o texto livre; senão vai o template aprovado. A decisão de SE se pode escrever continua toda em
 * `decidirEnvio` (dentro de `enviarWhatsApp`).
 */
import { enviarWhatsApp, lerEstadoDoContacto, type ResultadoEnvio } from '@/lib/whatsapp-mensageiro'
import { estadoDaJanela, normalizarE164, type CorpoTemplate, type Finalidade } from '@/lib/whatsapp-envio'

export async function enviarTextoOuTemplate(p: {
  para: string
  finalidade: Finalidade
  texto: string
  template: CorpoTemplate
  agente?: { funil?: string; codigoExplicito?: unknown }
}): Promise<ResultadoEnvio & { via: 'texto' | 'template' }> {
  const { e164 } = normalizarE164(p.para)
  const estado = e164 ? await lerEstadoDoContacto(e164) : undefined
  const aberta = estado ? estadoDaJanela(estado.ultimaEntradaIso, Date.now()).aberta : false
  if (aberta && p.texto.trim()) {
    const r = await enviarWhatsApp({ para: p.para, finalidade: p.finalidade, texto: p.texto, estado, agente: p.agente })
    return { ...r, via: 'texto' }
  }
  const r = await enviarWhatsApp({ para: p.para, finalidade: p.finalidade, template: p.template, estado, agente: p.agente })
  return { ...r, via: 'template' }
}
