/**
 * A FOLHA DO CLIENTE — o que este teste trava.
 *
 * Uma só regra, mas atravessa o ficheiro todo: **um zero tem de se distinguir de um «não sei»**.
 * Uma conta real sem leitura não vale zero euros; vale «não sei», e não pode entrar num total que
 * depois se lê como «é isto que ele tem». Este teste garante que a soma só inclui o que foi lido,
 * que o número de contas de fora é dito, e que a folha nunca inventa um saldo.
 *
 * E a segunda: os logins saem mascarados. Uma conversa de Telegram é um sítio onde as coisas
 * ficam, e a decisão não precisa do login inteiro.
 *
 *   npx tsx lib/__tests__/telegram-admin-cliente.check.ts
 */
import { mascararLogin, montarFolha, textoFolha, type FontesDaFolha } from '../telegram-admin-cliente'

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const HOJE = Date.parse('2026-09-24T12:00:00Z')

const vazio: FontesDaFolha = {
  perfil: null,
  funded: [],
  ligacoes: [],
  corretora: null,
  leituras: {},
  relatorioEm: null,
  lead: null,
  pagamentos: [],
  agoraMs: HOJE,
}

// ── 1. mascarar ────────────────────────────────────────────────────────────
sim('login longo mascara-se', mascararLogin('77661181') === '••••1181')
sim('login curto fica como está', mascararLogin('123') === '123')
sim('sem login → traço', mascararLogin(null) === '—')

// ── 2. o zero que não existe ───────────────────────────────────────────────
{
  const f = montarFolha({
    ...vazio,
    perfil: { id: 'u1', email: 'j@x.pt', full_name: 'João', subscription_status: 'active', subscription_plan: 'premium', subscription_expires_at: '2026-10-01T00:00:00Z' },
    funded: [
      // Simulada: o saldo é nosso e é exacto.
      { id: 'c1', mt5_login: '77661181', tipo: 'financiada', estado: 'ativa', motor: 'sim', sim_saldo: 12_000, sim_equity: 12_050, saldo_inicial: 10_000 },
      // Da corretora e sem uma única leitura de métricas: não vale zero, vale «não sei».
      { id: 'c2', mt5_login: '900123', tipo: 'financiada', estado: 'ativa', motor: 'mt5', saldo_inicial: 5_000, metricas: {} },
    ],
    ligacoes: [
      // Ligada mas sem conta MetaApi: não há por onde ler.
      { origem: 'MTM Copy', rotulo: 'Real', login: '555444333', ativa: true, metaapiAccountId: null },
    ],
  })

  sim('a soma só usa o que foi lido', f.equityConhecida === 12_050)
  sim('e diz quantas ficaram de fora', f.contasSemLeitura === 2)
  sim('a conta sem métricas fica a null (não a 0)', f.contas[1].equity === null && f.contas[1].saldo === null)
  sim('e explica-se', /sem nenhuma leitura/.test(String(f.contas[1].nota)))
  sim('a ligação sem MetaApi explica-se', /não há por onde ler/.test(String(f.contas[2].nota)))
  sim('a lacuna diz que o total não as inclui', f.lacunas.some((l) => /NÃO as inclui/.test(l)))
  sim('e conta-se quantas entraram na soma', f.contasComLeitura === 1)

  const t = textoFolha(f)
  sim('o texto mostra traço, não zero', t.includes('saldo — · equidade —'))
  sim('o texto mascara os logins', t.includes('••••1181') && !t.includes('77661181'))
  sim('o texto diz a equidade somada', /Equidade somada/.test(t))
}

// ── 3. uma demo não é dinheiro de ninguém ─────────────────────────────────
{
  const f = montarFolha({
    ...vazio,
    perfil: { id: 'u1', email: 'j@x.pt' },
    ligacoes: [{ origem: 'MTM Auto', login: '111222', ativa: true, demo: true, metaapiAccountId: null }],
  })
  sim('a demo não conta para as contas sem leitura', f.contasSemLeitura === 0)
  sim('e diz-se que é demonstração', /demonstração/.test(String(f.contas[0].nota)))
}

// ── 4. o depósito desconhecido da corretora diz-se em voz alta ────────────
{
  const f = montarFolha({
    ...vazio,
    perfil: { id: 'u1', email: 'j@x.pt', broker_uid: '10123456' },
    corretora: { uid: '10123456', deposits_usd: null, balance_usd: 812.4, updated_at: '2026-07-20T00:00:00Z' },
  })
  sim('depósito nulo vira lacuna', f.lacunas.some((l) => /não é zero, é desconhecido/.test(l)))
  sim('mas o saldo que existe mostra-se', f.corretora?.saldoUsd === 812.4)
  sim('e diz-se de que dia é o export', /20\/07\/26/.test(textoFolha(f)))
}

// ── 5. sem nada, a folha diz que não há nada (e não finge um total) ───────
{
  const f = montarFolha({ ...vazio, perfil: { id: 'u1', email: 'j@x.pt' } })
  sim('sem contas → lacuna explícita', f.lacunas.some((l) => /não tem nenhuma conta/.test(l)))
  sim('e a soma é zero honesto (nada lido, nada de fora)', f.equityConhecida === 0 && f.contasSemLeitura === 0)
}

// ── 6. nenhuma leitura → a soma é «—», não «0 USD» ────────────────────────
{
  const f = montarFolha({
    ...vazio,
    perfil: { id: 'u1', email: 'j@x.pt' },
    ligacoes: [{ origem: 'MTM Copy', rotulo: 'PAMM', login: '999888', ativa: false, metaapiAccountId: 'abc' }],
  })
  const t = textoFolha(f)
  sim('sem leitura nenhuma, a soma não é zero', /Equidade somada: —/.test(t))
  sim('e diz quantas contas ficaram por ler', /nenhuma das 1 conta/.test(t))
  sim('um 0 USD aqui seria «não tem nada connosco»', !t.includes('Equidade somada: 0 USD'))
}

if (falhas.length) {
  console.error(`telegram-admin-cliente: ${ok} ok, ${falhas.length} falharam`)
  for (const f of falhas) console.error('  ✗', f)
  process.exit(1)
}
console.log(`telegram-admin-cliente: ${ok} ok, 0 falharam`)
