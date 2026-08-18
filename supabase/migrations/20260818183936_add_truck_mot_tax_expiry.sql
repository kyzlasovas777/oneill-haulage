alter table public.trucks
  add column if not exists mot_expiry date,
  add column if not exists road_tax_expiry date;
