import { components, createCustomTemplate } from '@/lib/email-templates'
import type { MotivoLink } from './credenciais-link'

/**
 * O EMAIL DAS CREDENCIAIS DE UMA CONTA MTM FUNDED SIMULADA (servidor «MTM Funded», login 77xxxxxx).
 *
 * O que leva: login, servidor, tipo/programa e o botão «Ver credenciais» (link de uso único, 24 h,
 * só o dono — ./credenciais-link.ts). O que NUNCA leva: a password master ou investor. Um email fica
 * na caixa de entrada para sempre e reencaminha-se sem pensar; o link gasta-se e caduca.
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
  /** F1 · F2 · Funded · Torneio */
  etiqueta: string
  programa: string | null
  motivo: MotivoLink
  urlLink: string
  expiraEm: string
  urlWebtrader: string
  siteUrl?: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function titulo(m: MotivoLink): { assunto: string; cabecalho: string; frase: string } {
  switch (m) {
    case 'fase':
      return { assunto: 'A tua nova conta MTM Funded (fase seguinte)', cabecalho: 'Nova fase, nova conta', frase: 'Passaste de fase e abrimos a conta seguinte. Os dados de acesso estão aqui.' }
    case 'regeneracao':
      return { assunto: 'As passwords da tua conta MTM Funded mudaram', cabecalho: 'Passwords novas', frase: 'As passwords desta conta foram geradas de novo. As antigas deixaram de funcionar. Se não foste tu nem o suporte, responde a este email.' }
    case 'pedido':
      return { assunto: 'O link para veres as credenciais MTM Funded', cabecalho: 'O teu link seguro', frase: 'Pediste para ver as credenciais desta conta. O link abaixo abre-as uma vez.' }
    case 'reenvio':
    case 'backfill':
      return { assunto: 'Os dados de acesso da tua conta MTM Funded', cabecalho: 'Os dados da tua conta', frase: 'Aqui ficam os dados de acesso da tua conta MTM Funded, para os teres sempre à mão.' }
    default:
      return { assunto: 'A tua conta MTM Funded está pronta', cabecalho: 'A tua conta está pronta', frase: 'A tua conta simulada MTM Funded já está activa. Os dados de acesso estão aqui.' }
  }
}

export function montarEmailCredenciais(d: DadosEmailCredenciais): { assunto: string; html: string; texto: string } {
  const t = titulo(d.motivo)
  const expira = new Date(d.expiraEm).toLocaleString('pt-PT', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })
  const linha = (rotulo: string, valor: string) =>
    `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">${rotulo}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#111;border-top:1px solid #eee;font-family:'Courier New',monospace;">${esc(valor)}</td></tr>`

  const content = `
    ${components.header(t.cabecalho, `Conta ${esc(d.etiqueta)}${d.programa ? ` · ${esc(d.programa)}` : ''}`, '🔐')}
    ${components.text(`
      <p style="margin:0 0 14px 0;font-size:16px;line-height:26px;color:#333;">Olá ${esc(d.nome || 'Trader')},</p>
      <p style="margin:0 0 6px 0;font-size:15px;line-height:24px;color:#333;">${t.frase}</p>
    `)}
    ${components.card('Dados de acesso', `
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${linha('Login', d.login)}
        ${linha('Servidor', d.servidor)}
        ${linha('Tipo de conta', d.etiqueta)}
        ${d.programa ? linha('Programa', d.programa) : ''}
      </table>
    `, '🗝️')}
    ${components.text(`
      <p style="margin:0;font-size:14px;line-height:22px;color:#444;">
        <strong>As passwords não vão por email.</strong> O botão abaixo mostra-as <strong>uma vez</strong>, dentro da app,
        depois de entrares na tua conta MTM. O link é só teu, vale até <strong>${esc(expira)}</strong> e deixa de funcionar
        depois de aberto. Na tua área podes pedir outro ou gerar uma password nova.
      </p>
    `)}
    ${components.button('Ver credenciais', d.urlLink)}
    ${components.button('Abrir o WebTrader', d.urlWebtrader, 'secondary')}
    ${components.text(`
      <p style="margin:0;font-size:12px;line-height:18px;color:#888;">
        Conta simulada educativa: a negociação não é real. Resultados passados não garantem resultados futuros.
        A MoreThanMoney nunca te pede a password por email, telefone ou mensagem.
      </p>
    `)}
  `
  const html = createCustomTemplate(content, `${t.assunto} — login ${d.login}`, d.siteUrl)
  const texto = [
    `Olá ${d.nome || 'Trader'},`, '', t.frase, '',
    `Login: ${d.login}`, `Servidor: ${d.servidor}`, `Tipo de conta: ${d.etiqueta}`, ...(d.programa ? [`Programa: ${d.programa}`] : []), '',
    'As passwords não vão por email. Abre este link (uma vez, só tu, até ' + expira + '):', d.urlLink, '',
    `WebTrader: ${d.urlWebtrader}`, '',
    'Conta simulada educativa: a negociação não é real.',
  ].join('\n')
  return { assunto: t.assunto, html, texto }
}
