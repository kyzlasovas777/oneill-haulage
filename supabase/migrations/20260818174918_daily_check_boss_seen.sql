alter table public.daily_checks
  add column if not exists boss_seen_at timestamptz;

-- Existing checks predate the dashboard alert feature, so treat them as already seen.
update public.daily_checks
set boss_seen_at = coalesce(boss_seen_at, now());

create index if not exists daily_checks_unseen_by_driver_idx
  on public.daily_checks (driver_id, checked_at desc)
  where boss_seen_at is null;
