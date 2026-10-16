# CRM bots — activação controlada

## Caminho implementado

```
Telegram (privado, autenticado) → RPC de entrada ──────────────┐
Instagram DM (assinatura Meta) → ig_dm_log → trigger ────────┼→ crm_bots_fila
WhatsApp (assinatura Meta) → whatsapp_mensagens → trigger ────┘
  → reserva com lease → chamarIA → validação → transacção de conclusão
  → vendas_negocios → responsável humano → /backoffice/pipeline
  → /agendar → confirmação real → etapa marcado
```

O worker não depende de uma chamada HTTP do bot para si mesmo, nem de um segundo bot Telegram.
Instagram usa `account_id:sender_id` para identificar a conversa; um scoped ID não é um username.
Ainda não se descobre automaticamente que dois perfis sem contactos coincidentes são a mesma
pessoa. Não se fundem pessoas por nomes parecidos. Também não se extraem telefones arbitrários de
texto livre nem se infere um telefone a partir do Telegram/Instagram.

A captura exclui o chat administrativo Telegram configurado e os números WhatsApp que coincidam
com phone/whatsapp de profiles. Não garante reconhecer todos os clientes sem identidade ligada
(por exemplo um scoped ID Instagram novo); rever estes casos antes de envios comerciais.

Cada qualificação recebe a mensagem de entrada actual (máximo 4000 caracteres), não a conversa
inteira. A classificação A exige pedido explícito de contacto humano; B é interesse concreto e C
é informação insuficiente. Valida JSON, confiança >=0,8 e evidência literalmente presente no texto.
Resposta duvidosa ou pedido de saída → `revisao`, não decisão automatizada. Esta política é
conservadora: não se pontua a riqueza nem a adequação financeira da pessoa.

## Pré-requisitos e ordem de publicação

**Não fazer merge/publicar antes de preparar as migrações e os segredos.**

1. Configurar uma base Supabase de teste com o esquema actual do projecto e credenciais próprias
   em Preview. Não usar a service role de produção para desbloquear o build de Preview.
2. Aplicar 203 e 204 na base de teste, por esta ordem. 204 requer `site_settings`, `ig_dm_log` e
   `whatsapp_mensagens` existentes. Revê os nomes/esquema reais antes de executar. A fila nasce
   desligada; as triggers não fazem backfill de mensagens históricas.
3. Configurar na Vercel, apenas servidor e no ambiente correcto:
   - Supabase URL, anon e service role da **base correspondente**;
   - `CRON_SECRET`: pelo menos 32 caracteres aleatórios (mesmo valor no scheduler autorizado);
   - `INSTAGRAM_APP_SECRET`: App Secret da app Meta usada no webhook Instagram;
   - `WHATSAPP_APP_SECRET`: App Secret da app Meta usada no webhook WhatsApp;
   - `TELEGRAM_WEBHOOK_SECRET`: manter a configuração existente, preferir o cabeçalho nativo
     `x-telegram-bot-api-secret-token`. O parâmetro antigo continua aceite por compatibilidade;
   - credenciais de pelo menos um fornecedor de `chamarIA`. Ollama só se já tiver endpoint real
     configurado e acessível ao runtime; este PR não instala nem valida esse servidor na VPS.
   - `AUTOMATION_SECRET_KEY`: só é preciso para o endpoint externo `/api/leads`, não para a fila nativa.
4. Rever a app Meta correcta para cada segredo. **Tokens de acesso não são App Secrets.** A nova
   versão recusa os POST Meta sem assinatura/segredo; publicar sem estas variáveis interrompe o
   processamento desses webhooks. Não acrescentar um bypass para o ensaio.
5. Publicar Preview e testar com apps/contas de teste. O cron usa a rota `/api/cron/crm-bots`;
   em ambiente de teste invocá-la a partir de um cliente autorizado fora desta sandbox, sem expor
   o segredo em argumentos, URLs, logs ou capturas. O relógio automático destina-se a produção.
6. Activar na base de teste, só depois de preparado o runtime:

```sql
update public.site_settings set value='true'::jsonb where key='crm_bots_ligado';
```

7. Cumprir a matriz de aceitação abaixo. Só depois repetir migrações/configuração em produção,
   publicar o código revisto e activar o interruptor. Não activar fluxos de massa como primeiro teste.
8. Para agendamento pela VPS, ver `deploy/crm-bots/README.md`. Escolher Vercel ou VPS como scheduler
   principal. Não substituir os serviços de trading/WhatsApp já instalados.

## Matriz de aceitação REAL (ainda não executada)

Usar contas de teste controladas e identificadas, não clientes reais.

- Mensagem privada no Telegram → uma linha na fila → negócio atribuído ou bolsa se não houver equipa.
- DM Instagram e mensagem WhatsApp assinadas → fila → score/resumo no pipeline.
- Assinatura inválida → 401, sem processamento; validar com fixtures locais, sem atacar o endpoint real.
- Reentrega do mesmo evento → uma linha de fila e nenhum negócio duplicado.
- Dois consumidores → itens diferentes; worker que perde lease não grava/atribui.
- Fornecedor IA indisponível → retry com backoff; após cinco tentativas/leases → `morto`.
- JSON/evidência inválida, pedido para parar, identidade ambígua → revisão; nenhum novo envio pelo worker.
- Closer/setter com negócio trabalhado → donos, notas e estado preservados.
- Marcação em `/agendar` com o contacto conhecido → `marcado`, histórico e notas preservados.
- Conta humana vê só o seu âmbito no pipeline, que refresca a cada 30 s quando não está a editar.
- Confirmar logs Vercel, endpoint de estado e (se usado) journal do serviço VPS.

## Monitorização e recuperação

`GET /api/admin/crm/estado` exige sessão admin verificada; devolve contagens exactas por estado,
idade do item mais antigo e presença (não valores) da configuração. Sem migrações devolve 503,
não uma fila vazia a fingir que está tudo bem. Não devolve textos nem contactos.

A fila não perde o item quando o modelo falha. Faz uma tentativa por invocação, com lease de cinco
minutos, retry exponencial e máximo cinco tentativas. Um POST repetido não cria novo trabalho. O
limite é **um item por invocação** (~1/min com o cron actual): medir volume antes de aumentar os
consumidores. A serialização de distribuição é a mesma da fase 1; não abrange outros escritores.

```sql
-- Operador autorizado, sem exportar corpos ou contactos para logs:
select estado,count(*) from public.crm_bots_fila group by estado;
select id,estado,tentativas,erro_codigo,criado_em
from public.crm_bots_fila where estado in ('morto','revisao') order by criado_em;
```

Rever a causa de cada `morto`/`revisao` antes de reprocessar. Uma revisão humana pode trabalhar o
negócio directamente no backoffice; não fazer um UPDATE massivo para contornar uma recusa. Não
alterar o payload de um evento concluído nem apagar os recibos para forçar repetição.
Definir com o responsável RGPD o prazo de retenção de mensagens/qualificações e procedimento de
eliminação; o PR não executa limpezas automáticas nem altera consentimentos. As tabelas da fila são
restritas a service role. Os controlos de envio/opt-out dos bots existentes continuam essenciais:
o worker não substitui esses controlos e não bloqueia por si todas as respostas já existentes.

Rollback: desligar `crm_bots_ligado`, parar timer VPS se instalado e reverter o código. Não remover
assinaturas de segurança como forma de corrigir uma configuração errada. Conservar migrações e
recibos até revisão do operador; parar a fila não desfaz negócios já atribuídos.

## Verificação desta entrega

Passaram testes locais de contrato, recusas HTTP, assinatura Meta, qualificação, worker injectado,
SQL PostgreSQL WASM (migrações 203/204, triggers, dedup, leasing, fencing, retry/revisão/morto),
regressões de âmbito/propagação e lint/typecheck focados. O teste SQL usa um esquema mínimo isolado.
O script VPS passou `node --check`, não foi instalado nem executado contra produção.

O preview da fase anterior compilou mas falhou ao recolher dados de página porque uma rota
existente inicializa Supabase sem chave Preview (`supabaseKey is required`). Não foi resolvido
copiando credenciais de produção. Build integral, chamadas aos fornecedores, Meta, Telegram,
SSH/VPS, migrações reais e teste ponta a ponta permanecem por verificar. **Código interligado e
testes locais não equivalem a um sistema activado em ambiente real.**
