-- 205 — Posições fora das estatísticas de desempenho (23/10/2026).
--
-- Pedido do dono: as trades manuais que ele abriu na 77720210 a 22–23/10 para testar o esforço do
-- sistema não são desempenho de nenhuma estratégia. NÃO se apagam e o saldo NÃO se repõe — é uma
-- conta real de auditoria, o saldo tem de bater com o broker. Ficam no histórico (admin e
-- WebTrader), com a marca, e saem só das contas de desempenho (win rate, profit factor, etc.).
--
-- `fora_estatisticas` guarda o motivo ('teste_interno'); nulo = conta para as estatísticas.
-- Quem marcou e quando fica na própria linha e em mtm_funded_admin_audit.

alter table public.funded_positions
  add column if not exists fora_estatisticas text
    check (fora_estatisticas is null or fora_estatisticas in ('teste_interno')),
  add column if not exists fora_estatisticas_nota text
    check (fora_estatisticas_nota is null or char_length(fora_estatisticas_nota) <= 400),
  add column if not exists fora_estatisticas_em timestamptz;
