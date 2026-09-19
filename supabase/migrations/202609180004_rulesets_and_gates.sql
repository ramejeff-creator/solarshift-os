-- SolarShift OS — Phase 3: versioned rulesets and project gates. No score is calculated here.

create type public.ruleset_status as enum ('DRAFT','IN_REVIEW','ACTIVE','RETIRED');
create type public.gate_state as enum ('OPEN','HUMAN_REVIEW_REQUIRED','RESOLVED','WAIVED');
create type public.gate_severity as enum ('INFO','WARNING','BLOCKING','CRITICAL');

-- Map readiness. Coordinates are stored on the project; business filters stay
-- derived from the latest version of Data Dictionary parameters.
alter table public.projects
  add column if not exists latitude numeric(9,6) check (latitude between -90 and 90),
  add column if not exists longitude numeric(9,6) check (longitude between -180 and 180);
create index if not exists projects_map_coordinates_idx on public.projects (latitude, longitude)
  where latitude is not null and longitude is not null;

create table public.rulesets (
  id uuid primary key default gen_random_uuid(),
  ruleset_code text not null,
  version text not null,
  framework_version text not null,
  status public.ruleset_status not null default 'DRAFT',
  effective_from date,
  effective_to date,
  definition jsonb not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  activated_by uuid references public.profiles(id),
  activated_at timestamptz,
  unique (ruleset_code, version)
);

create unique index one_active_ruleset_per_code_period
  on public.rulesets (ruleset_code)
  where status = 'ACTIVE' and effective_to is null;

create table public.project_gates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  gate_code text not null,
  ruleset_id uuid references public.rulesets(id),
  state public.gate_state not null default 'OPEN',
  severity public.gate_severity not null,
  reason text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_reason text,
  unique (project_id, gate_code, ruleset_id)
);

alter table public.rulesets enable row level security;
alter table public.project_gates enable row level security;
create policy "ruleset read" on public.rulesets for select using (auth.uid() is not null);
create policy "gate read" on public.project_gates for select using (public.can_access_project(project_id));

create function public.can_transition_to_financeable(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.project_gates g
    where g.project_id = target_project
      and g.state in ('OPEN','HUMAN_REVIEW_REQUIRED')
      and g.severity in ('BLOCKING','CRITICAL')
  );
$$;

create view public.project_map_filters with (security_invoker = true) as
  with latest_parameters as (
    select distinct on (project_id, parameter_code) project_id, parameter_code, value_numeric, unit
    from public.project_parameters
    order by project_id, parameter_code, version desc
  )
  select p.id, p.project_reference, p.name, p.status, p.city, p.latitude, p.longitude,
    max(lp.value_numeric) filter (where lp.parameter_code = 'A01') as site_surface_m2,
    max(lp.value_numeric) filter (where lp.parameter_code = 'A02') as usable_surface_m2,
    max(lp.value_numeric) filter (where lp.parameter_code = 'C01') as capex_total_eur,
    max(lp.value_numeric) filter (where lp.parameter_code = 'C03') as annual_production_kwh,
    max(lp.value_numeric) filter (where lp.parameter_code = 'C09') as investor_irr_percent
  from public.projects p
  left join latest_parameters lp on lp.project_id = p.id
  group by p.id;
