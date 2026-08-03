-- ============================================================
-- MIGRATION: catalogo_produtos.destaque
-- Execute no Supabase SQL Editor, depois de 001_catalogo_produtos.sql.
-- Flag usada pela seção "Produtos em Destaque" da home do portfólio.
-- ============================================================

alter table public.catalogo_produtos
  add column if not exists destaque boolean not null default false;
