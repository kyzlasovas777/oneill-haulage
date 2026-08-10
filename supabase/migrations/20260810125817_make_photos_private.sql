do $$
begin
  update storage.buckets
  set public = false,
      updated_at = now()
  where id = 'entry-photos';

  if not found then
    raise exception 'entry-photos bucket does not exist';
  end if;
end;
$$;

update public.entry_photos
set photo_url = file_path
where file_path is not null
  and photo_url is distinct from file_path;

update public.diesel_entries
set photo_url = photo_path
where photo_path is not null
  and photo_url is distinct from photo_path;
update public.diesel_photos
set photo_url = photo_path
where photo_url is distinct from photo_path;

update public.service_photos
set photo_url = photo_path
where photo_url is distinct from photo_path;

update public.daily_check_photos
set photo_url = photo_path
where photo_path is not null
  and photo_url is distinct from photo_path;
