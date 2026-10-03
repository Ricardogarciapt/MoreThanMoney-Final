import { components, createCustomTemplate } from '@/lib/email-templates'
import type { MotivoLink } from './credenciais-link'
import { textosDaEntrega, type ContaEntrega, type Idioma } from './email-tipo-conta'

/**
 * O EMAIL DAS CREDENCIAIS DE UMA CONTA MTM FUNDED SIMULADA (servidor «MTM Funded», login 77xxxxxx).
 *
 * O que leva: login, servidor, o TIPO real da conta (desafio e fase, Funded, análise, torneio, oferta),
 * o TAMANHO da conta e o botão «Ver credenciais» (link de uso único, 24 h, só o dono —
 * ./credenciais-link.ts). Os textos saem todos de ./email-tipo-conta.ts, em PT ou EN.
 *
 * O que NUNCA leva: a password master ou investor. Um email fica na caixa de entrada para sempre e
 * reencaminha-se sem pensar; o link gasta-se e caduca.
 *
 * A garantia é de TIPO e de teste: `DadosEmailCredenciais` não tem campo de password, e
 * lib/mtmfunded/__tests__/credenciais-link.check.ts afirma que nenhuma password aparece no HTML nem
 * no texto, mesmo que alguém a meta no objecto à força.
 *
 * Template e envio: os componentes de lib/email-templates.ts e o transporte de lib/mail-transport.ts
 * (os mesmos de todos os emails do site). Sem valores em euros, sem promessa de resultados.
 */

export interface DadosEmailCredenciais {
  nome: string
  login: string
  servidor: string
  /** A conta, lida da base (./entrega-conta-dados.ts) — decide assunto, texto e tamanho. */
  conta: ContaEntrega
  idioma?: Idioma
  motivo: MotivoLink
  urlLink: string
  expiraEm: string
  urlWebtrader: string
  siteUrl?: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** O invólucro comum está em PT; num email em inglês trocam-se as poucas frases fixas dele. */
function involucroEmIngles(html: string): string {
  return html
    .replace('<html lang="pt">', '<html lang="en">')
    .replace('Todos os direitos reservados.', 'All rights reserved.')
    .replace('>Privacidade</a>', '>Privacy</a>')
    .replace('>Suporte</a>', '>Support</a>')
}

export function montarEmailCredenciais(d: DadosEmailCredenciais): { assunto: string; html: string; texto: string } {
  const idioma: Idioma = d.idioma ?? 'pt'
  const t = textosDaEntrega(d.conta, d.motivo, idioma)
  const r = t.rotulos
  const nome = d.nome || 'Trader'
  const expira = new Date(d.expiraEm).toLocaleString(r.locale, { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })
  const linha = (rotulo: string, valor: string) =>
    `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">${esc(rotulo)}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#111;border-top:1px solid #eee;font-family:'Courier New',monospace;">${esc(valor)}</td></tr>`

  const content = `
    ${components.header(esc(t.cabecalho), esc(t.subtitulo), t.real ? '🏆' : '🔐')}
    ${components.text(`
      <p style="margin:0 0 14px 0;font-size:16px;line-height:26px;color:#333;">${esc(r.ola(nome))}</p>
      <p style="margin:0 0 6px 0;font-size:15px;line-height:24px;color:#333;">${esc(t.frase)}</p>
    `)}
    ${components.card(r.dadosAcesso, `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${linha(r.login, d.login)}
        ${linha(r.servidor, d.servidor)}
        ${t.linhas.map(([k, v]) => linha(k, v)).join('')}
      </table>
    `, '🗝️')}
    ${components.text(`
      <p style="margin:0;font-size:14px;line-height:22px;color:#444;">${r.semPassword(esc(expira))}</p>
    `)}
    ${components.button(r.verCredenciais, d.urlLink)}
    ${components.button(r.abrirWebtrader, d.urlWebtrader, 'secondary')}
    ${components.text(`
      <p style="margin:0;font-size:12px;line-height:18px;color:#888;">${esc(t.aviso)} ${esc(r.nuncaPedimos)}</p>
    `)}
  `
  const base = createCustomTemplate(content, `${t.assunto} — login ${d.login}`, d.siteUrl)
  const html = idioma === 'en' ? involucroEmIngles(base) : base
  const texto = [
    r.ola(nome), '', t.frase, '',
    `${r.login}: ${d.login}`, `${r.servidor}: ${d.servidor}`, ...t.linhas.map(([k, v]) => `${k}: ${v}`), '',
    r.semPasswordTexto(expira), d.urlLink, '',
    `WebTrader: ${d.urlWebtrader}`, '',
    t.aviso,
  ].join('\n')
  return { assunto: t.assunto, html, texto }
}
