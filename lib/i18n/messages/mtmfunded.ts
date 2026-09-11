import type { Lang } from "../config"

/**
 * Namespace i18n do MTM Funded e dos torneios.
 *
 * Os idiomas em falta caem para PT, por desenho do dicionário — e, nestas páginas, o seletor
 * do Google Translate cobre o resto enquanto a migração para dicionário nativo não chega a
 * cada componente. Este ficheiro é o que essa migração vai consumir, e já é a fonte das
 * peças de navegação.
 *
 * O que NÃO se traduz, de propósito: nomes de produtos («MTM Funded», «Trading Tournament»),
 * o texto do contrato (é um documento jurídico, e uma tradução aproximada de um contrato é
 * pior do que o original noutra língua) e os códigos de certificado.
 */
export const MTMFUNDED_MESSAGES: Partial<Record<Lang, Record<string, string>>> = {
  pt: {
    "mtmfunded.nav.programas": "Programas",
    "mtmfunded.nav.torneio": "Torneio",
    "mtmfunded.nav.faq": "FAQ",
    "mtmfunded.nav.area": "A minha área",

    "mtmfunded.hero.kicker": "More Than Money",
    "mtmfunded.hero.titulo": "Prova o que vales numa conta avaliada.",
    "mtmfunded.hero.sub":
      "Escolhes o tamanho, negoceias com as regras à vista, e as métricas actualizam sozinhas. Sem letra pequena e sem promessas de rendimento.",
    "mtmfunded.hero.ver": "Ver os programas",
    "mtmfunded.hero.torneio": "Torneio gratuito",

    "mtmfunded.facto.simuladas": "Contas simuladas",
    "mtmfunded.facto.simuladasNota":
      "Dinheiro virtual. Não há fundos de participantes em lado nenhum.",
    "mtmfunded.facto.regras": "Regras publicadas",
    "mtmfunded.facto.regrasNota": "Antes de te inscreveres, e não mudam a meio da prova.",
    "mtmfunded.facto.classificacao": "Classificação pública",
    "mtmfunded.facto.classificacaoNota":
      "Actualiza de hora a hora, com o motivo à vista de quem não conta.",

    "mtmfunded.escada.titulo": "Escolhe o tamanho — e o caminho",
    "mtmfunded.escada.conta": "Conta",
    "mtmfunded.escada.caminho": "Caminho",
    "mtmfunded.escada.objetivo": "Objectivo",
    "mtmfunded.escada.perdaDiaria": "Perda diária",
    "mtmfunded.escada.perdaMaxima": "Perda máxima",
    "mtmfunded.escada.diasMin": "Dias mín.",
    "mtmfunded.escada.preco": "Preço",
    "mtmfunded.escada.comecar": "Começar",
    "mtmfunded.escada.brevemente": "Brevemente",
    "mtmfunded.escada.umaFase": "1 fase · difícil",
    "mtmfunded.escada.duasFases": "2 fases",

    "mtmfunded.passos.titulo": "Como funciona",
    "mtmfunded.regras.titulo": "O que podes e não podes fazer",
    "mtmfunded.regras.titulo2": "Regras claras, sem letra pequena",
    "mtmfunded.certificados.titulo": "Certificados",
    "mtmfunded.certificados.verificar": "verificar",
    "mtmfunded.certificados.exemplar": "exemplar",

    "mtmfunded.entrar.titulo": "Entrar",
    "mtmfunded.entrar.criar": "Criar conta",
    "mtmfunded.entrar.jaTenho": "Já tenho conta",
    "mtmfunded.entrar.naoTenho": "Ainda não tenho conta",
    "mtmfunded.entrar.email": "Email",
    "mtmfunded.entrar.password": "Palavra-passe",

    "mtmfunded.conta.primeiroNome": "Primeiro nome",
    "mtmfunded.conta.apelido": "Apelido",
    "mtmfunded.conta.pais": "País",
    "mtmfunded.conta.telemovel": "Telemóvel",
    "mtmfunded.conta.nascimento": "Data de nascimento",

    "mtmfunded.painel.dashboard": "Dashboard",
    "mtmfunded.painel.contas": "Contas de Trading",
    "mtmfunded.painel.contratos": "Contratos",
    "mtmfunded.painel.levantamentos": "Levantamentos",
    "mtmfunded.painel.competicoes": "Competições",
    "mtmfunded.painel.classificacao": "Classificação",
    "mtmfunded.painel.terminal": "Terminal MTM",
    "mtmfunded.painel.certificados": "Certificados",
    "mtmfunded.painel.comunidade": "Comunidade",
    "mtmfunded.painel.apoio": "Apoio",

    "mtmfunded.levantar.pedir": "Pedir levantamento",
    "mtmfunded.levantar.disponivel": "Levantável",
    "mtmfunded.levantar.almofada": "Almofada (3%)",
    "mtmfunded.levantar.copiar": "copiar",
    "mtmfunded.levantar.copiado": "copiado",

    "mtmfunded.rodape.produto": "Produto",
    "mtmfunded.rodape.legal": "Legal",
    "mtmfunded.rodape.risco": "Aviso de risco",

    // ── rodapé ──
    "mtmfunded.rodape.tagline": "Avaliação de traders em contas simuladas. Regras publicadas, métricas à vista.",
    "mtmfunded.rodape.avisoTitulo": "Aviso de risco",
    "mtmfunded.rodape.aviso": "Todas as contas do MTM Funded — de torneio, de avaliação e financiadas — são contas de demonstração, com dinheiro virtual. Não há execução em mercado real, não são depositados nem geridos fundos de participantes, e nada aqui é aconselhamento financeiro ou de investimento. Nas contas financiadas, o Fundo MTM aloca capital real correspondente a 10% do valor nominal da conta, e a participação nos resultados é de 75% para o trader.",
    "mtmfunded.rodape.termos": "Termos e Condições",
    "mtmfunded.rodape.privacidade": "Privacidade",
    "mtmfunded.rodape.reembolsos": "Reembolsos",
    "mtmfunded.rodape.tt": "Trading Tournament",
    "mtmfunded.rodape.faq": "Perguntas frequentes",

    // ── painel ──
    "mtmfunded.painel.ola": "Olá",
    "mtmfunded.painel.admin": "Admin",
    "mtmfunded.painel.inscrever": "Inscrever-me",
    "mtmfunded.painel.aInscrever": "A inscrever…",
    "mtmfunded.painel.mostrarCred": "Mostrar credenciais",
    "mtmfunded.painel.aLer": "A ler…",
    "mtmfunded.painel.esconder": "Esconder",
    "mtmfunded.painel.login": "Login",
    "mtmfunded.painel.servidor": "Servidor",
    "mtmfunded.painel.palavraPasse": "Palavra-passe",
    "mtmfunded.painel.investidor": "Investidor (só leitura)",
    "mtmfunded.painel.qrToque": "Entrar na app com um toque",
    "mtmfunded.painel.qrComo": "No MetaTrader 5 do telemóvel: Nova conta → Entrar com código QR.",
    "mtmfunded.painel.semContas": "Ainda não tens contas.",
    "mtmfunded.painel.aEmitir": "a emitir",
    "mtmfunded.painel.saldoInicial": "Saldo inicial",
    "mtmfunded.painel.alavancagem": "Alavancagem",
    "mtmfunded.painel.estado": "Estado",
    "mtmfunded.painel.equity": "Equity",
    "mtmfunded.painel.posicao": "Posição",
    "mtmfunded.painel.resultado": "Resultado",
    "mtmfunded.painel.semTorneio": "Não há torneio a decorrer.",
    "mtmfunded.painel.credBloqueadas": "As credenciais desta conta abrem na véspera do torneio.",

    // ── levantamentos ──
    "mtmfunded.levantar.titulo": "Como se levanta",
    "mtmfunded.levantar.quota": "75% do lucro é teu.",
    "mtmfunded.levantar.quotaNota": "Os 25% restantes ficam para a MTM, que suporta o capital real, a infraestrutura e o risco.",
    "mtmfunded.levantar.almofadaNota": "Só é levantável o que passar de 3% de lucro sobre o saldo inicial. A almofada fica na tua conta e continua a ser tua para negociar — não é uma retenção.",
    "mtmfunded.levantar.pagamento": "Pagamento por depósito na PU Prime.",
    "mtmfunded.levantar.pagamentoNota": "Em USDC, rede Solana, para o endereço que a própria corretora gera na tua conta.",
    "mtmfunded.levantar.semContrato": "Falta assinar o contrato",
    "mtmfunded.levantar.irContrato": "Ir ao contrato",
    "mtmfunded.levantar.enviar": "Enviar pedido",
    "mtmfunded.levantar.cancelar": "Cancelar",

    // ── contrato ──
    "mtmfunded.contrato.titulo": "Contrato de Trader Financiado",
    "mtmfunded.contrato.assinado": "Assinado",
    "mtmfunded.contrato.assinar": "Assinar contrato",
    "mtmfunded.contrato.aAssinar": "A assinar…",
    "mtmfunded.contrato.nomeCompleto": "Nome completo",
    "mtmfunded.contrato.aviso": "Assina para poderes pedir levantamentos. É o documento que diz em que termos é que o dinheiro sai — vale a pena lê-lo antes de assinar, não depois.",
  },
  en: {
    "mtmfunded.nav.programas": "Programs",
    "mtmfunded.nav.torneio": "Tournament",
    "mtmfunded.nav.faq": "FAQ",
    "mtmfunded.nav.area": "My area",

    "mtmfunded.hero.kicker": "More Than Money",
    "mtmfunded.hero.titulo": "Prove what you're worth on an evaluated account.",
    "mtmfunded.hero.sub":
      "You pick the size, you trade with the rules in plain sight, and the metrics update on their own. No small print and no promises of returns.",
    "mtmfunded.hero.ver": "See the programs",
    "mtmfunded.hero.torneio": "Free tournament",

    "mtmfunded.facto.simuladas": "Simulated accounts",
    "mtmfunded.facto.simuladasNota": "Virtual money. No participant funds are held anywhere.",
    "mtmfunded.facto.regras": "Published rules",
    "mtmfunded.facto.regrasNota": "Before you sign up, and they don't change mid-challenge.",
    "mtmfunded.facto.classificacao": "Public leaderboard",
    "mtmfunded.facto.classificacaoNota":
      "Updated hourly, and it says why anyone isn't counting yet.",

    "mtmfunded.escada.titulo": "Pick the size — and the path",
    "mtmfunded.escada.conta": "Account",
    "mtmfunded.escada.caminho": "Path",
    "mtmfunded.escada.objetivo": "Target",
    "mtmfunded.escada.perdaDiaria": "Daily loss",
    "mtmfunded.escada.perdaMaxima": "Max loss",
    "mtmfunded.escada.diasMin": "Min. days",
    "mtmfunded.escada.preco": "Price",
    "mtmfunded.escada.comecar": "Start",
    "mtmfunded.escada.brevemente": "Coming soon",
    "mtmfunded.escada.umaFase": "1 phase · hard",
    "mtmfunded.escada.duasFases": "2 phases",

    "mtmfunded.passos.titulo": "How it works",
    "mtmfunded.regras.titulo": "What you can and can't do",
    "mtmfunded.regras.titulo2": "Clear rules, no small print",
    "mtmfunded.certificados.titulo": "Certificates",
    "mtmfunded.certificados.verificar": "verify",
    "mtmfunded.certificados.exemplar": "sample",

    "mtmfunded.entrar.titulo": "Sign in",
    "mtmfunded.entrar.criar": "Create account",
    "mtmfunded.entrar.jaTenho": "I already have an account",
    "mtmfunded.entrar.naoTenho": "I don't have an account yet",
    "mtmfunded.entrar.email": "Email",
    "mtmfunded.entrar.password": "Password",

    "mtmfunded.conta.primeiroNome": "First name",
    "mtmfunded.conta.apelido": "Last name",
    "mtmfunded.conta.pais": "Country",
    "mtmfunded.conta.telemovel": "Mobile phone",
    "mtmfunded.conta.nascimento": "Date of birth",

    "mtmfunded.painel.dashboard": "Dashboard",
    "mtmfunded.painel.contas": "Trading Accounts",
    "mtmfunded.painel.contratos": "Contracts",
    "mtmfunded.painel.levantamentos": "Withdrawals",
    "mtmfunded.painel.competicoes": "Competitions",
    "mtmfunded.painel.classificacao": "Leaderboard",
    "mtmfunded.painel.terminal": "MTM Terminal",
    "mtmfunded.painel.certificados": "Certificates",
    "mtmfunded.painel.comunidade": "Community",
    "mtmfunded.painel.apoio": "Support",

    "mtmfunded.levantar.pedir": "Request withdrawal",
    "mtmfunded.levantar.disponivel": "Withdrawable",
    "mtmfunded.levantar.almofada": "Cushion (3%)",
    "mtmfunded.levantar.copiar": "copy",
    "mtmfunded.levantar.copiado": "copied",

    "mtmfunded.rodape.produto": "Product",
    "mtmfunded.rodape.legal": "Legal",
    "mtmfunded.rodape.risco": "Risk warning",

    // ── footer ──
    "mtmfunded.rodape.tagline": "Trader evaluation on simulated accounts. Published rules, visible metrics.",
    "mtmfunded.rodape.avisoTitulo": "Risk warning",
    "mtmfunded.rodape.aviso": "Every MTM Funded account — tournament, evaluation and funded — is a demo account with virtual money. There is no execution in a real market, no participant funds are deposited or managed, and nothing here is financial or investment advice. On funded accounts, the MTM Fund allocates real capital equal to 10% of the account's nominal value, and the profit split is 75% to the trader.",
    "mtmfunded.rodape.termos": "Terms and Conditions",
    "mtmfunded.rodape.privacidade": "Privacy",
    "mtmfunded.rodape.reembolsos": "Refunds",
    "mtmfunded.rodape.tt": "Trading Tournament",
    "mtmfunded.rodape.faq": "Frequently asked questions",

    // ── panel ──
    "mtmfunded.painel.ola": "Hello",
    "mtmfunded.painel.admin": "Admin",
    "mtmfunded.painel.inscrever": "Sign up",
    "mtmfunded.painel.aInscrever": "Signing up…",
    "mtmfunded.painel.mostrarCred": "Show credentials",
    "mtmfunded.painel.aLer": "Reading…",
    "mtmfunded.painel.esconder": "Hide",
    "mtmfunded.painel.login": "Login",
    "mtmfunded.painel.servidor": "Server",
    "mtmfunded.painel.palavraPasse": "Password",
    "mtmfunded.painel.investidor": "Investor (read only)",
    "mtmfunded.painel.qrToque": "Sign in to the app with one tap",
    "mtmfunded.painel.qrComo": "In MetaTrader 5 on your phone: New account → Sign in with QR code.",
    "mtmfunded.painel.semContas": "You don't have any accounts yet.",
    "mtmfunded.painel.aEmitir": "being issued",
    "mtmfunded.painel.saldoInicial": "Starting balance",
    "mtmfunded.painel.alavancagem": "Leverage",
    "mtmfunded.painel.estado": "Status",
    "mtmfunded.painel.equity": "Equity",
    "mtmfunded.painel.posicao": "Position",
    "mtmfunded.painel.resultado": "Result",
    "mtmfunded.painel.semTorneio": "No tournament running.",
    "mtmfunded.painel.credBloqueadas": "This account's credentials unlock the day before the tournament.",

    // ── withdrawals ──
    "mtmfunded.levantar.titulo": "How withdrawals work",
    "mtmfunded.levantar.quota": "75% of the profit is yours.",
    "mtmfunded.levantar.quotaNota": "The other 25% goes to MTM, which carries the real capital, the infrastructure and the risk.",
    "mtmfunded.levantar.almofadaNota": "Only what goes beyond 3% profit on the starting balance is withdrawable. The cushion stays in your account and remains yours to trade — it is not withheld.",
    "mtmfunded.levantar.pagamento": "Paid as a deposit into PU Prime.",
    "mtmfunded.levantar.pagamentoNota": "In USDC, Solana network, to the address the broker itself generates in your account.",
    "mtmfunded.levantar.semContrato": "The contract isn't signed yet",
    "mtmfunded.levantar.irContrato": "Go to the contract",
    "mtmfunded.levantar.enviar": "Send request",
    "mtmfunded.levantar.cancelar": "Cancel",

    // ── contract ──
    "mtmfunded.contrato.titulo": "Funded Trader Contract",
    "mtmfunded.contrato.assinado": "Signed",
    "mtmfunded.contrato.assinar": "Sign contract",
    "mtmfunded.contrato.aAssinar": "Signing…",
    "mtmfunded.contrato.nomeCompleto": "Full name",
    "mtmfunded.contrato.aviso": "Sign this so you can request withdrawals. It is the document that sets out the terms on which money leaves — worth reading before signing, not after.",
  },
}
