-- SolarShift OS — Phase 1: document-level access for client users.
-- CLIENT users require an explicit document grant; internal roles retain project-level access.

create table if not exists public.document_access_grants (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

alter table public.document_access_grants enable row level security;

create or replace function public.can_access_document(target_document uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_project((select d.project_id from public.documents d where d.id = target_document))
  and (
    exists (select 1 from public.organization_memberships m join public.projects p on p.organization_id = m.organization_id join public.documents d on d.project_id = p.id where d.id = target_document and m.user_id = auth.uid() and m.role in ('ADMIN','SOLARSHIFT','MANDATAIRE','EXPERT','INVESTOR','INSTITUTION'))
    or exists (select 1 from public.project_access_grants g join public.documents d on d.project_id = g.project_id where d.id = target_document and g.user_id = auth.uid() and g.role in ('ADMIN','SOLARSHIFT','MANDATAIRE','EXPERT','INVESTOR','INSTITUTION'))
    or exists (select 1 from public.document_access_grants dg where dg.document_id = target_document and dg.user_id = auth.uid())
  );
$$;

drop policy if exists "document access" on public.documents;
create policy "document access by role or explicit grant"
  on public.documents
  for select
  using (public.can_access_document(id));
