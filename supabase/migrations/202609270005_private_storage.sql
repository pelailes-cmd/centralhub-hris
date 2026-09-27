insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('hris-private','hris-private',false,10485760,array['application/pdf','image/png','image/jpeg','text/plain'])
  on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
alter table storage.objects enable row level security;
create policy centralhub_private_storage_gate on storage.objects as restrictive for all to anon,authenticated
  using(bucket_id <> 'hris-private') with check(bucket_id <> 'hris-private');
-- Intentionally no storage.objects policies for this bucket. Next.js checks the caller
-- through download_document() for EACH download, then streams using its server key.
-- Unlike reusable signed URLs, access stops as soon as an account/grant is revoked.
