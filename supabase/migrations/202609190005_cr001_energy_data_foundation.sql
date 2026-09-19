-- SolarShift OS — CR-001: versioned Energy and Scenario data foundation.
-- Deliberately contains no calculation formula or optimisation algorithm.

create type public.calculation_run_status as enum ('PENDING','RUNNING','SUCCEEDED','FAILED','INVALIDATED');
create type public.calculation_quality_level as enum ('Q0','Q1','Q2','Q3','Q4');
create type public.scenario_kind as enum ('CONFIGURATION','SENSITIVITY','STRESS');
create type public.scenario_status as enum ('DRAFT','CALCULATED','VALIDATED','PUBLISHED','RETIRED','REJECTED');
create type public.scenario_set_status as enum ('DRAFT','RUNNING','COMPLETED','FAILED','RETIRED');
create type public.energy_profile_kind as enum ('PV_PRODUCTION','LOAD');
create type public.energy_profile_granularity as enum ('THIRTY_MINUTES','HOURLY','NORMALIZED','ANNUAL');

create table public.energy_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_kind public.energy_profile_kind not null,
  granularity public.energy_profile_granularity not null,
  timezone text not null default 'Europe/Paris',
  unit text not null check (unit in ('kWh','kW')),
  source_type text not null,
  source_reference text,
  evidence_id uuid references public.evidences(id),
  quality_level public.calculation_quality_level not null,
  is_normalized boolean not null default false,
  assumptions jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  supersedes_id uuid references public.energy_profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, profile_kind, version),
  check ((granularity = 'NORMALIZED') = is_normalized),
  check (not (granularity = 'ANNUAL' and quality_level in ('Q2','Q3','Q4')))
);

create table public.energy_profile_points (
  id uuid primary key default gen_random_uuid(),
  energy_profile_id uuid not null references public.energy_profiles(id) on delete cascade,
  interval_start timestamptz not null,
  interval_end timestamptz not null,
  value_numeric numeric not null check (value_numeric >= 0),
  quality_flag text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  unique (energy_profile_id, interval_start),
  check (interval_end > interval_start)
);

create table public.scenario_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status public.scenario_set_status not null default 'DRAFT',
  generation_method text not null,
  optimizer_version text not null,
  objectives jsonb not null default '[]'::jsonb,
  constraints_snapshot jsonb not null default '{}'::jsonb,
  input_snapshot_hash text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  retired_at timestamptz,
  unique (project_id, name, optimizer_version, created_at)
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario_set_id uuid references public.scenario_sets(id) on delete set null,
  scenario_kind public.scenario_kind not null,
  name text not null,
  status public.scenario_status not null default 'DRAFT',
  generation_method text not null,
  technical_configuration jsonb not null default '{}'::jsonb,
  contractual_configuration jsonb not null default '{}'::jsonb,
  financing_configuration jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  constraints_snapshot jsonb not null default '{}'::jsonb,
  certainty_score_id uuid,
  risk_assessment_id uuid,
  resilience_assessment_id uuid,
  version integer not null default 1 check (version > 0),
  supersedes_id uuid references public.scenarios(id),
  validated_by uuid references public.profiles(id),
  validated_at timestamptz,
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((status = 'PUBLISHED') = (published_at is not null)),
  check ((status not in ('VALIDATED','PUBLISHED')) or validated_at is not null)
);

create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  engine_code text not null default 'ENERGY_ENGINE',
  engine_version text not null,
  ruleset_version text,
  financial_model_version text not null,
  status public.calculation_run_status not null default 'PENDING',
  quality_level public.calculation_quality_level not null,
  input_snapshot jsonb not null,
  input_snapshot_hash text not null,
  assumptions_snapshot jsonb not null default '{}'::jsonb,
  source_parameter_ids jsonb not null default '[]'::jsonb,
  source_profile_ids jsonb not null default '[]'::jsonb,
  external_study_references jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  missing_inputs jsonb not null default '[]'::jsonb,
  error_detail jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((status = 'SUCCEEDED') = (completed_at is not null))
);

create table public.calculated_kpis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete cascade,
  kpi_code text not null,
  value_numeric numeric,
  value_json jsonb,
  unit text not null,
  formula_version text not null,
  quality_level public.calculation_quality_level not null,
  source_parameter_ids jsonb not null default '[]'::jsonb,
  assumptions_snapshot jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  canonical_parameter_code text check (canonical_parameter_code in ('C03','C09')),
  is_validated_reference boolean not null default false,
  validated_by uuid references public.profiles(id),
  validated_at timestamptz,
  calculated_at timestamptz not null default now(),
  check (value_numeric is not null or value_json is not null),
  check ((is_validated_reference = false and canonical_parameter_code is null and validated_at is null)
      or (is_validated_reference = true and canonical_parameter_code is not null and validated_at is not null))
);

create unique index one_validated_reference_per_project_parameter
  on public.calculated_kpis(project_id, canonical_parameter_code)
  where is_validated_reference;
create index energy_profiles_project_kind_idx on public.energy_profiles(project_id, profile_kind, version desc);
create index energy_profile_points_profile_interval_idx on public.energy_profile_points(energy_profile_id, interval_start);
create index scenario_sets_project_status_idx on public.scenario_sets(project_id, status, created_at desc);
create index scenarios_project_kind_status_idx on public.scenarios(project_id, scenario_kind, status, created_at desc);
create index scenarios_published_investor_idx on public.scenarios(project_id, published_at desc) where status = 'PUBLISHED';
create index calculation_runs_project_scenario_idx on public.calculation_runs(project_id, scenario_id, created_at desc);
create index calculation_runs_hash_idx on public.calculation_runs(engine_code, engine_version, input_snapshot_hash) where status = 'SUCCEEDED';
create index calculated_kpis_project_code_idx on public.calculated_kpis(project_id, kpi_code, calculated_at desc);
create index calculated_kpis_run_idx on public.calculated_kpis(calculation_run_id);

-- C03/C09 remain the compatible canonical values. This controlled promotion is
-- the only foundation-level path from a validated calculation output to them.
create function public.promote_validated_kpi_to_canonical_parameter(
  target_kpi uuid,
  change_reason text default 'validated calculation reference'
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare k public.calculated_kpis; target_parameter uuid;
begin
  select * into k from public.calculated_kpis where id = target_kpi for update;
  if k.id is null or not public.can_write_project(k.project_id) then raise exception 'not authorized'; end if;
  if not k.is_validated_reference or k.canonical_parameter_code is null or k.value_numeric is null then
    raise exception 'KPI is not an eligible validated canonical reference';
  end if;
  target_parameter := public.append_project_parameter(
    k.project_id, k.canonical_parameter_code, k.value_numeric, null, null, null,
    jsonb_build_object('calculation_run_id', k.calculation_run_id, 'calculated_kpi_id', k.id),
    k.unit, 'CALCULATION', 'L5', 'VALIDATED', change_reason
  );
  insert into public.audit_log(project_id, entity_type, entity_id, action, new_value, reason, user_id)
  values (k.project_id, 'CALCULATED_KPI', k.id, 'PROMOTED_TO_CANONICAL_PARAMETER',
    jsonb_build_object('parameter_id', target_parameter, 'parameter_code', k.canonical_parameter_code), change_reason, auth.uid());
  return target_parameter;
end;
$$;

create function public.audit_energy_foundation_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare project_uuid uuid;
begin
  project_uuid := coalesce(new.project_id, old.project_id);
  insert into public.audit_log(project_id, entity_type, entity_id, action, old_value, new_value, user_id)
  values (project_uuid, TG_TABLE_NAME, coalesce(new.id, old.id), TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end, auth.uid());
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create function public.audit_energy_profile_point_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare project_uuid uuid;
begin
  select project_id into project_uuid from public.energy_profiles
  where id = coalesce(new.energy_profile_id, old.energy_profile_id);
  insert into public.audit_log(project_id, entity_type, entity_id, action, old_value, new_value, user_id)
  values (project_uuid, TG_TABLE_NAME, coalesce(new.id, old.id), TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end, auth.uid());
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger energy_profiles_audit after insert or update or delete on public.energy_profiles
  for each row execute function public.audit_energy_foundation_change();
create trigger energy_profile_points_audit after insert or update or delete on public.energy_profile_points
  for each row execute function public.audit_energy_profile_point_change();
create trigger scenario_sets_audit after insert or update or delete on public.scenario_sets
  for each row execute function public.audit_energy_foundation_change();
create trigger scenarios_audit after insert or update or delete on public.scenarios
  for each row execute function public.audit_energy_foundation_change();
create trigger calculation_runs_audit after insert or update or delete on public.calculation_runs
  for each row execute function public.audit_energy_foundation_change();
create trigger calculated_kpis_audit after insert or update or delete on public.calculated_kpis
  for each row execute function public.audit_energy_foundation_change();

alter table public.energy_profiles enable row level security;
alter table public.energy_profile_points enable row level security;
alter table public.scenario_sets enable row level security;
alter table public.scenarios enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.calculated_kpis enable row level security;

create function public.has_internal_project_role(target_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p join public.organization_memberships m on m.organization_id = p.organization_id
    where p.id = target_project and m.user_id = auth.uid() and m.role <> 'INVESTOR'
  ) or exists (
    select 1 from public.project_access_grants g
    where g.project_id = target_project and g.user_id = auth.uid() and g.role <> 'INVESTOR'
  );
$$;

create function public.has_investor_project_role(target_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p join public.organization_memberships m on m.organization_id = p.organization_id
    where p.id = target_project and m.user_id = auth.uid() and m.role = 'INVESTOR'
  ) or exists (
    select 1 from public.project_access_grants g
    where g.project_id = target_project and g.user_id = auth.uid() and g.role = 'INVESTOR'
  );
$$;

create policy "energy profile read" on public.energy_profiles for select using (public.has_internal_project_role(project_id));
create policy "energy profile point read" on public.energy_profile_points for select using (
  exists (select 1 from public.energy_profiles p where p.id = energy_profile_id and public.has_internal_project_role(p.project_id))
);
create policy "scenario set read" on public.scenario_sets for select using (public.has_internal_project_role(project_id));
create policy "scenario read by role and publication" on public.scenarios for select using (
  public.has_internal_project_role(project_id)
  or (status = 'PUBLISHED' and public.has_investor_project_role(project_id))
);
create policy "calculation run read by scenario publication" on public.calculation_runs for select using (
  public.has_internal_project_role(project_id)
  or (scenario_id is not null and public.has_investor_project_role(project_id)
      and exists (select 1 from public.scenarios s where s.id = scenario_id and s.status = 'PUBLISHED'))
);
create policy "calculated KPI read by scenario publication" on public.calculated_kpis for select using (
  public.has_internal_project_role(project_id)
  or (scenario_id is not null and public.has_investor_project_role(project_id)
      and exists (select 1 from public.scenarios s where s.id = scenario_id and s.status = 'PUBLISHED'))
);

-- Writes are server/service mediated; no direct client write policies are added.
