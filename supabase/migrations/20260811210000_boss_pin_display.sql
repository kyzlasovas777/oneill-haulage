alter table private.app_accounts
  add column if not exists pin_display text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'private.app_accounts'::regclass
      and conname = 'app_accounts_pin_display_format'
  ) then
    alter table private.app_accounts
      add constraint app_accounts_pin_display_format
      check (pin_display is null or pin_display ~ '^\d{4}$');
  end if;
end;
$$;

drop function if exists public.boss_save_driver(bigint, text, text, text, boolean);

create or replace function public.boss_save_driver(
  p_driver_id bigint,
  p_name text,
  p_pin text,
  p_truck_reg text,
  p_active boolean
)
returns table (id bigint, name text, active boolean, truck_reg text, pin text)
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

    insert into private.app_accounts (role, driver_id, pin_hash, pin_display, auth_email)
    values (
      'driver',
      v_driver.id,
      extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
      p_pin,
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

    update private.app_accounts a
    set active = coalesce(p_active, a.active),
        updated_at = clock_timestamp()
    where a.driver_id = p_driver_id;

    if p_pin is not null and p_pin <> '' then
      update private.app_accounts a
      set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
          pin_display = p_pin,
          updated_at = clock_timestamp()
      where a.driver_id = p_driver_id;
    end if;
  end if;

  return query
  select v_driver.id, v_driver.name, v_driver.active, v_driver.truck_reg,
         a.pin_display
  from private.app_accounts a
  where a.driver_id = v_driver.id;
end;
$$;

create or replace function public.boss_list_drivers()
returns table (id bigint, name text, active boolean, truck_reg text, pin text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.is_boss() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select d.id, d.name, d.active, d.truck_reg, a.pin_display
  from public.drivers d
  left join private.app_accounts a
    on a.driver_id = d.id and a.role = 'driver'
  order by d.active desc nulls last, d.name asc;
end;
$$;

revoke all on private.app_accounts from public, anon, authenticated;
revoke all on function public.boss_save_driver(bigint, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.boss_list_drivers()
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function public.boss_save_driver(bigint, text, text, text, boolean)
  to authenticated;
grant execute on function public.boss_list_drivers() to authenticated;
