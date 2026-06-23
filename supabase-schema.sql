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
  estrellas numeric(2,1) not null default 5 check (estrellas between 0 and 5),
  trabajos integer not null default 0 check (trabajos >= 0),
  activo boolean not null default false,
  destacado boolean not null default false,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

alter table public.profesionales
  add column if not exists destacado boolean not null default false;

alter table public.profesionales
  alter column estrellas type numeric(2,1) using estrellas::numeric;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text,
  ciudad text not null,
  servicio_interes text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contactos (
  id uuid primary key default gen_random_uuid(),
  nombre_cliente text not null,
  telefono_cliente text not null,
  descripcion text not null,
  profesional_id uuid references public.profesionales(id) on delete set null,
  profesional_nombre text not null,
  fecha timestamptz not null default now(),
  resena_pendiente boolean not null default true,
  review_token uuid not null unique
);

create table if not exists public.resenas (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null unique references public.contactos(id) on delete cascade,
  profesional_id uuid not null references public.profesionales(id) on delete cascade,
  cliente_nombre text not null,
  estrellas integer not null check (estrellas between 1 and 5),
  comentario text,
  creado_at timestamptz not null default now()
);

alter table public.profesionales enable row level security;
alter table public.clientes enable row level security;
alter table public.contactos enable row level security;
alter table public.resenas enable row level security;

drop policy if exists "Public can insert pending professionals" on public.profesionales;
create policy "Public can insert pending professionals"
on public.profesionales for insert to anon, authenticated
with check (activo = false and destacado = false);

drop policy if exists "Public can read active professionals" on public.profesionales;
create policy "Public can read active professionals"
on public.profesionales for select to anon, authenticated
using (activo = true);

drop policy if exists "Public can insert clients" on public.clientes;
create policy "Public can insert clients"
on public.clientes for insert to anon, authenticated
with check (true);

drop policy if exists "Public can insert contacts" on public.contactos;
create policy "Public can insert contacts"
on public.contactos for insert to anon, authenticated
with check (resena_pendiente = true);

-- No se permite SELECT público de contactos porque contiene teléfonos privados.
drop policy if exists "Public can read contacts" on public.contactos;

drop policy if exists "Public can read reviews" on public.resenas;
create policy "Public can read reviews"
on public.resenas for select to anon, authenticated
using (true);

grant usage on schema public to anon, authenticated;
grant insert on public.clientes to anon, authenticated;
grant insert, select on public.profesionales to anon, authenticated;
grant insert on public.contactos to anon, authenticated;
grant select on public.resenas to anon, authenticated;

create or replace function public.obtener_resena_pendiente(p_token uuid)
returns table (
  contacto_id uuid,
  profesional_id uuid,
  profesional_nombre text,
  cliente_nombre text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.profesional_id, c.profesional_nombre, c.nombre_cliente
  from public.contactos c
  where c.review_token = p_token
    and c.resena_pendiente = true
  limit 1;
$$;

create or replace function public.enviar_resena(
  p_token uuid,
  p_estrellas integer,
  p_comentario text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contacto public.contactos%rowtype;
begin
  if p_estrellas < 1 or p_estrellas > 5 then
    raise exception 'La puntuación debe estar entre 1 y 5';
  end if;

  select * into v_contacto
  from public.contactos
  where review_token = p_token
    and resena_pendiente = true
  for update;

  if not found or v_contacto.profesional_id is null then
    raise exception 'La solicitud de reseña no existe o ya fue completada';
  end if;

  insert into public.resenas (
    contacto_id,
    profesional_id,
    cliente_nombre,
    estrellas,
    comentario
  ) values (
    v_contacto.id,
    v_contacto.profesional_id,
    v_contacto.nombre_cliente,
    p_estrellas,
    nullif(trim(p_comentario), '')
  );

  update public.contactos
  set resena_pendiente = false
  where id = v_contacto.id;

  update public.profesionales p
  set estrellas = stats.promedio,
      trabajos = stats.total
  from (
    select profesional_id,
           round(avg(estrellas)::numeric, 1) as promedio,
           count(*)::integer as total
    from public.resenas
    where profesional_id = v_contacto.profesional_id
    group by profesional_id
  ) stats
  where p.id = stats.profesional_id;
end;
$$;

revoke all on function public.obtener_resena_pendiente(uuid) from public;
revoke all on function public.enviar_resena(uuid, integer, text) from public;
grant execute on function public.obtener_resena_pendiente(uuid) to anon, authenticated;
grant execute on function public.enviar_resena(uuid, integer, text) to anon, authenticated;

alter table public.profesionales replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profesionales'
  ) then
    alter publication supabase_realtime add table public.profesionales;
  end if;
end $$;

create index if not exists profesionales_activo_destacado_idx
  on public.profesionales (activo, destacado desc);

create index if not exists profesionales_especialidad_zona_idx
  on public.profesionales (especialidad, zona);

create index if not exists contactos_review_token_idx
  on public.contactos (review_token)
  where resena_pendiente = true;

create index if not exists resenas_profesional_idx
  on public.resenas (profesional_id, creado_at desc);
