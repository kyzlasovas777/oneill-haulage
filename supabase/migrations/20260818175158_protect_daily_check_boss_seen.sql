create or replace function private.guard_daily_check_boss_seen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.boss_seen_at is distinct from old.boss_seen_at
     and not private.is_boss() then
    raise exception 'Not authorized';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_daily_check_boss_seen() from public;

drop trigger if exists guard_daily_check_boss_seen on public.daily_checks;
create trigger guard_daily_check_boss_seen
before update of boss_seen_at on public.daily_checks
for each row
execute function private.guard_daily_check_boss_seen();
