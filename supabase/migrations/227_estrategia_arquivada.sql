-- 03/11/2026 (pedido do Ricardo): «arquivar» uma estratégia do MTM Auto = sai dos catálogos das
-- apps (MTM System e MTM Auto) para não confundir os clientes, mas o HISTÓRICO fica. Diferente de
-- `apagado_em` (084), que tira o provider ao motor e pára a mestre.
--
-- Quem ainda segue a estratégia continua a vê-la, para a gerir ou deixar. Ninguém começa a segui-la.
-- O primeiro caso: o MTM Auto Premium (mestre 77296149), que deu lugar ao MTM Auto Premium II.
alter table mtmauto_providers add column if not exists arquivada_em timestamptz;

comment on column mtmauto_providers.arquivada_em is
  'Arquivada: fora dos catálogos (quem segue continua a ver), histórico intacto, mestre continua. Ver lib/acesso-estrategias.';

update mtmauto_providers set arquivada_em = now() where slug = 'premium-ouro' and arquivada_em is null;
