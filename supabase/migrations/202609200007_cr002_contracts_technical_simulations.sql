-- SolarShift OS — CR-002 phases 2.1–2.3 only.
-- Governance, technical configurations, external engineering results and
-- persisted non-canonical simulations. No new financial formula is introduced.

create type public.simulation_status as enum ('WORKING','FROZEN','PROMOTED','EXPIRED','RETIRED');
create type public.engine_result_kind as enum (
  'THEORETICAL_PRODUCTION','MONTHLY_PRODUCTION','HOURLY_PRODUCTION',
  'SPECIFIC_YIELD','P50','P90','SHADING_LOSS','SYSTEM_LOSS'
);

create table public.technical_configurations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  supersedes_id uuid references public.technical_configurations(id),
  pv_capacity_kwp numeric check (pv_capacity_kwp is null or pv_capacity_kwp >= 0),
  module_count integer check (module_count is null or module_count >= 0),
  module_manufacturer text,
  module_model text,
  module_power_wp numeric check (module_power_wp is null or module_power_wp >= 0),
  inverter_manufacturer text,
  inverter_model text,
  inverter_count integer check (inverter_count is null or inverter_count >= 0),
  orientation_deg numeric check (orientation_deg is null or orientation_deg between -180 and 180),
  tilt_deg numeric check (tilt_deg is null or tilt_deg between 0 and 90),
  production_source text,
  system_losses_pct numeric check (system_losses_pct is null or system_losses_pct between 0 and 100),
  degradation_pct_per_year numeric check (degradation_pct_per_year is null or degradation_pct_per_year between 0 and 100),
  external_engine_reference text,
  evidence_id uuid references public.evidences(id),
  provenance jsonb not null default '{}'::jsonb,
  is_frozen boolean not null default false,
  frozen_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, version),
  check ((is_frozen = true) = (frozen_at is not null))
);

alter table public.scenarios
  add column technical_configuration_id uuid references public.technical_configurations(id),
  add column source_simulation_id uuid,
  add column revoked_by uuid references public.profiles(id),
  add column revoked_at timestamptz,
  add column revocation_reason text;

create table public.external_engine_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario_id uuid references public.scenarios(id) on delete set null,
  technical_configuration_id uuid references public.technical_configurations(id) on delete set null,
  source_engine text not null,
  source_reference text not null,
  result_kind public.engine_result_kind not null,
  value_numeric numeric,
  value_json jsonb,
  unit text not null,
  methodology text,
  evidence_id uuid references public.evidences(id),
  quality_level public.calculation_quality_level not null,
  validation_status public.validation_state not null default 'UNKNOWN',
  provenance jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  supersedes_id uuid references public.external_engine_results(id),
  validated_by uuid references public.profiles(id),
  validated_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (value_numeric is not null or value_json is not null),
  check (result_kind not in ('P50','P90') or evidence_id is not null),
  check (not (upper(source_engine) = 'PVGIS' and result_kind in ('P50','P90'))),
  check ((validation_status = 'VALIDATED') = (validated_at is not null and validated_by is not null))
);

create table public.simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status public.simulation_status not null default 'WORKING',
  is_canonical boolean not null default false check (is_canonical = false),
  revision integer not null default 1 check (revision > 0),
  working_assumptions jsonb not null default '{}'::jsonb,
  working_configuration jsonb not null default '{}'::jsonb,
  technical_configuration_id uuid references public.technical_configurations(id) on delete set null,
  latest_calculation_run_id uuid references public.calculation_runs(id) on delete set null,
  retention_days integer not null default 90 check (retention_days between 1 and 3650),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  frozen_snapshot jsonb,
  frozen_snapshot_hash text,
  frozen_at timestamptz,
  promoted_scenario_id uuid references public.scenarios(id) on delete set null,
  promoted_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (status not in ('FROZEN','PROMOTED') or frozen_at is not null),
  check ((status = 'PROMOTED') = (promoted_scenario_id is not null))
);

alter table public.calculation_runs
  add column simulation_session_id uuid references public.simulation_sessions(id) on delete set null;

alter table public.scenarios
  add constraint scenarios_source_simulation_fk foreign key (source_simulation_id)
  references public.simulation_sessions(id) on delete set null;

create table public.scenario_investor_grants (
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  primary key (scenario_id, user_id),
  check ((revoked_at is null) = (revoked_by is null))
);

create function public.has_active_scenario_investor_grant(target_scenario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.scenario_investor_grants g
    where g.scenario_id = target_scenario and g.user_id = auth.uid() and g.revoked_at is null
  );
$$;

create function public.user_has_project_role(target_project uuid, target_user uuid, target_role public.solarshift_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p join public.organization_memberships m on m.organization_id = p.organization_id
    where p.id = target_project and m.user_id = target_user and m.role = target_role
  ) or exists (
    select 1 from public.project_access_grants g
    where g.project_id = target_project and g.user_id = target_user and g.role = target_role
  );
$$;

create index technical_configurations_project_version_idx on public.technical_configurations(project_id, version desc);
create index external_engine_results_project_kind_idx on public.external_engine_results(project_id, result_kind, version desc);
create index external_engine_results_evidence_idx on public.external_engine_results(evidence_id) where evidence_id is not null;
create index simulation_sessions_project_status_idx on public.simulation_sessions(project_id, status, last_activity_at desc);
create index simulation_sessions_expiry_idx on public.simulation_sessions(expires_at) where status = 'WORKING';
create index scenario_investor_grants_user_idx on public.scenario_investor_grants(user_id, scenario_id) where revoked_at is null;

create function public.has_project_role(target_project uuid, accepted_roles public.solarshift_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p join public.organization_memberships m on m.organization_id = p.organization_id
    where p.id = target_project and m.user_id = auth.uid() and m.role = any(accepted_roles)
  ) or exists (
    select 1 from public.project_access_grants g
    where g.project_id = target_project and g.user_id = auth.uid() and g.role = any(accepted_roles)
  );
$$;

create function public.protect_frozen_technical_configuration() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.is_frozen then raise exception 'frozen technical configurations are immutable'; end if;
  return new;
end;
$$;
create trigger technical_configuration_immutable before update or delete on public.technical_configurations
  for each row execute function public.protect_frozen_technical_configuration();

create function public.require_frozen_scenario_technical_configuration() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.technical_configuration_id is not null and not exists (
    select 1 from public.technical_configurations c
    where c.id = new.technical_configuration_id and c.project_id = new.project_id and c.is_frozen
  ) then raise exception 'scenario technical configuration must be frozen and belong to the project'; end if;
  return new;
end;
$$;
create trigger scenario_requires_frozen_technical_configuration
  before insert or update of technical_configuration_id on public.scenarios
  for each row execute function public.require_frozen_scenario_technical_configuration();

create function public.enforce_scenario_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'DRAFT' and new.status in ('CALCULATED','REJECTED','RETIRED')) or
    (old.status = 'CALCULATED' and new.status in ('VALIDATED','REJECTED','RETIRED')) or
    (old.status = 'VALIDATED' and new.status in ('PUBLISHED','RETIRED')) or
    (old.status = 'PUBLISHED' and new.status in ('VALIDATED','RETIRED'))
  ) then raise exception 'invalid scenario lifecycle transition: % to %', old.status, new.status; end if;
  return new;
end;
$$;
create trigger scenario_lifecycle_guard before update of status on public.scenarios
  for each row execute function public.enforce_scenario_lifecycle();

create function public.protect_validated_scenario_content() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status in ('VALIDATED','PUBLISHED','RETIRED') and (
    new.project_id, new.scenario_set_id, new.scenario_kind, new.name,
    new.generation_method, new.technical_configuration, new.contractual_configuration,
    new.financing_configuration, new.assumptions, new.constraints_snapshot,
    new.technical_configuration_id, new.source_simulation_id, new.version, new.supersedes_id
  ) is distinct from (
    old.project_id, old.scenario_set_id, old.scenario_kind, old.name,
    old.generation_method, old.technical_configuration, old.contractual_configuration,
    old.financing_configuration, old.assumptions, old.constraints_snapshot,
    old.technical_configuration_id, old.source_simulation_id, old.version, old.supersedes_id
  ) then raise exception 'validated scenario content is immutable; create a new version'; end if;
  return new;
end;
$$;
create trigger validated_scenario_content_immutable before update on public.scenarios
  for each row execute function public.protect_validated_scenario_content();

create function public.validate_scenario(target_scenario uuid, validation_comment text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.scenarios;
begin
  select * into s from public.scenarios where id = target_scenario for update;
  if s.id is null or not public.has_project_role(s.project_id, array['ADMIN','SOLARSHIFT','EXPERT']::public.solarshift_role[]) then raise exception 'not authorized'; end if;
  if s.status <> 'CALCULATED' then raise exception 'only a calculated scenario can be validated'; end if;
  update public.scenarios set status = 'VALIDATED', validated_by = auth.uid(), validated_at = now() where id = s.id;
  insert into public.validations(project_id, entity_type, entity_id, previous_status, new_status, validated_by, comment)
  values (s.project_id, 'SCENARIO', s.id, s.status::text, 'VALIDATED', auth.uid(), validation_comment);
end;
$$;

create function public.publish_scenario(target_scenario uuid, investor_user_ids uuid[], publication_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.scenarios; investor_user uuid;
begin
  select * into s from public.scenarios where id = target_scenario for update;
  if s.id is null or not public.has_project_role(s.project_id, array['ADMIN','SOLARSHIFT']::public.solarshift_role[]) then raise exception 'not authorized'; end if;
  if s.status <> 'VALIDATED' then raise exception 'only a validated scenario can be published'; end if;
  if coalesce(array_length(investor_user_ids, 1), 0) = 0 then raise exception 'explicit investor authorization is required'; end if;
  update public.scenarios set status = 'PUBLISHED', published_by = auth.uid(), published_at = now(), revoked_by = null, revoked_at = null, revocation_reason = null where id = s.id;
  foreach investor_user in array investor_user_ids loop
    if not public.user_has_project_role(s.project_id, investor_user, 'INVESTOR') then
      raise exception 'investor user is not authorized for this project';
    end if;
    insert into public.scenario_investor_grants(scenario_id, user_id, granted_by)
    values (s.id, investor_user, auth.uid())
    on conflict (scenario_id, user_id) do update set granted_by = excluded.granted_by, granted_at = now(), revoked_by = null, revoked_at = null;
  end loop;
  insert into public.audit_log(project_id, entity_type, entity_id, action, reason, user_id)
  values (s.project_id, 'SCENARIO', s.id, 'PUBLISHED_FOR_INVESTORS', publication_reason, auth.uid());
end;
$$;

create function public.retire_scenario(target_scenario uuid, retire_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.scenarios;
begin
  select * into s from public.scenarios where id = target_scenario for update;
  if s.id is null or not public.has_project_role(s.project_id, array['ADMIN','SOLARSHIFT']::public.solarshift_role[]) then raise exception 'not authorized'; end if;
  if s.status not in ('DRAFT','CALCULATED','VALIDATED','PUBLISHED') then raise exception 'scenario cannot be retired from its current state'; end if;
  update public.scenarios set status = 'RETIRED',
    published_by = null, published_at = null,
    revoked_by = case when s.status = 'PUBLISHED' then auth.uid() else revoked_by end,
    revoked_at = case when s.status = 'PUBLISHED' then now() else revoked_at end,
    revocation_reason = case when s.status = 'PUBLISHED' then retire_reason else revocation_reason end
  where id = s.id;
  update public.scenario_investor_grants set revoked_by = auth.uid(), revoked_at = now()
    where scenario_id = s.id and revoked_at is null;
  insert into public.audit_log(project_id, entity_type, entity_id, action, reason, user_id)
  values (s.project_id, 'SCENARIO', s.id, 'RETIRED', retire_reason, auth.uid());
end;
$$;

create function public.revoke_scenario_publication(target_scenario uuid, revoke_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.scenarios;
begin
  select * into s from public.scenarios where id = target_scenario for update;
  if s.id is null or not public.has_project_role(s.project_id, array['ADMIN','SOLARSHIFT']::public.solarshift_role[]) then raise exception 'not authorized'; end if;
  if s.status <> 'PUBLISHED' then raise exception 'scenario is not published'; end if;
  if nullif(trim(revoke_reason), '') is null then raise exception 'revocation reason is required'; end if;
  update public.scenarios set status = 'VALIDATED', published_by = null, published_at = null,
    revoked_by = auth.uid(), revoked_at = now(), revocation_reason = revoke_reason where id = s.id;
  update public.scenario_investor_grants set revoked_by = auth.uid(), revoked_at = now()
    where scenario_id = s.id and revoked_at is null;
  insert into public.audit_log(project_id, entity_type, entity_id, action, reason, user_id)
  values (s.project_id, 'SCENARIO', s.id, 'INVESTOR_PUBLICATION_REVOKED', revoke_reason, auth.uid());
end;
$$;

create function public.freeze_simulation_to_scenario(target_simulation uuid, scenario_name text, target_kind public.scenario_kind default 'CONFIGURATION')
returns uuid language plpgsql security definer set search_path = public as $$
declare sim public.simulation_sessions; cfg public.technical_configurations; next_scenario uuid; next_version integer; snapshot jsonb;
begin
  select * into sim from public.simulation_sessions where id = target_simulation for update;
  if sim.id is null or not public.can_write_project(sim.project_id) then raise exception 'not authorized'; end if;
  if sim.status <> 'WORKING' then raise exception 'only a working simulation can be frozen'; end if;
  if sim.technical_configuration_id is not null then
    select * into cfg from public.technical_configurations where id = sim.technical_configuration_id and project_id = sim.project_id for update;
    if cfg.id is null then raise exception 'technical configuration does not belong to simulation project'; end if;
    update public.technical_configurations set is_frozen = true, frozen_at = now() where id = cfg.id;
  end if;
  snapshot := jsonb_build_object(
    'simulation_id', sim.id, 'simulation_revision', sim.revision,
    'working_assumptions', sim.working_assumptions,
    'working_configuration', sim.working_configuration,
    'technical_configuration_id', sim.technical_configuration_id,
    'latest_calculation_run_id', sim.latest_calculation_run_id
  );
  select coalesce(max(version), 0) + 1 into next_version from public.scenarios where project_id = sim.project_id and name = scenario_name;
  insert into public.scenarios(project_id, scenario_kind, name, generation_method,
    technical_configuration, assumptions, technical_configuration_id, source_simulation_id,
    status, version, created_by)
  values(sim.project_id, target_kind, scenario_name, 'SIMULATION_FREEZE',
    sim.working_configuration, sim.working_assumptions, sim.technical_configuration_id, sim.id,
    'DRAFT', next_version, auth.uid()) returning id into next_scenario;
  update public.simulation_sessions set status = 'PROMOTED', frozen_snapshot = snapshot,
    frozen_snapshot_hash = encode(digest(snapshot::text, 'sha256'), 'hex'), frozen_at = now(),
    promoted_scenario_id = next_scenario, promoted_at = now(), updated_by = auth.uid(), updated_at = now()
    where id = sim.id;
  insert into public.audit_log(project_id, entity_type, entity_id, action, new_value, user_id)
  values(sim.project_id, 'SIMULATION_SESSION', sim.id, 'FROZEN_TO_DRAFT_SCENARIO',
    jsonb_build_object('scenario_id', next_scenario, 'snapshot', snapshot), auth.uid());
  return next_scenario;
end;
$$;

create function public.create_working_simulation(
  target_project uuid, simulation_name text, retention_period_days integer default 90
) returns uuid language plpgsql security definer set search_path = public as $$
declare next_id uuid;
begin
  if not public.can_write_project(target_project) then raise exception 'not authorized'; end if;
  if retention_period_days < 1 or retention_period_days > 3650 then raise exception 'invalid retention period'; end if;
  insert into public.simulation_sessions(project_id, name, retention_days, expires_at, created_by, updated_by)
  values(target_project, simulation_name, retention_period_days,
    now() + make_interval(days => retention_period_days), auth.uid(), auth.uid())
  returning id into next_id;
  return next_id;
end;
$$;

create function public.update_working_simulation(
  target_simulation uuid, expected_revision integer, simulation_name text,
  assumptions_patch jsonb, configuration_patch jsonb,
  target_technical_configuration uuid default null, target_calculation_run uuid default null
) returns integer language plpgsql security definer set search_path = public as $$
declare sim public.simulation_sessions; next_revision integer;
begin
  select * into sim from public.simulation_sessions where id = target_simulation for update;
  if sim.id is null or not public.can_write_project(sim.project_id) then raise exception 'not authorized'; end if;
  if sim.status <> 'WORKING' then raise exception 'only a working simulation can be edited'; end if;
  if sim.revision <> expected_revision then raise exception 'simulation revision conflict'; end if;
  if target_technical_configuration is not null and not exists (
    select 1 from public.technical_configurations c where c.id = target_technical_configuration and c.project_id = sim.project_id
  ) then raise exception 'technical configuration does not belong to simulation project'; end if;
  if target_calculation_run is not null and not exists (
    select 1 from public.calculation_runs r where r.id = target_calculation_run and r.project_id = sim.project_id
  ) then raise exception 'calculation run does not belong to simulation project'; end if;
  next_revision := sim.revision + 1;
  update public.simulation_sessions set
    name = coalesce(nullif(trim(simulation_name), ''), name),
    working_assumptions = coalesce(assumptions_patch, working_assumptions),
    working_configuration = coalesce(configuration_patch, working_configuration),
    technical_configuration_id = coalesce(target_technical_configuration, technical_configuration_id),
    latest_calculation_run_id = coalesce(target_calculation_run, latest_calculation_run_id),
    revision = next_revision, last_activity_at = now(),
    expires_at = now() + make_interval(days => retention_days),
    updated_by = auth.uid(), updated_at = now()
  where id = sim.id;
  return next_revision;
end;
$$;

create function public.audit_cr002_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare project_uuid uuid;
begin
  project_uuid := coalesce(new.project_id, old.project_id);
  insert into public.audit_log(project_id, entity_type, entity_id, action, old_value, new_value, user_id)
  values (project_uuid, tg_table_name, coalesce(new.id, old.id), tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end, auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger technical_configurations_audit after insert or update or delete on public.technical_configurations
  for each row execute function public.audit_cr002_change();
create trigger external_engine_results_audit after insert or update or delete on public.external_engine_results
  for each row execute function public.audit_cr002_change();
create trigger simulation_sessions_audit after insert or update or delete on public.simulation_sessions
  for each row execute function public.audit_cr002_change();

alter table public.technical_configurations enable row level security;
alter table public.external_engine_results enable row level security;
alter table public.simulation_sessions enable row level security;
alter table public.scenario_investor_grants enable row level security;

create policy "technical configuration read" on public.technical_configurations for select using (
  public.has_internal_project_role(project_id) or exists (
    select 1 from public.scenarios s
    where s.technical_configuration_id = technical_configurations.id and s.status = 'PUBLISHED'
      and public.has_active_scenario_investor_grant(s.id)
  )
);
create policy "external result read" on public.external_engine_results for select using (
  public.has_internal_project_role(project_id) or (scenario_id is not null and exists (
    select 1 from public.scenarios s
    where s.id = external_engine_results.scenario_id and s.status = 'PUBLISHED'
      and public.has_active_scenario_investor_grant(s.id)
  ))
);
create policy "simulation authorized worker read" on public.simulation_sessions for select using (public.can_write_project(project_id));
create policy "investor grant self read" on public.scenario_investor_grants for select using (
  user_id = auth.uid() or exists (
    select 1 from public.scenarios s where s.id = scenario_id and public.has_project_role(s.project_id, array['ADMIN','SOLARSHIFT']::public.solarshift_role[])
  )
);

drop policy if exists "scenario read by role and publication" on public.scenarios;
create policy "scenario read by role and explicit publication" on public.scenarios for select using (
  public.has_internal_project_role(project_id) or (status = 'PUBLISHED' and public.has_active_scenario_investor_grant(id))
);
drop policy if exists "calculation run read by scenario publication" on public.calculation_runs;
create policy "calculation run read by explicit scenario publication" on public.calculation_runs for select using (
  public.has_internal_project_role(project_id) or (scenario_id is not null and exists (
    select 1 from public.scenarios s
    where s.id = calculation_runs.scenario_id and s.status = 'PUBLISHED' and public.has_active_scenario_investor_grant(s.id)
  ))
);
drop policy if exists "calculated KPI read by scenario publication" on public.calculated_kpis;
create policy "calculated KPI read by explicit scenario publication" on public.calculated_kpis for select using (
  public.has_internal_project_role(project_id) or (scenario_id is not null and exists (
    select 1 from public.scenarios s
    where s.id = calculated_kpis.scenario_id and s.status = 'PUBLISHED' and public.has_active_scenario_investor_grant(s.id)
  ))
);

-- Direct client writes remain disabled. Mutations go through audited services/RPCs.
