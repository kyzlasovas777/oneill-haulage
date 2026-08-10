create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_accounts (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('boss', 'driver')),
  driver_id bigint unique references public.drivers(id) on delete cascade,
  pin_hash text not null,
  auth_email text not null unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role = 'boss' and driver_id is null) or (role = 'driver' and driver_id is not null))
);

create unique index if not exists app_accounts_single_boss_idx
  on private.app_accounts (role)
  where role = 'boss';

create table if not exists private.login_attempts (
  fingerprint text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

revoke all on private.app_accounts from public, anon, authenticated;
revoke all on private.login_attempts from public, anon, authenticated;

insert into private.app_accounts (role, driver_id, pin_hash, auth_email, active)
select
  'driver',
  d.id,
  extensions.crypt(d.pin, extensions.gen_salt('bf', 12)),
  'driver-' || gen_random_uuid()::text || '@oneill.invalid',
  d.active is not false
from public.drivers d
where d.pin ~ '^\d{4}$'
on conflict (driver_id) do nothing;

update public.drivers set pin = null where pin is not null;

create or replace function private.current_driver_id()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select a.driver_id
  from private.app_accounts a
  join public.drivers d on d.id = a.driver_id
  where a.auth_user_id = (select auth.uid())
    and a.role = 'driver'
    and a.active
    and d.active is not false
  limit 1;
$$;

create or replace function private.is_boss()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from private.app_accounts a
    where a.auth_user_id = (select auth.uid())
      and a.role = 'boss'
      and a.active
  );
$$;

create or replace function public.current_app_identity()
returns table (
  role text,
  driver_id bigint,
  driver_name text,
  truck_reg text,
  active boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    a.role,
    a.driver_id,
    d.name,
    d.truck_reg,
    case
      when a.role = 'boss' then a.active
      else a.active and d.active is not false
    end
  from private.app_accounts a
  left join public.drivers d on d.id = a.driver_id
  where a.auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.pin_login_lookup(
  p_pin text,
  p_fingerprint text
)
returns table (
  account_id uuid,
  auth_email text,
  auth_user_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_attempt private.login_attempts%rowtype;
  v_account private.app_accounts%rowtype;
  v_attempts integer;
begin
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return;
  end if;

  p_fingerprint := left(coalesce(nullif(p_fingerprint, ''), 'unknown'), 128);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fingerprint, 0));

  select *
  into v_attempt
  from private.login_attempts
  where fingerprint = p_fingerprint
  for update;

  if found and v_attempt.blocked_until is not null
     and v_attempt.blocked_until > clock_timestamp() then
    return;
  end if;

  if found and v_attempt.window_started_at < clock_timestamp() - interval '15 minutes' then
    delete from private.login_attempts where fingerprint = p_fingerprint;
    v_attempt := null;
  end if;

  select a.*
  into v_account
  from private.app_accounts a
  left join public.drivers d on d.id = a.driver_id
  where a.active
    and (a.role = 'boss' or d.active is not false)
    and extensions.crypt(p_pin, a.pin_hash) = a.pin_hash
  order by case when a.role = 'boss' then 0 else 1 end
  limit 1;

  if not found then
    v_attempts := coalesce(v_attempt.attempts, 0) + 1;

    insert into private.login_attempts (
      fingerprint, attempts, window_started_at, blocked_until, updated_at
    ) values (
      p_fingerprint,
      v_attempts,
      coalesce(v_attempt.window_started_at, clock_timestamp()),
      case when v_attempts >= 5 then clock_timestamp() + interval '15 minutes' end,
      clock_timestamp()
    )
    on conflict (fingerprint) do update
    set attempts = excluded.attempts,
        window_started_at = excluded.window_started_at,
        blocked_until = excluded.blocked_until,
        updated_at = excluded.updated_at;

    return;
  end if;

  delete from private.login_attempts where fingerprint = p_fingerprint;

  return query
  select v_account.id, v_account.auth_email, v_account.auth_user_id;
end;
$$;

create or replace function public.pin_login_link_auth(
  p_account_id uuid,
  p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  update private.app_accounts
  set auth_user_id = p_auth_user_id,
      updated_at = clock_timestamp()
  where id = p_account_id
    and (auth_user_id is null or auth_user_id = p_auth_user_id);

  return found;
end;
$$;

create or replace function public.boss_save_driver(
  p_driver_id bigint,
  p_name text,
  p_pin text,
  p_truck_reg text,
  p_active boolean
)
returns table (id bigint, name text, active boolean, truck_reg text)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_driver public.drivers%rowtype;
begin
  if not private.is_boss() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  p_name := btrim(coalesce(p_name, ''));
  p_truck_reg := upper(btrim(coalesce(p_truck_reg, '')));

  if p_name = '' then
    raise exception 'Driver name is required' using errcode = '22023';
  end if;
  if p_driver_id is null and (p_pin is null or p_pin !~ '^\d{4}$') then
    raise exception 'New driver PIN must contain 4 numbers' using errcode = '22023';
  end if;
  if p_pin is not null and p_pin <> '' and p_pin !~ '^\d{4}$' then
    raise exception 'PIN must contain 4 numbers' using errcode = '22023';
  end if;
  if p_pin is not null and p_pin <> '' and exists (
    select 1
    from private.app_accounts a
    where extensions.crypt(p_pin, a.pin_hash) = a.pin_hash
      and (p_driver_id is null or a.driver_id is distinct from p_driver_id)
  ) then
    raise exception 'This PIN already exists' using errcode = '23505';
  end if;

  if p_driver_id is null then
    insert into public.drivers (name, pin, truck_reg, active)
    values (p_name, null, p_truck_reg, coalesce(p_active, true))
    returning * into v_driver;

    insert into private.app_accounts (role, driver_id, pin_hash, auth_email)
    values (
      'driver',
      v_driver.id,
      extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
      'driver-' || gen_random_uuid()::text || '@oneill.invalid'
    );
  else
    update public.drivers d
    set name = p_name,
        truck_reg = p_truck_reg,
        active = coalesce(p_active, d.active)
    where d.id = p_driver_id
    returning d.* into v_driver;

    if not found then
      raise exception 'Driver not found' using errcode = 'P0002';
    end if;

    update private.app_accounts
    set active = coalesce(p_active, active),
        updated_at = clock_timestamp()
    where driver_id = p_driver_id;

    if p_pin is not null and p_pin <> '' then
      update private.app_accounts
      set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
          updated_at = clock_timestamp()
      where driver_id = p_driver_id;
    end if;
  end if;

  return query select v_driver.id, v_driver.name, v_driver.active, v_driver.truck_reg;
end;
$$;

revoke all on function private.current_driver_id() from public, anon, authenticated;
revoke all on function private.is_boss() from public, anon, authenticated;
revoke all on function public.current_app_identity() from public, anon, authenticated;
revoke all on function public.pin_login_lookup(text, text) from public, anon, authenticated;
revoke all on function public.pin_login_link_auth(uuid, uuid) from public, anon, authenticated;
revoke all on function public.boss_save_driver(bigint, text, text, text, boolean) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_driver_id() to authenticated;
grant execute on function private.is_boss() to authenticated;
grant execute on function public.current_app_identity() to authenticated;
grant execute on function public.boss_save_driver(bigint, text, text, text, boolean) to authenticated;
grant execute on function public.pin_login_lookup(text, text) to service_role;
grant execute on function public.pin_login_link_auth(uuid, uuid) to service_role;
