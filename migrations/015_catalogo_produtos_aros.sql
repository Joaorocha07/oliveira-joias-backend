-- ============================================================
-- MIGRATION 015: aros (numeração) por produto do catálogo
-- Execute no Supabase SQL Editor (projeto do sistema).
--
-- aros     → lista de numerações oferecidas no site, com o estoque de cada
--            uma: [{"aro": 16, "estoque": 2}, {"aro": 17, "estoque": 0}, ...]
--            Lista vazia = produto sem seleção de aro (comportamento antigo).
--            Estoque 0 = o aro aparece riscado/indisponível no site.
-- aros_par → true: o cliente escolhe 2 aros (par de alianças);
--            false: escolhe 1 aro (anel avulso).
-- A edição é feita pelo backend (service_role) na rota
-- PATCH /api/produtos/:id/aros, que exige usuário logado no sistema.
-- ============================================================

alter table public.catalogo_produtos
  add column if not exists aros jsonb not null default '[]'::jsonb,
  add column if not exists aros_par boolean not null default true;

alter table public.catalogo_produtos
  drop constraint if exists catalogo_produtos_aros_array;
alter table public.catalogo_produtos
  add constraint catalogo_produtos_aros_array check (jsonb_typeof(aros) = 'array');
