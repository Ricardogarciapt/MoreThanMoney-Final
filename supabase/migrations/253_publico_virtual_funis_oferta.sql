-- 253 · Teste de público virtual (MiroFish) dos três funis por oferta (pedido do dono, 16/11/2026).
--
-- «Criarem um público de 1.200 pessoas, testar qual é a oferta que pega mais e os funis.» Um teste por
-- funil, com a copy que o lead lê na DM e no seguimento. O executor do Mac (aios/publico_virtual) corre
-- até 3 por dia; o relatório volta para esta tabela e diz sempre que é uma simulação.
--
-- Só insere se ainda não houver um pedido igual por correr (a migração pode ser reaplicada).

insert into public.publico_virtual_testes (alvo, texto, pergunta, rondas, pedido_por)
select v.alvo, v.texto, v.pergunta, 20, 'dono'
from (values
  ('conteudo:texto',
   E'FUNIL ROTA CORRETORA (MoreThanMoney).\nDM depois de um comentário: «Antes de mais nada: já negoceias, ou estás a começar?»\nQualificação: o que procuras (aprender, sinais, automático) e se tens capital próprio que podes arriscar.\nFecho: «Em vez de pagares mensalidade, abres a tua conta na PU Prime (corretora regulada) pelo nosso link e depositas a partir de 350 $. O dinheiro é teu e fica na tua conta, em teu nome. Com a conta validada, o Premium MTM e os grupos de sinais ficam incluídos enquanto a conta estiver financiada. Trading tem risco de perda: deposita só o que podes arriscar.»\nSeguimento: no dia, +24 h, +48 h, +72 h; depois email só com consentimento.\nConteúdo educativo, não constitui consultoria financeira.',
   'Público de cerca de 1.200 pessoas (25–45 anos, Portugal e Brasil, céticos, iniciantes, quem já perdeu dinheiro). Quantos abririam a conta e depositariam? Quais as objeções principais (confiança na corretora, 350 $, medo de pirâmide)? Que frase lhes soa a promessa de lucro? Compara com a oferta de pagar 35 €/mês sem depositar.'),
  ('conteudo:texto',
   E'FUNIL EDUCAÇÃO (MoreThanMoney): Membro 35 €/mês (comunidade, formação, sessões ao vivo) ou Premium 65 €/mês (scanners, alertas, Tap to Trade, salas Premium), com 3 dias de Premium para experimentar.\nDM: «O que te trouxe aqui: aprender do zero, ou já negoceias e queres ferramentas?» → «Para começar, o Membro: 35 €/mês, cancelas quando quiseres. Se queres o acesso completo, o Premium: 65 €/mês.»\nSeguimento: no dia, +24 h, +48 h, +72 h; depois email só com consentimento.\nConteúdo educativo, não constitui consultoria financeira.',
   'Público de cerca de 1.200 pessoas (25–45 anos, Portugal e Brasil). Quem pagaria 35 €/mês, quem iria para 65 €/mês, e quem só usaria os 3 dias e saía? O que trava a compra? Pedir os dados de pagamento logo no início dos 3 dias muda a decisão?'),
  ('conteudo:texto',
   E'FUNIL MTM FUNDED (MoreThanMoney), para quem diz que não tem capital.\nDM: «Sem problema. O MTM Funded é para ti: treinas e provas o teu método em conta SIMULADA, em desafios e torneios, sem arriscar dinheiro teu. Quem se destaca recebe um Patrocínio de Desempenho para abrir conta própria numa corretora regulada. Não é uma prop firm e a MTM não gere dinheiro de clientes.»\nSeguimento: no dia, +24 h, +48 h, +72 h.\nConteúdo educativo, não constitui consultoria financeira.',
   'Público de cerca de 1.200 pessoas sem capital para investir. Quantos se inscreveriam? Percebem que é conta simulada, ou leem como «vão dar-me capital»? Quantos, depois, passariam para a Rota Corretora ou para o Membro?')
) as v(alvo, texto, pergunta)
where not exists (
  select 1 from public.publico_virtual_testes t
  where t.texto = v.texto and t.estado in ('pendente', 'fila')
);
