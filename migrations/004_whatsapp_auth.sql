-- Sessão do WhatsApp (Baileys) persistida no banco, uma linha por chave de
-- autenticação de cada slot (0 e 1). Antes a sessão ficava em arquivos locais,
-- que somem a cada deploy/restart do servidor e derrubavam a conexão.
-- Acesso só pelo backend (service_role): RLS habilitada sem policies.

create table if not exists public.whatsapp_auth (
  slot smallint not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (slot, key)
);

alter table public.whatsapp_auth enable row level security;

-- Este projeto não concede privilégios automaticamente em tabelas novas
-- (ver 003_catalogo_produtos_grant.sql): sem isso o backend recebe
-- "permission denied for table whatsapp_auth".
grant select, insert, update, delete on public.whatsapp_auth to service_role;
