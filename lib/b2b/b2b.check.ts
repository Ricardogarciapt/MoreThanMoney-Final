/**
 * A GUARDA DA PROSPEÇÃO B2B (06/10).   npx tsx lib/b2b/b2b.check.ts
 *
 * Os casos MAUS primeiro: webmail pessoal recusado; excluído nunca recebe; o 21.º do dia não sai;
 * mensagem sem linha de saída ou sem ?ag= recusada. Depois os bons: as 30 mensagens (5 segmentos ×
 * 2 países × 3 toques) passam a porta e não trazem números de resultado.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { validarProspecto, eWebmailPessoal } from './validador'
import { montarMensagem, validarMensagem, lerSaida, linkSaida, lerPais, SEGMENTOS, SEGMENTOS_INT, type Pais } from './sequencias'
import { decidirEnvioB2B, vagasHoje, prontoParaToque, remetenteB2B, CONFIG_PADRAO, type ConfigB2B, type ProspectoLinha } from './envio'
import { robotsPermite, extrairEmails, extrairEmailsDeLinks, evidenciaPessoaColectiva, ePaginaDeLinks } from './recolha'
import { normalizarCandidato } from './candidatos'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }
const SEG = 'segredo-de-teste'
const cfg: ConfigB2B = { ...CONFIG_PADRAO, ligado: true }
const pros = (email: string, extra: Partial<ProspectoLinha> = {}): ProspectoLinha => ({
  id: '00000000-0000-0000-0000-000000000001', empresa: 'Exemplo Lda', segmento: 'escola', pais: 'PT', email,
  email_tipo: 'generico', fonte_url: 'https://exemplo.pt/contactos', pessoa_colectiva: true, estado: 'novo',
  agente: 'AG-CLOSER', toques: 0, ultimo_toque_em: null, ...extra,
})

// ── MAU nº 1: webmail pessoal é recusado ─────────────────────────────────────────────────────
for (const e of ['info@gmail.com', 'parcerias@hotmail.com', 'geral@outlook.pt', 'hello@yahoo.com.br', 'contact@icloud.com', 'contato@uol.com.br', 'info@sapo.pt', 'business@proton.me']) {
  teste(`webmail recusado no validador: ${e}`, !validarProspecto({ email: e, fonteUrl: 'https://x.pt/c', pessoaColectiva: true }).ok)
  teste(`webmail detectado: ${e}`, eWebmailPessoal(e))
  teste(`webmail nunca sai: ${e}`, decidirEnvioB2B(pros(e), { cfg, enviadosHoje: 0, exclusao: [], segredo: SEG }).decisao !== 'sai')
}
// Nominal sem prova de contacto comercial → recusado; pessoa colectiva por confirmar → recusado; sem URL → recusado.
teste('nominal sem prova recusado', !validarProspecto({ email: 'joao.silva@exemplo.pt', fonteUrl: 'https://exemplo.pt/c', pessoaColectiva: true }).ok)
teste('nominal publicado como comercial aceite', validarProspecto({ email: 'joao.silva@exemplo.pt', emailTipo: 'comercial_publicado', fonteUrl: 'https://exemplo.pt/c', pessoaColectiva: true }).ok)
teste('pessoa colectiva por confirmar recusada', !validarProspecto({ email: 'info@exemplo.pt', fonteUrl: 'https://exemplo.pt/c', pessoaColectiva: false }).ok)
teste('sem URL de origem recusado', !validarProspecto({ email: 'info@exemplo.pt', fonteUrl: '', pessoaColectiva: true }).ok)
teste('genérico de empresa aceite', validarProspecto({ email: 'parcerias@exemplo.pt', fonteUrl: 'https://exemplo.pt/c', pessoaColectiva: true }).ok)

// ── MAU nº 2: excluído nunca recebe (email ou domínio inteiro) ───────────────────────────────
teste('excluído pelo email recusado', !validarProspecto({ email: 'info@exemplo.pt', fonteUrl: 'https://exemplo.pt/c', pessoaColectiva: true }, ['INFO@exemplo.pt']).ok)
teste('excluído pelo domínio recusado', !validarProspecto({ email: 'geral@exemplo.pt', fonteUrl: 'https://exemplo.pt/c', pessoaColectiva: true }, ['@exemplo.pt']).ok)
{
  const d = decidirEnvioB2B(pros('info@exemplo.pt'), { cfg, enviadosHoje: 0, exclusao: ['info@exemplo.pt'], segredo: SEG })
  teste('excluído: decisão bloqueado', d.decisao === 'bloqueado')
  teste('excluído: sai da sequência', d.retirar === true)
  // Mesmo que o lote insista com toques seguintes, continua bloqueado.
  for (const t of [1, 2]) teste(`excluído no toque ${t + 1}`, decidirEnvioB2B(pros('info@exemplo.pt', { toques: t, estado: 'contactado' }), { cfg, enviadosHoje: 0, exclusao: ['info@exemplo.pt'], segredo: SEG }).decisao !== 'sai')
}
// O link de saída é assinado: devolve o email certo, e um link forjado não tira ninguém da lista.
{
  const l = new URL(linkSaida('Info@Exemplo.pt', SEG))
  teste('link de saída lê o email', lerSaida(l.searchParams.get('e'), l.searchParams.get('t'), SEG) === 'info@exemplo.pt')
  teste('link de saída forjado recusado', lerSaida(l.searchParams.get('e'), '0'.repeat(24), SEG) === null)
  teste('link de saída com outro segredo recusado', lerSaida(l.searchParams.get('e'), l.searchParams.get('t'), 'outro') === null)
}

// ── MAU nº 3: o 21.º do dia não sai ─────────────────────────────────────────────────────────
teste('tecto 20: com 20 enviados hoje, vagas = 0', vagasHoje(cfg, 20, 100) === 0)
teste('tecto 20: com 19 enviados, vaga = 1', vagasHoje(cfg, 19, 100) === 1)
teste('primeiro lote no máximo 10', vagasHoje(cfg, 0, 0) === 10)
teste('desligado: vagas = 0', vagasHoje({ ...cfg, ligado: false }, 0, 0) === 0)
teste('o 21.º não sai (decisão)', decidirEnvioB2B(pros('info@exemplo.pt'), { cfg, enviadosHoje: 20, exclusao: [], segredo: SEG }).decisao !== 'sai')
teste('o 20.º sai (decisão)', decidirEnvioB2B(pros('info@exemplo.pt'), { cfg, enviadosHoje: 19, exclusao: [], segredo: SEG }).decisao === 'sai')
{
  // Simulação de um dia com 30 prospectos válidos: saem exactamente 20.
  let hoje = 0
  for (let i = 0; i < 30; i++) {
    if (decidirEnvioB2B(pros(`info@empresa${i}.pt`), { cfg, enviadosHoje: hoje, exclusao: [], segredo: SEG }).decisao === 'sai') hoje++
  }
  teste(`num dia com 30 prospectos saem 20 (saíram ${hoje})`, hoje === 20)
}
teste('desligado: nada sai', decidirEnvioB2B(pros('info@exemplo.pt'), { cfg: { ...cfg, ligado: false }, enviadosHoje: 0, exclusao: [], segredo: SEG }).decisao !== 'sai')

// ── MAU nº 4: mensagem sem linha de saída ou sem ?ag= é recusada ────────────────────────────
{
  const m = montarMensagem({ segmento: 'escola', pais: 'PT', toque: 1, empresa: 'Exemplo Lda', email: 'info@exemplo.pt', segredo: SEG })
  teste('mensagem completa passa', validarMensagem(m.texto).ok)
  const semSaida = m.texto.replace(/\n\nRecebem este email[\s\S]*$/, '')
  teste('sem linha de saída recusada', !validarMensagem(semSaida).ok)
  const semAg = m.texto.split(m.linkOferta).join('https://www.morethanmoney.pt/mtmauto')
  teste('sem ?ag= recusada', !validarMensagem(semAg).ok)
  const agFalso = m.texto.split(m.linkOferta).join('https://www.morethanmoney.pt/mtmauto?ag=')
  teste('?ag= vazio recusado', !validarMensagem(agFalso).ok)
  const semId = m.texto.replace(/More Than Money/g, 'Empresa').replace(/\(MTM\)|MTM/g, '').replace(/morethanmoney\.pt/g, 'exemplo.com')
  teste('sem identificação recusada', !validarMensagem(semId).ok)
  for (const [nome, t] of [['sem saída', semSaida], ['sem ?ag=', semAg]] as const) {
    teste(`envio com mensagem ${nome} não sai`, decidirEnvioB2B(pros('info@exemplo.pt'), { cfg, enviadosHoje: 0, exclusao: [], segredo: SEG, textoForcado: t }).decisao === 'bloqueado')
  }
  teste('sem segredo do link de saída não sai', decidirEnvioB2B(pros('info@exemplo.pt'), { cfg, enviadosHoje: 0, exclusao: [], segredo: '' }).decisao !== 'sai')
}

// ── BONS: as 30 mensagens passam a porta e não inventam números ──────────────────────────────
for (const segmento of SEGMENTOS) {
  for (const pais of (SEGMENTOS_INT.includes(segmento) ? ['PT', 'BR', 'INT'] : ['PT', 'BR']) as Pais[]) {
    for (const toque of [1, 2, 3] as const) {
      const m = montarMensagem({ segmento, pais, toque, empresa: 'Exemplo', email: 'info@exemplo.pt', segredo: SEG })
      const n = `${segmento}/${pais}/T${toque}`
      teste(`${n}: passa a porta`, validarMensagem(m.texto).ok)
      teste(`${n}: link com ?ag=AG-PROSPECTOR`, m.linkOferta.includes('ag=AG-PROSPECTOR'))
      teste(`${n}: sem €/%/R$ (nada de números de resultado)`, !/[€%]|R\$|\+\d/.test(m.texto))
      teste(`${n}: curto (< 1300 caracteres)`, m.texto.length < 1300)
      teste(`${n}: idioma`, pais === 'BR' ? /você|vocês|Oi/.test(m.texto) : pais === 'INT' ? /\bHi\b/.test(m.texto) && /unsubscribe/.test(m.texto) : /Olá/.test(m.texto))
      // Em público é «educação em trading»: nunca network marketing, MLM nem pirâmide.
      teste(`${n}: sem network marketing`, !/network|marketing multin|\bMLM\b|pir[âa]mide/i.test(m.texto))
      teste(`${n}: sem promessa de lucro`, !/lucro garantido|garantid|guaranteed|rendimento passivo/i.test(m.texto))
    }
  }
}
teste('2.º toque só depois de 4 dias', !prontoParaToque({ estado: 'contactado', toques: 1, ultimo_toque_em: new Date(Date.now() - 2 * 86_400_000).toISOString() }, cfg))
teste('2.º toque ao fim de 4 dias', prontoParaToque({ estado: 'contactado', toques: 1, ultimo_toque_em: new Date(Date.now() - 5 * 86_400_000).toISOString() }, cfg))
teste('depois do 3.º toque, acabou', !prontoParaToque({ estado: 'contactado', toques: 3, ultimo_toque_em: null }, cfg))
teste('quem respondeu sai da sequência', !prontoParaToque({ estado: 'respondeu', toques: 1, ultimo_toque_em: null }, cfg))

// ── Recolha: robots.txt e extracção ─────────────────────────────────────────────────────────
teste('robots: Disallow /', !robotsPermite('User-agent: *\nDisallow: /', '/contactos'))
teste('robots: Disallow /contactos', !robotsPermite('User-agent: *\nDisallow: /contactos', '/contactos'))
teste('robots: Allow mais longo vence', robotsPermite('User-agent: *\nDisallow: /\nAllow: /contactos', '/contactos'))
teste('robots: grupo próprio manda', !robotsPermite('User-agent: *\nAllow: /\n\nUser-agent: MTM-B2B-Recolha\nDisallow: /', '/contactos'))
teste('robots: vazio permite', robotsPermite('', '/contactos'))
teste('robots: Disallow vazio permite', robotsPermite('User-agent: *\nDisallow:', '/contactos'))
{
  const html = '<a href="mailto:Geral@Exemplo.pt">x</a> info&#64;exemplo.pt outro@gmail.com logo@2x.png parcerias@sub.exemplo.pt'
  const e = extrairEmails(html, 'www.exemplo.pt')
  teste('extrai só do domínio do site', e.includes('geral@exemplo.pt') && e.includes('info@exemplo.pt') && e.includes('parcerias@sub.exemplo.pt') && !e.includes('outro@gmail.com'))
  teste('ignora imagens', !e.some((x) => x.endsWith('.png')))
}

// ── 16/11: segmentos novos, páginas de links, prova de pessoa colectiva, candidatos ─────────
teste('INT sem textos (escola) não sai', decidirEnvioB2B(pros('info@school.co.uk', { pais: 'INT', segmento: 'escola' }), { cfg, enviadosHoje: 0, exclusao: [], segredo: SEG }).decisao === 'bloqueado')
teste('INT licenca_scanners sai', decidirEnvioB2B(pros('info@academy.co.uk', { pais: 'INT', segmento: 'licenca_scanners' }), { cfg, enviadosHoje: 0, exclusao: [], segredo: SEG }).decisao === 'sai')
teste('negocio_local leva à agenda de negócios', /\/agendar\?t=negocios/.test(montarMensagem({ segmento: 'negocio_local', pais: 'PT', toque: 1, empresa: 'Estúdio X', email: 'geral@estudiox.pt', segredo: SEG }).texto))
teste('parceria_redes T2 leva às parcerias', /\/agendar\?t=parcerias/.test(montarMensagem({ segmento: 'parceria_redes', pais: 'PT', toque: 2, empresa: 'Marca Y', email: 'geral@marcay.pt', segredo: SEG }).texto))
teste('lerPais', lerPais('br') === 'BR' && lerPais('en') === 'INT' && lerPais(undefined) === 'PT')
teste('linktr.ee é página de links', ePaginaDeLinks('linktr.ee') && ePaginaDeLinks('beacons.ai') && !ePaginaDeLinks('exemplo.pt'))
{
  const html = 'Marcações: <a href="mailto:reservas@estudiox.pt">x</a> ou estudiox@gmail.com · sentry@o123.ingest.sentry.io · foto@2x.png'
  const e = extrairEmailsDeLinks(html)
  teste('links: aceita email do domínio do negócio', e.includes('reservas@estudiox.pt'))
  teste('links: recusa webmail pessoal', !e.includes('estudiox@gmail.com'))
  teste('links: ignora imagens e sentry', !e.some((x) => x.endsWith('.png') || x.includes('sentry')))
}
teste('prova: NIPC de empresa', !!evidenciaPessoaColectiva('<footer>NIPC: 514 123 456</footer>'.replace('514 123 456', '514123456')))
teste('prova: NIF de pessoa singular não conta', evidenciaPessoaColectiva('<footer>NIF 212345678</footer>') === null)
teste('prova: CNPJ', !!evidenciaPessoaColectiva('CNPJ: 12.345.678/0001-90'))
teste('prova: forma jurídica com o nome da empresa', !!evidenciaPessoaColectiva('© 2026 Estúdio Aurora, Lda. Todos os direitos', 'Estúdio Aurora'))
teste('prova: forma jurídica de outra empresa (agência) não conta', evidenciaPessoaColectiva('Site feito por Agência Pixel, Lda.', 'Estúdio Aurora') === null)
teste('candidato: sem segmento válido recusado', normalizarCandidato({ empresa: 'X', url: 'https://x.pt', segmento: 'nada' }) === null)
teste('candidato: URL sem esquema corrigida', normalizarCandidato({ empresa: 'X', url: 'linktr.ee/x', segmento: 'negocio_local' })?.url === 'https://linktr.ee/x')
teste('candidato: PC só com identificação', normalizarCandidato({ empresa: 'X', url: 'https://x.pt', segmento: 'licenca_scanners', pessoa_colectiva: true })?.pessoa_colectiva === false)
teste('remetente: B2B_MAIL_FROM válido', remetenteB2B('MoreThanMoney <a@gmail.com>', { B2B_MAIL_FROM: 'geral@morethanmoney.pt' }) === 'MoreThanMoney <geral@morethanmoney.pt>')
teste('remetente: sem B2B_MAIL_FROM fica o do site', remetenteB2B('MoreThanMoney <a@gmail.com>', {}) === 'MoreThanMoney <a@gmail.com>')
teste('respostas vão para geral@', readFileSync(join(__dirname, 'envio.ts'), 'utf8').includes("replyTo: RESPOSTAS_B2B"))

// ── O código: nada envia sem passar pela decisão ────────────────────────────────────────────
{
  const src = readFileSync(join(__dirname, 'envio.ts'), 'utf8')
  const iDec = src.indexOf("if (d.decisao !== 'sai')")
  const iSend = src.indexOf('sendMail(')
  teste('sendMail só depois da decisão', iDec > 0 && iSend > iDec)
  teste('regra do motor consumida', src.includes('decidirContacto('))
  teste('base legal gravada', src.includes("BASE_LEGAL_B2B = 'b2b_pessoa_colectiva'") && src.includes('base_legal: BASE_LEGAL_B2B'))
  teste('LinkedIn não é fonte', readFileSync(join(__dirname, 'recolha.ts'), 'utf8').includes('linkedin\\.com'))
}

// ── 07/10 «activa tudo»: o Prospector é o dono do envio B2B ─────────────────────────────────
{
  // Um prospecto antigo, ainda gravado com AG-CLOSER, sai assinado pelo Prospector.
  const d = decidirEnvioB2B(pros('parcerias@exemplo.pt', { agente: 'AG-CLOSER' }), { cfg, enviadosHoje: 0, exclusao: [], segredo: SEG })
  teste('envio B2B atribuído ao Prospector', d.decisao === 'sai' && /ag=AG-PROSPECTOR/.test(d.texto ?? '') && !/ag=AG-CLOSER/.test(d.texto ?? ''))
  const src = readFileSync(join(__dirname, 'envio.ts'), 'utf8')
  teste('registo do envio grava o Prospector', src.includes('agente: AGENTE_B2B, base_legal') && !src.includes('p.agente || AGENTE_B2B'))
  // O tecto continua: com 20 hoje, mesmo o Prospector não envia o 21.º.
  teste('Prospector respeita o tecto', decidirEnvioB2B(pros('geral@exemplo.pt'), { cfg, enviadosHoje: 20, exclusao: [], segredo: SEG }).decisao !== 'sai')
}

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n - ` + falhas.join('\n - '))
  process.exit(1)
}
console.log('✓ guarda B2B: webmail recusado, excluído nunca recebe, o 21.º não sai, sem saída/?ag= recusada, 30 mensagens válidas')
