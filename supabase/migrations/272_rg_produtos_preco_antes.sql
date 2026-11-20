-- Preço riscado e sufixo (ex.: «/mês») nos produtos da página do Ricardo.
alter table rg_produtos add column if not exists preco_antes_cents int;
alter table rg_produtos add column if not exists preco_sufixo text;
