-- ============================================================
-- MIGRATION: fix — grant de leitura em catalogo_produtos
-- Necessária se você já rodou 001_catalogo_produtos.sql antes desta
-- correção. RLS policy sozinha não libera acesso: sem o GRANT, o
-- Postgres nega "permission denied for table catalogo_produtos" antes
-- de a policy ser avaliada.
-- ============================================================

grant select on public.catalogo_produtos to anon, authenticated;
