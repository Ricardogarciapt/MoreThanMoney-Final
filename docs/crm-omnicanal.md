# CRM omnicanal — ponte para o sistema existente

## O que esta entrega implementa

A primeira camada do manual: entrada autenticada de leads já qualificados, score A/B/C,
deduplicação, distribuição humana por carga e sincronização de marcações confirmadas.
O destino é **`vendas_negocios`**, já usado no backoffice e na máquina de vendas.
Não existem novas tabelas `leads`/`team_agents`, nem novas contas/papéis ou comissões.

- `POST /api/leads` aceita o JSON estruturado do manual ou o formato simples abaixo.
- A → closer; B/C → setter. Usa `backoffice_papeis` com `retirado_at IS NULL`.
- Escolhe quem tem menos negócios abertos nesse papel; desempata pela antiguidade do papel e UUID.
  Não mantém contadores que possam ficar errados quando uma transacção falha.
- Se não houver alguém elegível, fica na bolsa. Não inventa um vendedor.
- Preserva todos os donos humanos e a nota humana; não reabre ganhos/perdidos, não recua etapas.
- `crm_ai_score`, `crm_ai_resumo`, `crm_ai_qualificacao` guardam os dados da IA separadamente.
- `Idempotency-Key` identifica o evento. Repetir a mesma chave com os mesmos dados normalizados
  não repete atribuições nem eventos. Dados diferentes com a mesma chave devolvem 409.
- Contactos coincidentes ligam ao negócio existente, independentemente do canal. Mais de um
  candidato devolve 409 para revisão humana, em vez de escolher ao acaso.
- A agenda própria liga a marcação ao negócio e avança para `marcado` quando o tipo o determina.
  Não apaga notas. Um LLM não pode confirmar uma marcação nem fechar uma venda.

A serialização com advisory lock protege as chamadas destas duas funções entre si; não substitui
as regras de concorrência de outros escritores do pipeline. O registo de recepção e a atribuição
são atómicos. O teste SQL é PostgreSQL WASM isolado, não uma validação do Supabase de produção.

## Activação (não executada por este PR)

1. Rever e aplicar `supabase/migrations/203_crm_omnicanal.sql` **antes de publicar o código**,
   pelo processo habitual de migrações. É aditiva; requer as migrações existentes de pipeline,
   papéis e agenda. Não executar o SQL do manual em paralelo.
2. Nas variáveis de ambiente do projecto, definir `AUTOMATION_SECRET_KEY` com um segredo aleatório
   de pelo menos 32 caracteres, apenas no servidor e no ambiente pretendido. Guardá-lo também no
   gestor de credenciais do integrador (n8n/WACRM). Nunca o colocar no browser, no Git ou em URLs.
   Reutiliza `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` existentes.
3. Publicar o PR num ambiente de teste com uma base separada. Não usar contactos reais no ensaio.
4. Configurar o integrador para enviar o segredo em `x-mtm-secret`, JSON no corpo e um ID estável
   do evento em `Idempotency-Key`. Em retries, reutilizar ambos o ID e o corpo. Repetir apenas
   falhas transitórias/503 com backoff. 400/403/409 requerem correcção/revisão, não loops infinitos.
5. Ensaiar o mesmo evento duas vezes, duas identidades conflitantes, ausência de vendedores e
   uma marcação na agenda própria. Confirmar o negócio no backoffice e o histórico.
6. Só depois ligar o tráfego real. A chave pode ser rodada no servidor e no integrador em conjunto.

Não é necessário Cal.com nem um segundo bot Telegram: a casa já tem `/agendar` e webhook Telegram.
O URL devolvido é o da agenda da casa; `cal_injection_url` do payload é ignorado. Não inclui contactos
ou segredos em query strings. O agendamento faz a correspondência por email/telefone: se o convidado
usar contactos diferentes, é necessária revisão humana (não confia num `lead_id` editável no URL).

### Contrato simples

```json
{
  "name": "Lead de teste",
  "email": "lead@example.test",
  "phone": "+351910000001",
  "channel": "whatsapp",
  "aiScore": "A",
  "aiSummary": "Pretende conhecer o produto educativo.",
  "stage": "QUALIFIED_SETTER"
}
```

Contacto identificável obrigatório: email, telefone internacional com `+`, `telegram_id` ou
`instagram_username`. Canais: instagram, telegram, whatsapp, site, email. O corpo máximo é 32 KiB.
O esquema estruturado do manual é aceite com `lead_data`, `qualification`, `workflow_routing`.
`WON_ONBOARDING` e `LOST` são recusados. `PRESENTATION_SCHEDULED`/`CLOSER_NEGOTIATION` do LLM são
apenas qualificação, não prova de reunião/fecho. A decisão de routing usa o score, não a acção
proposta pelo LLM. A resposta devolve `negocio_id`, indicador de replay e URL da agenda; não expõe
os dados pessoais do lead. Os recibos não são acessíveis a `anon`/`authenticated`.

## O que ainda não está implementado/activado

Este PR **não é a activação integral do manual**:

- Não liga os webhooks nativos Instagram/Telegram a este endpoint nem altera os seus funis existentes.
- Não chama um LLM para produzir a qualificação. Recebe a qualificação de um integrador autorizado;
  é preciso configurar o modelo, critérios, consentimento e revisão no fluxo que o chama.
- Não cria o ciclo Instagram de recolha de telefone com três tentativas, nem workflows n8n.
- Não instala WACRM/n8n/Docker/SSH nem assume que a imagem exemplificada no manual existe.
- Não envia DMs/WhatsApp nem contorna as regras existentes de consentimento e janela de contacto.
- Não adiciona Kanban ou Realtime público. O painel sales-machine mantém o polling existente de
  30 segundos; o pipeline do backoffice mantém o comportamento de actualização existente.
- Não cria o papel humano PRESENTER, que não existe no modelo actual, nem muda comissões.
- Não aplica migrações, não configura segredos e não publica produção.

Antes de ligar os canais: definir o consentimento/retensão dos dados, validar permissões reais da
Meta, rever critérios de score e destinatários humanos com o dono. IA de triagem comercial não
constitui avaliação de adequação de investimento nem consultoria financeira.

## Verificação local

```sh
npx tsx lib/crm/contrato.check.ts
npx tsx lib/crm/rota.check.ts
npx tsx lib/crm/banco.check.ts
npx eslint lib/crm app/api/leads/route.ts lib/agenda/servidor.ts
```

O teste SQL usa `@electric-sql/pglite` (apenas desenvolvimento), não credenciais/rede.
Em rollback: desligar primeiro o fluxo externo e reverter o código; deixar as colunas e recibos
aditivos para conservar o histórico. A agenda anterior volta com a reversão de código.

Nesta entrega, os três testes CRM, lint focado, typecheck focado (rota e módulos CRM) e as
regressões `pipeline-fluxo.check.ts`/`agenda/horas.check.ts` foram verificados localmente.
O typecheck integral excedeu a memória disponível (heap de 2 GiB; retry de 4 GiB terminado pelo
ambiente). O build integral e o fluxo real de produção não foram verificados.
