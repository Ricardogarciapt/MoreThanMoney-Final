# Três funis prontos para publicidade (17/11/2026)

Pedido do Ricardo (tarefa t23 do MTMOS): Educação, Rota Corretora e MTM Funded separados, prontos
para ligar anúncios. Conduta v2: cada funil tem página, captação com consentimento, seguimento
automático e medição.

| Funil | Página | Interesse no pedido | Atalho para quem já decidiu |
|---|---|---|---|
| Educação (Membro/Premium) | `/f/educacao` | Formação | `/register` (trial Premium) |
| Rota Corretora (IB PU Prime) | `/f/corretora` | Rota Corretora | `/l/corretora` (link do dia) |
| MTM Funded (simulado) | `/f/funded` | MTM Funded | `/mtmfunded` |

Texto em `lib/funis-publicidade.ts`; guardas em `npx tsx lib/funis-publicidade.check.ts` (sem
promessas de retorno, sem percentagens, sem «gestão de carteira», «prop firm» só negado, sem «você»).

## O caminho de um lead

1. Anúncio com UTM → `/f/<funil>?utm_source=meta&utm_medium=paid&utm_campaign=…&utm_content=…`
2. O formulário «Quero que me liguem» (o mesmo de `/ligar`) grava em `pedidos_contacto` com a origem
   `funil:<chave>?s=…&c=…&a=…`, e uma linha por canal marcado em `captacao_consentimento`.
3. **Seguimento automático (já existia):** tarefa `envio:contacto_imediato` para o setter com o
   primeiro texto escrito, e aviso no Telegram de admin. Sem caixa marcada não há contacto.
4. **Medição:** aviso de cookies próprio nas páginas `/f/*`. Só depois de «Aceitar» é que o pixel
   Meta carrega (`PageView`, `ViewContent`) e o envio do formulário dispara `Lead` com
   `content_category = <funil>`. Sem `NEXT_PUBLIC_META_PIXEL_ID` não aparece aviso nem pixel.
5. **CRM:** `funilDaOrigem(origem)` devolve a chave (`educacao|corretora|funded`), as mesmas de
   `vendas_negocios.funil` (PR #262), para o pipeline classificar o negócio sem palpites.

## Links prontos para os anúncios

Gerados por `linkDoAnuncio()`; trocar `t1` pelo nome da campanha e `a`/`b`/`c` pelo anúncio.

- `https://www.morethanmoney.pt/f/educacao?utm_source=meta&utm_medium=paid&utm_campaign=edu-t1&utm_content=a`
- `https://www.morethanmoney.pt/f/corretora?utm_source=meta&utm_medium=paid&utm_campaign=corretora-t1&utm_content=a`
- `https://www.morethanmoney.pt/f/funded?utm_source=meta&utm_medium=paid&utm_campaign=funded-t1&utm_content=a`

## Ganchos A/B por funil (texto do anúncio)

Categoria especial Meta: **Serviços financeiros**. Sempre com «Conteúdo educativo. Trading envolve risco.»

**Educação**
- A: «Antes de arriscar um euro, aprende a ler o gráfico. 3 dias de Premium, sem cartão.»
- B: «Trading com método e gestão de risco, em português. Fala connosco 15 minutos.»

**Rota Corretora**
- A: «A conta é tua, o dinheiro fica contigo. O Premium MoreThanMoney vem incluído.»
- B: «Ajudamos-te a abrir conta numa corretora regulada, passo a passo.»
  (Vídeo já carregado na Meta: `public/videos/stories/corretora-pt.mp4`, rascunho T1.)

**MTM Funded**
- A: «Prova o teu método em conta simulada, com regras claras e classificação pública.»
- B: «Sem capital para arriscar? Começa por um desafio simulado. Não é prop firm.»

## O que falta (fora do código)

1. **Pixel:** criar/escolher o conjunto de dados (pixel) na BM `1088102417270979` e pôr o ID em
   `NEXT_PUBLIC_META_PIXEL_ID` (Vercel, Production) + redeploy.
2. **Pagamento** na conta de anúncios com os IG (BM `1088102417270979`), ou usar a `237752214` só com
   o IG @morethanmoney.pt (já aceite nos criativos).
3. **OK do Ricardo ao orçamento** (teto: 10 % da receita do mês, máx. 150 €/mês). Campanhas criam-se em
   pausa até lá.
4. Opcional: Conversions API no servidor (evento `Lead` a partir de `pedidos_contacto`) para medir
   quem recusa cookies de forma agregada; só depois do pixel ligado.
