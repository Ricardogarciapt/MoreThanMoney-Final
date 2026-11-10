/**
 * PÚBLICO VIRTUAL — regras puras do lado do site (guarda: regras.check.ts).
 *
 * Um teste = uma multidão simulada do público-alvo (MiroFish + IA local no Mac do dono) a reagir a
 * uma página pública, funil, email, DM, post ou ecrã da app. O site só recebe o pedido e mostra o
 * relatório; quem valida a sério e corre é o Mac (aios/publico_virtual, fonte de verdade do catálogo).
 * Aqui repete-se o essencial para recusar cedo: alvo do catálogo, só páginas públicas, sem dados
 * pessoais, rondas com tecto. É SIMULAÇÃO: nunca um número de resultado.
 */

export const AVISO_SIMULACAO =
  'Simulação com público virtual (MiroFish + IA local). Indica tendências e objeções prováveis; não é uma medição com pessoas reais nem prova de resultados.'

/** O mesmo catálogo de aios/publico_virtual/alvos.json (URL null = alvo de texto). */
export const ALVOS: Record<string, string | null> = {
  'site:home': '/', 'site:new-landing': '/new-landing', 'site:apresentacao': '/apresentacao',
  'funil:agendar': '/agendar', 'funil:registo': '/register', 'funil:abrir-conta': '/abrir-conta',
  'funil:ativar-premium': '/ativar-premium', 'produto:mtmfunded': '/mtmfunded', 'produto:mtmauto': '/mtmauto',
  'produto:automation': '/automation', 'produto:sensei-ea': '/sensei-ea', 'produto:scanner': '/scanner',
  'produto:marketplace': '/marketplace', 'produto:conteudomagnetico': '/conteudomagnetico',
  'app:app-mobile': '/app-mobile', 'conteudo:texto': null, 'email:texto': null, 'dm:texto': null,
}

export const RONDAS_OMISSAO = 8
export const RONDAS_TECTO = 20
const FECHADAS = /^\/(admin|backoffice|dashboard|dashboard-gestao|aios|api|member-area|profile)(\/|$)/

export function limparPessoais(t: string): string {
  return (t || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[iban]')
    .replace(/(?<!\d)(?:\+?\d[\d\s().-]{7,}\d)(?!\d)/g, '[telefone]')
}

/** URL absoluta permitida (só páginas públicas de morethanmoney.pt) ou null. */
export function urlPublica(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  let u: URL
  try {
    u = new URL(bruto.startsWith('/') ? 'https://www.morethanmoney.pt' + bruto : bruto)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !['www.morethanmoney.pt', 'morethanmoney.pt'].includes(u.hostname)) return null
  if (FECHADAS.test(u.pathname)) return null
  return 'https://www.morethanmoney.pt' + u.pathname + u.search
}

export interface PedidoPV {
  alvo: string; url: string | null; texto: string | null; pergunta: string | null; rondas: number; pedido_por: string
}

export function validarPedidoPV(a: Record<string, unknown>): { ok: true; pedido: PedidoPV } | { ok: false; erro: string } {
  const alvo = String(a.alvo ?? '').trim()
  if (!(alvo in ALVOS)) return { ok: false, erro: `Alvo desconhecido. Usa um de: ${Object.keys(ALVOS).join(', ')}` }
  const texto = String(a.texto ?? '').trim()
  let url: string | null = null
  if (ALVOS[alvo] !== null || a.url) {
    url = urlPublica(String(a.url ?? '') || ALVOS[alvo])
    if (!url) return { ok: false, erro: 'Só se testam páginas públicas de morethanmoney.pt.' }
  } else if (texto.length < 40) {
    return { ok: false, erro: 'Este alvo precisa do texto a testar (mín. 40 caracteres).' }
  }
  if (texto.length > 20000) return { ok: false, erro: 'Texto demasiado longo (máx. 20 000).' }
  const r = Math.round(Number(a.rondas) || RONDAS_OMISSAO)
  return {
    ok: true,
    pedido: {
      alvo, url,
      texto: texto ? limparPessoais(texto) : null,
      pergunta: a.pergunta ? limparPessoais(String(a.pergunta)).slice(0, 600) : null,
      rondas: Math.max(2, Math.min(RONDAS_TECTO, r)),
      pedido_por: String(a.pedido_por ?? 'dono').slice(0, 40),
    },
  }
}
