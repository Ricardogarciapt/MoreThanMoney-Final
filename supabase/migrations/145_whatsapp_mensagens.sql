-- NOTA DE NUMERAÇÃO: escrita a 27/09 a seguir a `144_ig_setter_rascunhos.sql`. O Supabase registra
-- as migrações pela DATA e não pelo número, por isso uma colisão de número com outro ramo não trava
-- produção — mas deixa a ordem de uma base NOVA à mercê da ordem alfabética. Se este ficheiro
-- chegar ao ramo principal com um `145_` já ocupado, renumerar aqui e não em produção.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- WHATSAPP — o livro das mensagens, e a razão de ser uma tabela e não um `console.log`.
--
-- O QUE ESTAVA MAL A 27/09
-- O webhook (`app/api/whatsapp/webhook/route.ts`) recebia mensagens, respondia, e não guardava nada.
-- Isso deixava três buracos, e o terceiro é o que obriga a esta tabela:
--
--   1. AUDITORIA. Não havia como responder a «o que é que o sistema escreveu a esta pessoa?». Num
--      canal em que a pessoa se pode queixar à Meta, não ter o que se disse é não ter defesa.
--   2. O ENVIO QUE NÃO SAIU. O envio antigo terminava em `.catch(() => {})`. Uma mensagem que falha
--      em silêncio é indistinguível de uma mensagem entregue — e a conversa morre de um lado só.
--   3. A JANELA DE 24 HORAS. Este é o buraco estrutural. A Meta só aceita texto livre nas 24 horas
--      seguintes a uma mensagem DA PESSOA. Para saber em que caso se está é preciso saber quando é
--      que ela escreveu pela última vez — e isso não existia em sítio nenhum. Sem esta tabela, o
--      código não tem como decidir entre texto livre e template, e adivinhar significa tentar texto
--      fora da janela, levar erro da Meta, e acumular tentativas falhadas num número que a Meta
--      pode marcar como spam. Perder o número é perder o canal.
--
-- PORQUE É QUE ENTRADAS E SAÍDAS ESTÃO NA MESMA TABELA
-- Porque a pergunta que mais se faz atravessa as duas: «o que é que se passou nesta conversa?». E
-- porque a janela mede-se pela última ENTRADA — ter as duas direcções no mesmo sítio torna essa
-- consulta uma linha, em vez de um `join` que alguém vai escrever ao contrário.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),

  -- SEMPRE E.164 (`+351912345678`). Normalizado por `lib/whatsapp-envio.ts` antes de chegar aqui.
  -- Guardar `912345678` numa linha e `+351912345678` noutra é transformar uma pessoa em duas: recebe
  -- a mesma mensagem duas vezes, e o consentimento que deu numa forma não é encontrado pela outra.
  numero text not null,

  -- 'entrada' = ela escreveu-nos (é isto que abre a janela). 'saida' = nós escrevemos.
  direcao text not null check (direcao in ('entrada', 'saida')),

  tipo text not null check (tipo in ('texto', 'template')),
  -- Nome do template aprovado na Meta, quando `tipo = 'template'`.
  template text,
  -- O que foi dito. Numa saída de template, o texto já com os parâmetros ou a lista deles: a prova
  -- do que a pessoa leu não pode depender de ir buscar a versão actual do template à Meta.
  corpo text,

  -- O DESFECHO, E É AQUI QUE ESTA TABELA GANHA O SEU LUGAR.
  --   'recebida'  entrada.
  --   'enviada'   a Meta aceitou.
  --   'recusada'  NÓS recusámos antes de tentar (fora da janela, sem consentimento, número inválido).
  --               Esta é a linha mais valiosa do livro: é a que explica um silêncio.
  --   'falhou'    tentou-se e a Meta disse não. O erro fica em `motivo`.
  estado text not null check (estado in ('recebida', 'enviada', 'recusada', 'falhou')),
  -- Código da recusa, igual ao `CodigoRecusa` de `lib/whatsapp-envio.ts`. Em texto e não num enum
  -- da base: um código novo no código não deve exigir uma migração para poder ser registado.
  codigo text,
  -- A razão em português. É o que se lê ao lado do nome quando se pergunta porque é que não saiu.
  motivo text,

  -- Id da mensagem do lado da Meta (`wamid...`), para cruzar com o painel deles.
  wa_message_id text,
  criado_em timestamptz not null default now()
);

-- A consulta da janela: última ENTRADA de um número. É feita a cada envio, por isso é este índice e
-- não um genérico por `numero`.
create index if not exists idx_whatsapp_mensagens_janela
  on whatsapp_mensagens (numero, criado_em desc)
  where direcao = 'entrada';

create index if not exists idx_whatsapp_mensagens_numero on whatsapp_mensagens (numero, criado_em desc);
create index if not exists idx_whatsapp_mensagens_recusas
  on whatsapp_mensagens (criado_em desc)
  where estado in ('recusada', 'falhou');

comment on table whatsapp_mensagens is
  'Livro das mensagens de WhatsApp (entradas e saídas). A última entrada de um número é o que define a janela de 24h da Meta; as linhas "recusada" são as que explicam um silêncio.';
comment on column whatsapp_mensagens.estado is
  'recebida|enviada|recusada|falhou. "recusada" = travado por nós antes de tentar; "falhou" = a Meta disse não.';

-- Ninguém além do service role. A tabela junta número de telefone e o conteúdo de conversas
-- privadas — é exactamente o tipo de dado que a chave anon já expôs uma vez nesta base, pelas
-- funções SECURITY DEFINER abertas ao público. Não se repete.
alter table whatsapp_mensagens enable row level security;
revoke all on whatsapp_mensagens from anon, authenticated;

-- ── A janela, resolvida ──────────────────────────────────────────────────────────────────────────

-- Existe como vista para que a regra das 24 horas tenha UMA definição. Cada sítio que a recalculasse
-- à mão era um sítio onde alguém ia escrever 24 horas a contar da mensagem errada — a nossa, em vez
-- da dela — e passar a ter licença eterna para escrever a quem quisesse.
create or replace view whatsapp_janela with (security_invoker = true) as
select
  m.numero,
  max(m.criado_em) as ultima_entrada,
  max(m.criado_em) + interval '24 hours' as fecha_em,
  (max(m.criado_em) + interval '24 hours') > now() as aberta
from whatsapp_mensagens m
where m.direcao = 'entrada'
group by m.numero;

comment on view whatsapp_janela is
  'Janela de atendimento por número. Aberta = pode texto livre; fechada = só template aprovado. Ausência de linha = nunca escreveu, logo fechada.';

revoke all on whatsapp_janela from anon, authenticated;
