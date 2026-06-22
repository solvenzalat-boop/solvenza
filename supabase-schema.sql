create extension if not exists pgcrypto;

create table if not exists public.profesionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  email text not null,
  tipo_cuenta text not null,
  especialidad text not null,
  zona text not null,
  descripcion text,
  estrellas integer not null default 5 check (estrellas between 0 and 5),
  trabajos integer not null default 0 check (trabajos >= 0),
  activo boolean not null default false,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text,
  ciudad text not null,
  servicio_interes text not null,
  created_at timestamptz not null default now()
);

alter table public.profesionales enable row level security;
alter table public.clientes enable row level security;

drop policy if exists "Public can insert pending professionals" on public.profesionales;
create policy "Public can insert pending professionals"
on public.profesionales
for insert
to anon, authenticated
with check (activo = false);

drop policy if exists "Public can read active professionals" on public.profesionales;
create policy "Public can read active professionals"
on public.profesionales
for select
to anon, authenticated
using (activo = true);

drop policy if exists "Public can insert clients" on public.clientes;
create policy "Public can insert clients"
on public.clientes
for insert
to anon, authenticated
with check (true);

grant usage on schema public to anon, authenticated;
grant insert on public.clientes to anon, authenticated;
grant insert, select on public.profesionales to anon, authenticated;

alter table public.profesionales replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profesionales'
  ) then
    alter publication supabase_realtime add table public.profesionales;
  end if;
end $$;

create index if not exists profesionales_activo_idx
  on public.profesionales (activo);

create index if not exists profesionales_especialidad_zona_idx
  on public.profesionales (especialidad, zona);

