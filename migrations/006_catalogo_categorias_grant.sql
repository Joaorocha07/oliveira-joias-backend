-- ============================================================
-- MIGRATION: fix — grant de acesso em catalogo_categorias
-- Mesmo padrão de 003_catalogo_produtos_grant.sql.
-- O service_role precisa de GRANT explícito em tabelas novas —
-- o BYPASSRLS ignora as policies de RLS, mas não substitui o GRANT
-- de nível de tabela que o PostgreSQL valida antes de avaliar as policies.
-- ============================================================

grant all on public.catalogo_categorias to service_role;
