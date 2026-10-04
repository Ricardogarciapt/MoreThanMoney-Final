# IA gratuita com redundância — `lib/ia/`

**O problema (04/10/2026):** o Terminal MTM mostrou ao dono o erro cru da Anthropic
`400 … Your credit balance is too low`. Havia 31 ficheiros a chamar a Anthropic à mão, 12 a
OpenAI e 1 o Groq, sem nada no meio: uma conta sem crédito deitava tudo abaixo e ninguém sabia
antes do cliente.

**A solução:** toda a IA do site passa por UMA porta, `chamarIA()` em `lib/ia/chamar.ts`, que
percorre uma cadeia de fornecedores — grátis primeiro — e grava cada chamada num livro.

## A cadeia, por ordem

| # | Fornecedor | Custo | Modelo (default) | Porquê nesta posição |
|---|---|---|---|---|
| 1 | **Groq** | grátis | `llama-3.3-70b-versatile` (qualidade) / `llama-3.1-8b-instant` (rápido) | o mais rápido de todos; as páginas esperam por ele |
| 2 | **Gemini** | grátis | `gemini-3.8-flash` / `gemini-3.8-flash` | tem visão e JSON nativo, mas é mais lento e o limite diário do grátis é mais curto — reserva do grátis |
| 3 | **Ollama** | zero por chamada | `OLLAMA_MODEL` (default `llama3.2:3b`) | nosso, mas lento em CPU (tecto 60 s); **só entra se `OLLAMA_URL` existir** |
| 4 | **OpenAI** | pago | `gpt-4o-mini` | reserva paga; só se houver chave |
| 5 | **Anthropic** | pago | `modeloClaude()` | última reserva; a 04/10 **sem crédito** |

Regras do núcleo:

- Fornecedor **sem chave é saltado** — não conta como tentativa falhada.
- Falha de conta/ritmo/servidor (401, 402, 403, 404 de modelo, 429, 5xx, timeout, «credit
  balance») → **passa ao seguinte**. Uma tentativa por fornecedor, nunca em ciclo.
- **400 por pedido mal formado NÃO passa**: rebenta, porque é bug nosso e esconder-o atrás de
  uma «reserva» seria pior.
- Pedido com **imagens**: só entram fornecedores com visão (Gemini, OpenAI, Anthropic).
- `json: true`: pede modo JSON nativo onde existe; se a resposta não for JSON tenta extrair UM
  bloco; se não der, é falha do fornecedor (passa ao seguinte). Nunca devolve prosa como JSON.
- **Todos falham → lança `ErroIA`** com a lista «groq (429 …); openai (500 …)». **Nunca** texto
  inventado a fingir que é IA. Quem chama mostra `mensagemIndisponivel(err)`.
- `emReserva: true` sempre que quem respondeu não foi o primeiro fornecedor disponível.

Timeouts: 25 s por fornecedor (`IA_TIMEOUT_MS`), Ollama 60 s (`OLLAMA_TIMEOUT_MS`); o pedido
pode encurtar com `timeoutMs`.

## Variáveis de ambiente

| Variável | Para quê | Onde se tira | Estado em produção (04/10) |
|---|---|---|---|
| `GROQ_API_KEY` | Groq | [console.groq.com](https://console.groq.com) → API Keys | **existe** |
| `GROQ_MODEL` | forçar modelo | — | opcional |
| `GEMINI_API_KEY` | Gemini | [aistudio.google.com](https://aistudio.google.com) → Get API key | **NÃO existe** — o Gemini fica na cadeia mas é saltado até o dono criar a chave |
| `GEMINI_MODEL` | forçar modelo | — | opcional |
| `OLLAMA_URL` | activa o Ollama (ex.: `https://ollama.com` ou `http://ip:11434`) | servidor nosso ou nuvem ollama.com | **NÃO existe** — o Ollama está fora da cadeia |
| `OLLAMA_TOKEN` (ou `OLLAMA_API_KEY`) | Bearer, se o servidor pedir | — | existe `OLLAMA_API_KEY`, mas sem `OLLAMA_URL` não activa nada; não se assume para onde aponta |
| `OLLAMA_MODEL` | modelo | — | default `llama3.2:3b` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | OpenAI (pago) | platform.openai.com | existe |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic (pago) | console.anthropic.com | existe, **sem crédito** |
| `IA_TIMEOUT_MS`, `OLLAMA_TIMEOUT_MS` | tectos | — | opcional |

Sobre o Ollama em servidor próprio: o VPS de streaming NÃO tem Ollama e está saturado (load 6
em 2 vCPU). É decisão em aberto do dono; o código espera por `OLLAMA_URL`.

**Limites dos planos grátis:** mudam com frequência e por modelo. Não se escrevem números aqui
para não ficarem errados — ver a página de limites de cada fornecedor: Groq em
console.groq.com → Settings → Limits; Gemini em ai.google.dev → Pricing/Rate limits. O livro
(abaixo) mostra quando um deles começa a dar 429 e a cadeia passa ao seguinte.

## Como usar

```ts
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'

try {
  const r = await chamarIA({
    tarefa: 'mtm-terminal',          // etiqueta no livro
    sistema: '…prompt de sistema…',
    mensagens: [{ role: 'user', content: '…' }],
    maxTokens: 1024,
    json: true,                       // r.texto vem com JSON válido
    preferencia: 'qualidade',         // ou 'rapido'
  })
  // r.texto, r.fornecedor, r.modelo, r.emReserva, r.tentativas, r.custoCents
} catch (err) {
  // mostrar ao utilizador, nunca o JSON cru de um fornecedor:
  return NextResponse.json({ error: mensagemIndisponivel(err) }, { status: 503 })
}
```

Contrato completo em `lib/ia/tipos.ts`. Acrescentar um fornecedor = um ficheiro novo em
`lib/ia/fornecedores/` com a interface `Fornecedor` e uma entrada em `CADEIA`.

## O livro — `ia_chamadas` (migração 175)

Cada chamada deixa uma linha: `tarefa`, `fornecedor`, `modelo`, `em_reserva`, `tentativas`
(jsonb, quem falhou antes e porquê), `saltados`, `tokens_entrada/saida`, `custo_cents` (0 nos
grátis, **estimado** nos pagos — tabela em `lib/ia/custos.ts`), `duracao_ms`, `sucesso`, `erro`.
O livro nunca impede a resposta: sem `SUPABASE_SERVICE_ROLE_KEY` ou com a base em baixo, avisa
na consola e a IA responde na mesma.

Leitura rápida (SQL Editor do Supabase, só service role):

```sql
-- quem está a responder e quanto custa, últimos 30 dias
select * from ia_chamadas_resumo;

-- quem está a falhar e porquê, hoje
select criado_em, tarefa, tentativas, erro
from ia_chamadas
where not sucesso and criado_em > now() - interval '1 day'
order by criado_em desc;

-- quantas vezes respondeu a reserva (sinal de que o 1.º da cadeia está a falhar)
select fornecedor, count(*) from ia_chamadas
where em_reserva and criado_em > now() - interval '7 days'
group by 1;
```

## Guarda

`npx tsx lib/ia/chamar.check.ts` — com fornecedores falsos, prova: (a) 402 «credit balance» no
1.º → o 2.º responde com `emReserva=true`; (b) todos falham → lança a nomear fornecedores e
erros; (c) 400 mal formado NÃO salta; (d) sem chave é saltado sem contar como falha; (e) JSON
pedido e não devolvido → extrai uma vez ou falha claro; (f) livro a falhar não impede resposta;
(g) timeout passa ao seguinte; (h) uma tentativa por fornecedor.

`npx tsx lib/__tests__/app-mobile-ia.check.ts` — guarda da app `/app-mobile`: segue em código os
`fetch('/api/…')` de todos os componentes que a app monta (incl. a página embutida `/mtmsocial`),
resolve cada rota ao ficheiro e aos imports do servidor, e FALHA se algum voltar a importar
`@anthropic-ai/sdk`/`openai` ou a ler `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (ou Gemini/Groq à mão)
fora de `lib/ia/`. Com `--mapa` imprime componente → rota → usa IA → migrada.

**Quota do Gemini grátis (visto a 04/10):** o limite diário é de **20 pedidos por dia POR MODELO**
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Esgotado o `gemini-3.8-flash`, os
`gemini-3.7-flash`, `3.6`, `3.5-flash-lite` e `3.1-flash-lite` respondiam com a mesma chave — é
quota por modelo, não por chave. Sem Groq, o Gemini sozinho não aguenta um dia de app.

## Já migrados (04/10)

`lib/mtm-terminal-analysis.ts` + `app/api/mtm-terminal/analyze/route.ts`,
`app/api/mtmsocial/criar/route.ts`, `lib/dca-ai-summary.ts`, `app/api/portfolio/ai-tp-sl/route.ts`,
`app/api/portfolio/dca-analysis/route.ts`, `app/api/portfolio/rebalance-analyze/route.ts`,
`app/api/mentor/ai-chat/route.ts`, `app/api/ai/chat/route.ts`. Os restantes ~35 ficheiros com
chamadas directas (`grep -rl "ANTHROPIC_API_KEY\|OPENAI_API_KEY" lib app`) migram-se da mesma
forma: sai o `fetch` ao fornecedor, entra `chamarIA`, o `catch` mostra `mensagemIndisponivel`.
