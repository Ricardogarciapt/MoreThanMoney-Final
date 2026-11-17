-- 263 · Prospeção B2B em francês, alemão e italiano (17/11/2026, Ricardo)
-- A coluna `pais` guarda a LÍNGUA do email: PT (Portugal e PALOP), BR, INT (inglês), FR, DE, IT.
-- DE e IT (e domínios .de/.at/.it/.es/.nl) ficam parados no envio: email frio a empresas exige consentimento lá.
alter table public.b2b_prospectos drop constraint if exists b2b_prospectos_pais_check;
alter table public.b2b_prospectos add constraint b2b_prospectos_pais_check check (pais in ('PT','BR','INT','FR','DE','IT'));
alter table public.b2b_candidatos drop constraint if exists b2b_candidatos_pais_check;
alter table public.b2b_candidatos add constraint b2b_candidatos_pais_check check (pais in ('PT','BR','INT','FR','DE','IT'));
