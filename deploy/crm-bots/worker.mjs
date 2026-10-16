/** Node 22; sem dependências, chaves de base de dados ou portas públicas. */
const url = new URL(process.env.CRM_WORKER_URL || 'https://www.morethanmoney.pt/api/cron/crm-bots')
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
    !['www.morethanmoney.pt', 'morethanmoney.pt'].includes(url.hostname) || url.port || url.pathname !== '/api/cron/crm-bots') {
  throw new Error('CRM_WORKER_URL inválido: usar o endpoint HTTPS da casa, sem parâmetros.')
}
const secret = process.env.CRON_SECRET
if (!secret || secret.length < 32) throw new Error('Configurar CRON_SECRET no EnvironmentFile protegido.')
try {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(125_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const result = await response.json()
  const estados = ['vazio', 'feito', 'revisao', 'retry']
  if (result.ok !== true || !estados.includes(result.estado)) throw new Error('Resposta inesperada')
  console.log(JSON.stringify({ service: 'crm-bots', estado: result.estado }))
} catch {
  console.error('crm-bots: invocação falhou; consultar estado da fila e logs Vercel.')
  process.exitCode = 1
}
