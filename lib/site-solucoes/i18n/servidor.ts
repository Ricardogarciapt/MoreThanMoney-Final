/** Idioma de um pedido ao /solucoes: ?lang=, cookie mtm_lang, browser e país (ver base.ts). */
import { cookies, headers } from 'next/headers'
import { IDIOMAS, criarTradutor, escolherIdioma, type Idioma, type Tradutor } from './base'
import { dicionario } from './dicionarios'

export async function idiomaDoPedido(lang?: string | string[]): Promise<Idioma> {
  const [c, h] = await Promise.all([cookies(), headers()])
  return escolherIdioma({
    pedido: Array.isArray(lang) ? lang[0] : lang,
    cookie: c.get('mtm_lang')?.value,
    aceita: h.get('accept-language'),
    pais: h.get('x-vercel-ip-country'),
  })
}

export function tradutorServidor(idioma: Idioma): Tradutor {
  return criarTradutor(idioma, dicionario(idioma))
}

/** hreflang: cada idioma num endereço próprio (?lang=), PT no endereço limpo e canónico. */
export function alternativas(caminho: string, idioma: Idioma) {
  const url = (l: Idioma) => `https://www.morethanmoney.pt${caminho}${l === 'pt' ? '' : `?lang=${l}`}`
  const languages: Record<string, string> = { 'x-default': url('pt') }
  for (const l of IDIOMAS) languages[l] = url(l)
  return { canonical: url(idioma), languages }
}
