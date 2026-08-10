do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'drivers', 'entries', 'entry_photos', 'trucks', 'mileage_entries',
        'diesel_entries', 'diesel_photos', 'service_items', 'service_photos',
        'daily_checks', 'daily_check_photos'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

alter table public.drivers enable row level security;
alter table public.entries enable row level security;
alter table public.entry_photos enable row level security;
alter table public.trucks enable row level security;
alter table public.mileage_entries enable row level security;
alter table public.diesel_entries enable row level security;
alter table public.diesel_photos enable row level security;
alter table public.service_items enable row level security;
alter table public.service_photos enable row level security;
alter table public.daily_checks enable row level security;
alter table public.daily_check_photos enable row level security;

create policy drivers_select on public.drivers for select to authenticated
using (private.is_boss() or id = private.current_driver_id());
create policy drivers_boss_insert on public.drivers for insert to authenticated
with check (private.is_boss());
create policy drivers_boss_update on public.drivers for update to authenticated
using (private.is_boss()) with check (private.is_boss());
create policy drivers_boss_delete on public.drivers for delete to authenticated
using (private.is_boss());

create policy entries_select on public.entries for select to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());
create policy entries_insert on public.entries for insert to authenticated
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy entries_update on public.entries for update to authenticated
using (private.is_boss() or driver_id = private.current_driver_id())
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy entries_delete on public.entries for delete to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());

create policy entry_photos_select on public.entry_photos for select to authenticated
using (
  private.is_boss() or exists (
    select 1 from public.entries e
    where e.id = entry_photos.entry_id
      and e.driver_id = private.current_driver_id()
  )
);
create policy entry_photos_insert on public.entry_photos for insert to authenticated
with check (
  private.is_boss() or exists (
    select 1 from public.entries e
    where e.id = entry_photos.entry_id
      and e.driver_id = private.current_driver_id()
  )
);
create policy entry_photos_update on public.entry_photos for update to authenticated
using (
  private.is_boss() or exists (
    select 1 from public.entries e
    where e.id = entry_photos.entry_id
      and e.driver_id = private.current_driver_id()
  )
)
with check (
  private.is_boss() or exists (
    select 1 from public.entries e
    where e.id = entry_photos.entry_id
      and e.driver_id = private.current_driver_id()
  )
);
create policy entry_photos_delete on public.entry_photos for delete to authenticated
using (
  private.is_boss() or exists (
    select 1 from public.entries e
    where e.id = entry_photos.entry_id
      and e.driver_id = private.current_driver_id()
  )
);

create policy trucks_select on public.trucks for select to authenticated using (true);
create policy trucks_boss_insert on public.trucks for insert to authenticated
with check (private.is_boss());
create policy trucks_boss_update on public.trucks for update to authenticated
using (private.is_boss()) with check (private.is_boss());
create policy trucks_boss_delete on public.trucks for delete to authenticated
using (private.is_boss());

create policy mileage_select on public.mileage_entries for select to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());
create policy mileage_insert on public.mileage_entries for insert to authenticated
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy mileage_update on public.mileage_entries for update to authenticated
using (private.is_boss() or driver_id = private.current_driver_id())
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy mileage_delete on public.mileage_entries for delete to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());

create policy diesel_entries_select on public.diesel_entries for select to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());
create policy diesel_entries_insert on public.diesel_entries for insert to authenticated
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy diesel_entries_update on public.diesel_entries for update to authenticated
using (private.is_boss() or driver_id = private.current_driver_id())
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy diesel_entries_delete on public.diesel_entries for delete to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());

create policy diesel_photos_select on public.diesel_photos for select to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());
create policy diesel_photos_insert on public.diesel_photos for insert to authenticated
with check (
  (private.is_boss() or driver_id = private.current_driver_id())
  and exists (
    select 1 from public.diesel_entries de
    where de.id = diesel_photos.diesel_entry_id
      and (private.is_boss() or de.driver_id = private.current_driver_id())
  )
);
create policy diesel_photos_update on public.diesel_photos for update to authenticated
using (private.is_boss() or driver_id = private.current_driver_id())
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy diesel_photos_delete on public.diesel_photos for delete to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());

create policy service_items_boss_all on public.service_items for all to authenticated
using (private.is_boss()) with check (private.is_boss());
create policy service_photos_boss_all on public.service_photos for all to authenticated
using (private.is_boss()) with check (private.is_boss());

create policy daily_checks_select on public.daily_checks for select to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());
create policy daily_checks_insert on public.daily_checks for insert to authenticated
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy daily_checks_update on public.daily_checks for update to authenticated
using (private.is_boss() or driver_id = private.current_driver_id())
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy daily_checks_delete on public.daily_checks for delete to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());

create policy daily_check_photos_select on public.daily_check_photos for select to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());
create policy daily_check_photos_insert on public.daily_check_photos for insert to authenticated
with check (
  (private.is_boss() or driver_id = private.current_driver_id())
  and exists (
    select 1 from public.daily_checks dc
    where dc.id = daily_check_photos.daily_check_id
      and (private.is_boss() or dc.driver_id = private.current_driver_id())
  )
);
create policy daily_check_photos_update on public.daily_check_photos for update to authenticated
using (private.is_boss() or driver_id = private.current_driver_id())
with check (private.is_boss() or driver_id = private.current_driver_id());
create policy daily_check_photos_delete on public.daily_check_photos for delete to authenticated
using (private.is_boss() or driver_id = private.current_driver_id());

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.drivers,
  public.entries,
  public.entry_photos,
  public.trucks,
  public.mileage_entries,
  public.diesel_entries,
  public.diesel_photos,
  public.service_items,
  public.service_photos,
  public.daily_checks,
  public.daily_check_photos
to authenticated;

do $$
declare
  sequence_name text;
begin
  foreach sequence_name in array array[
    'drivers_id_seq', 'entries_id_seq', 'trucks_id_seq',
    'mileage_entries_id_seq', 'diesel_entries_id_seq',
    'diesel_photos_id_seq', 'service_items_id_seq',
    'service_photos_id_seq', 'daily_checks_id_seq',
    'daily_check_photos_id_seq'
  ]
  loop
    if to_regclass('public.' || sequence_name) is not null then
      execute format(
        'grant usage, select on sequence public.%I to authenticated',
        sequence_name
      );
    end if;
  end loop;
end;
$$;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Allow entry photo deletes', 'Allow entry photo reads',
        'Allow entry photo uploads', 'entry_photos_select',
        'entry_photos_insert', 'entry_photos_update', 'entry_photos_delete'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$$;

create policy entry_photos_select on storage.objects for select to authenticated
using (
  bucket_id = 'entry-photos'
  and (
    private.is_boss()
    or (storage.foldername(name))[1] = private.current_driver_id()::text
    or ((storage.foldername(name))[1] = 'diesel'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
    or ((storage.foldername(name))[1] = 'daily-check'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
  )
);
create policy entry_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'entry-photos'
  and (
    private.is_boss()
    or (storage.foldername(name))[1] = private.current_driver_id()::text
    or ((storage.foldername(name))[1] = 'diesel'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
    or ((storage.foldername(name))[1] = 'daily-check'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
  )
);
create policy entry_photos_update on storage.objects for update to authenticated
using (
  bucket_id = 'entry-photos'
  and (
    private.is_boss()
    or (storage.foldername(name))[1] = private.current_driver_id()::text
    or ((storage.foldername(name))[1] = 'diesel'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
    or ((storage.foldername(name))[1] = 'daily-check'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
  )
)
with check (
  bucket_id = 'entry-photos'
  and (
    private.is_boss()
    or (storage.foldername(name))[1] = private.current_driver_id()::text
    or ((storage.foldername(name))[1] = 'diesel'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
    or ((storage.foldername(name))[1] = 'daily-check'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
  )
);
create policy entry_photos_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'entry-photos'
  and (
    private.is_boss()
    or (storage.foldername(name))[1] = private.current_driver_id()::text
    or ((storage.foldername(name))[1] = 'diesel'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
    or ((storage.foldername(name))[1] = 'daily-check'
        and (storage.foldername(name))[2] = private.current_driver_id()::text)
  )
);
