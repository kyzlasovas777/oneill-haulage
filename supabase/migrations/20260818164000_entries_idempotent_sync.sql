-- Prevent the same offline entry save from creating duplicate server rows.
-- Legacy entries keep NULL client_sync_id values; new saves provide a UUID.

alter table public.entries
  add column if not exists client_sync_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.entries'::regclass
      and conname = 'entries_driver_client_sync_key'
  ) then
    alter table public.entries
      add constraint entries_driver_client_sync_key
      unique (driver_id, client_sync_id);
  end if;
end
$$;
