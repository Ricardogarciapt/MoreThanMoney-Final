/**
 * A GUARDA DO REMETENTE.
 *
 *   npx tsx lib/correio/remetente.check.ts
 *
 * Metade dos testes é sobre a configuração a meio, porque é essa que deita o correio todo abaixo em
 * silêncio — e é a única que ninguém vai testar à mão antes de mexer nas variáveis da Vercel.
 */
import { cabecalhoDe, escolherRemetente, GMAIL_POR_OMISSAO, limpar, oQueFalta } from './remetente'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const SMTP_COMPLETO = {
  MAIL_SMTP_HOST: 'smtp.zoho.eu',
  MAIL_SMTP_USER: 'geral@morethanmoney.pt',
  MAIL_SMTP_PASSWORD: 'x',
}

// ── Sem nada configurado: o caminho de hoje ─────────────────────────────────
{
  const r = escolherRemetente({})
  teste('sem variáveis → Gmail', r.via === 'gmail')
  teste('e a conta por omissão é a da casa', r.conta === GMAIL_POR_OMISSAO)
  teste('sem aviso quando não há nada para avisar', !r.aviso)
  teste('cabeçalho com nome', cabecalhoDe(r) === `"MoreThanMoney" <${GMAIL_POR_OMISSAO}>`)
}

// ── SMTP completo ───────────────────────────────────────────────────────────
{
  const r = escolherRemetente(SMTP_COMPLETO)
  teste('SMTP completo → SMTP', r.via === 'smtp')
  teste('o From é a própria caixa, sem MAIL_FROM', r.de === 'geral@morethanmoney.pt')
  teste('porta por omissão 465', r.via === 'smtp' && r.porta === 465)
  teste('465 é cifrado do primeiro byte', r.via === 'smtp' && r.seguro)

  const r587 = escolherRemetente({ ...SMTP_COMPLETO, MAIL_SMTP_PORT: '587' })
  teste('587 sobe com STARTTLS, não é seguro de origem', r587.via === 'smtp' && !r587.seguro)

  const alias = escolherRemetente({ ...SMTP_COMPLETO, MAIL_FROM: 'suporte@morethanmoney.pt' })
  teste('MAIL_FROM manda no From quando é posto à mão', alias.de === 'suporte@morethanmoney.pt')
  teste('mas a autenticação continua na caixa real', alias.conta === 'geral@morethanmoney.pt')
}

/**
 * ── A CONFIGURAÇÃO A MEIO ───────────────────────────────────────────────────
 *
 * O erro que isto existe para apanhar. Um host preenchido e uma password esquecida davam um
 * transporte que falha em TODAS as rotas de email ao mesmo tempo — incluindo a recuperação de
 * password, que é a única forma de alguém voltar a entrar na conta.
 */
{
  for (const [nome, env] of [
    ['só host', { MAIL_SMTP_HOST: 'smtp.zoho.eu' }],
    ['host e conta, sem password', { MAIL_SMTP_HOST: 'smtp.zoho.eu', MAIL_SMTP_USER: 'geral@morethanmoney.pt' }],
    ['password sem host', { MAIL_SMTP_PASSWORD: 'x' }],
  ] as const) {
    const r = escolherRemetente(env)
    teste(`${nome} → volta ao Gmail`, r.via === 'gmail')
    teste(`${nome} → e avisa`, Boolean(r.aviso))
    teste(`${nome} → o aviso nomeia a variável em falta`, (r.aviso ?? '').includes('MAIL_SMTP'))
  }

  teste('oQueFalta é vazio quando não há nada posto', oQueFalta({}).length === 0)
  teste('oQueFalta é vazio quando está tudo posto', oQueFalta(SMTP_COMPLETO).length === 0)
  teste(
    'oQueFalta nomeia as duas em falta',
    oQueFalta({ MAIL_SMTP_HOST: 'smtp.zoho.eu' }).join(',') === 'MAIL_SMTP_USER,MAIL_SMTP_PASSWORD',
  )
}

// ── O lixo dos valores de ambiente ──────────────────────────────────────────
{
  teste('quebra de linha sai', limpar('geral@morethanmoney.pt\n') === 'geral@morethanmoney.pt')
  teste('aspas saem', limpar('"geral@morethanmoney.pt"') === 'geral@morethanmoney.pt')
  teste('espaços saem', limpar('  geral@morethanmoney.pt  ') === 'geral@morethanmoney.pt')
  teste('undefined dá vazio', limpar(undefined) === '')

  // O defeito real de que isto vem: o valor tinha a quebra de linha DENTRO e ia inteiro para o
  // cabeçalho `From`, que passava a `<...\n>` — um cabeçalho malformado em todos os emails do site.
  const r = escolherRemetente({ GMAIL_USER: 'morethanmoneypt@gmail.com\n' })
  teste('um From sujo não passa para o cabeçalho', !cabecalhoDe(r).includes('\n'))
  teste('e a conta fica limpa', r.conta === GMAIL_POR_OMISSAO)

  // Um GMAIL_USER só com espaços é o mesmo que não estar posto — e não pode dar um From vazio.
  teste('valor em branco cai na conta da casa', escolherRemetente({ GMAIL_USER: '   ' }).conta === GMAIL_POR_OMISSAO)
}

if (falhas.length) {
  console.error(`correio/remetente: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('correio/remetente: Gmail hoje, SMTP quando estiver completo, e meia configuração avisa ✓')
