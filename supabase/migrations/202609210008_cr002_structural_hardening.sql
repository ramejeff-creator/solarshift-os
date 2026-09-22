-- SolarShift OS — CR-002 structural hardening after completion audit.
-- Additive migration: closes lifecycle, immutability, engineering provenance and
-- cross-project consistency gaps without rewriting migration 007.

-- P50/P90 are admissible only as validated, Evidence-backed external results.
alter table public.external_engine_results
  add constraint external_engine_results_pxx_validated_check
  check (
    result_kind not in ('P50','P90')
    or (evidence_id is not null and validation_status = 'VALIDATED')
  ) not valid;

alter table public.external_engine_results
  validate constraint external_engine_results_pxx_validated_check;

create unique index external_engine_results_version_uniq
  on public.external_engine_results(
    project_id, result_kind, lower(source_engine), source_reference, version
  );

-- Enforce tenant boundaries, Evidence ownership and coherent version chains.
create function public.enforce_technical_configuration_consistency() returns trigger
language plpgsql set search_path = public as $$
declare previous_configuration public.technical_configurations;
begin
  if new.evidence_id is not null and not exists (
    select 1 from public.evidences e
    where e.id = new.evidence_id and e.project_id = new.project_id
  ) then
    raise exception 'technical configuration Evidence must belong to the project';
  end if;

  if new.supersedes_id is not null then
    select * into previous_configuration
    from public.technical_configurations
    where id = new.supersedes_id;

    if previous_configuration.id is null
      or previous_configuration.project_id <> new.project_id
      or new.version <> previous_configuration.version + 1 then
      raise exception 'invalid technical configuration version chain';
    end if;
  end if;

  return new;
end;
$$;

create trigger technical_configuration_consistency
  before insert or update on public.technical_configurations
  for each row execute function public.enforce_technical_configuration_consistency();

create function public.enforce_external_engine_result_consistency() returns trigger
language plpgsql set search_path = public as $$
declare previous_result public.external_engine_results;
declare scenario_status public.scenario_status;
begin
  if new.scenario_id is not null then
    select s.status into scenario_status
    from public.scenarios s
    where s.id = new.scenario_id and s.project_id = new.project_id;

    if scenario_status is null then
      raise exception 'external result scenario must belong to the project';
    end if;

    if scenario_status in ('VALIDATED','PUBLISHED','RETIRED') then
      raise exception 'external results cannot change a governed scenario';
    end if;
  end if;

  if new.technical_configuration_id is not null and not exists (
    select 1 from public.technical_configurations c
    where c.id = new.technical_configuration_id and c.project_id = new.project_id
  ) then
    raise exception 'external result technical configuration must belong to the project';
  end if;

  if new.evidence_id is not null and not exists (
    select 1 from public.evidences e
    where e.id = new.evidence_id and e.project_id = new.project_id
  ) then
    raise exception 'external result Evidence must belong to the project';
  end if;

  if new.supersedes_id is not null then
    select * into previous_result
    from public.external_engine_results
    where id = new.supersedes_id;

    if previous_result.id is null
      or previous_result.project_id <> new.project_id
      or previous_result.result_kind <> new.result_kind
      or lower(previous_result.source_engine) <> lower(new.source_engine)
      or previous_result.source_reference <> new.source_reference
      or new.version <> previous_result.version + 1 then
      raise exception 'invalid external result version chain';
    end if;
  end if;

  return new;
end;
$$;

create trigger external_engine_result_consistency
  before insert or update on public.external_engine_results
  for each row execute function public.enforce_external_engine_result_consistency();

create function public.protect_validated_external_engine_result() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.validation_status = 'VALIDATED' then
    raise exception 'validated external results are immutable; create a new version';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger validated_external_engine_result_immutable
  before update or delete on public.external_engine_results
  for each row execute function public.protect_validated_external_engine_result();

-- A governed scenario is immutable as an aggregate, not merely as one row.
create or replace function public.protect_validated_scenario_content() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('VALIDATED','PUBLISHED','RETIRED') then
      raise exception 'validated scenarios are immutable; retire or create a new version';
    end if;
    return old;
  end if;

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
  ) then
    raise exception 'validated scenario content is immutable; create a new version';
  end if;

  return new;
end;
$$;

drop trigger validated_scenario_content_immutable on public.scenarios;
create trigger validated_scenario_content_immutable
  before update or delete on public.scenarios
  for each row execute function public.protect_validated_scenario_content();

create function public.guard_scenario_calculation_run() returns trigger
language plpgsql set search_path = public as $$
declare old_status public.scenario_status;
declare new_status public.scenario_status;
begin
  if tg_op in ('UPDATE','DELETE') and old.scenario_id is not null then
    select status into old_status from public.scenarios where id = old.scenario_id;
    if old_status in ('VALIDATED','PUBLISHED','RETIRED') then
      raise exception 'calculation evidence of a governed scenario is immutable';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') and new.scenario_id is not null then
    select status into new_status from public.scenarios where id = new.scenario_id;
  end if;
  if tg_op = 'INSERT' and new.scenario_id is not null and new_status <> 'DRAFT' then
    raise exception 'calculation runs may be attached only to a DRAFT scenario';
  end if;
  if tg_op = 'UPDATE' and new.scenario_id is distinct from old.scenario_id
    and new.scenario_id is not null and new_status <> 'DRAFT' then
    raise exception 'calculation runs may be attached only to a DRAFT scenario';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger scenario_calculation_run_guard
  before insert or update or delete on public.calculation_runs
  for each row execute function public.guard_scenario_calculation_run();

create function public.guard_scenario_calculated_kpi() returns trigger
language plpgsql set search_path = public as $$
declare old_status public.scenario_status;
declare new_status public.scenario_status;
begin
  if tg_op in ('UPDATE','DELETE') and old.scenario_id is not null then
    select status into old_status from public.scenarios where id = old.scenario_id;
    if old_status in ('VALIDATED','PUBLISHED','RETIRED') then
      raise exception 'calculated KPIs of a governed scenario are immutable';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') and new.scenario_id is not null then
    select status into new_status from public.scenarios where id = new.scenario_id;
  end if;
  if tg_op = 'INSERT' and new.scenario_id is not null and new_status <> 'DRAFT' then
    raise exception 'calculated KPIs may be attached only to a DRAFT scenario';
  end if;
  if tg_op = 'UPDATE' and new.scenario_id is distinct from old.scenario_id
    and new.scenario_id is not null and new_status <> 'DRAFT' then
    raise exception 'calculated KPIs may be attached only to a DRAFT scenario';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger scenario_calculated_kpi_guard
  before insert or update or delete on public.calculated_kpis
  for each row execute function public.guard_scenario_calculated_kpi();

-- PUBLISHED -> VALIDATED is legal only through the audited revocation command.
create or replace function public.enforce_scenario_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'DRAFT' and new.status in ('CALCULATED','REJECTED','RETIRED')) or
    (old.status = 'CALCULATED' and new.status in ('VALIDATED','REJECTED','RETIRED')) or
    (old.status = 'VALIDATED' and new.status in ('PUBLISHED','RETIRED')) or
    (old.status = 'PUBLISHED' and new.status = 'RETIRED') or
    (old.status = 'PUBLISHED' and new.status = 'VALIDATED'
      and coalesce(current_setting('solarshift.publication_revocation', true), '') = 'allowed')
  ) then
    raise exception 'invalid scenario lifecycle transition: % to %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function public.revoke_scenario_publication(target_scenario uuid, revoke_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.scenarios;
begin
  select * into s from public.scenarios where id = target_scenario for update;
  if s.id is null or not public.has_project_role(s.project_id, array['ADMIN','SOLARSHIFT']::public.solarshift_role[]) then
    raise exception 'not authorized';
  end if;
  if s.status <> 'PUBLISHED' then raise exception 'scenario is not published'; end if;
  if nullif(trim(revoke_reason), '') is null then raise exception 'revocation reason is required'; end if;

  perform set_config('solarshift.publication_revocation', 'allowed', true);
  update public.scenarios set status = 'VALIDATED', published_by = null, published_at = null,
    revoked_by = auth.uid(), revoked_at = now(), revocation_reason = revoke_reason
    where id = s.id;
  perform set_config('solarshift.publication_revocation', '', true);

  update public.scenario_investor_grants set revoked_by = auth.uid(), revoked_at = now()
    where scenario_id = s.id and revoked_at is null;
  insert into public.audit_log(project_id, entity_type, entity_id, action, reason, user_id)
  values (s.project_id, 'SCENARIO', s.id, 'INVESTOR_PUBLICATION_REVOKED', revoke_reason, auth.uid());
end;
$$;

create function public.protect_promoted_simulation_snapshot() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status <> 'WORKING' and (
    new.project_id, new.working_assumptions, new.working_configuration,
    new.technical_configuration_id, new.latest_calculation_run_id,
    new.frozen_snapshot, new.frozen_snapshot_hash, new.frozen_at,
    new.promoted_scenario_id, new.promoted_at
  ) is distinct from (
    old.project_id, old.working_assumptions, old.working_configuration,
    old.technical_configuration_id, old.latest_calculation_run_id,
    old.frozen_snapshot, old.frozen_snapshot_hash, old.frozen_at,
    old.promoted_scenario_id, old.promoted_at
  ) then
    raise exception 'frozen simulation snapshots are immutable';
  end if;
  return new;
end;
$$;

create trigger promoted_simulation_snapshot_immutable
  before update on public.simulation_sessions
  for each row execute function public.protect_promoted_simulation_snapshot();

create function public.enforce_simulation_lifecycle() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'WORKING' and new.status in ('FROZEN','PROMOTED','EXPIRED','RETIRED')) or
    (old.status = 'FROZEN' and new.status in ('PROMOTED','RETIRED')) or
    (old.status = 'PROMOTED' and new.status = 'RETIRED') or
    (old.status = 'EXPIRED' and new.status = 'RETIRED')
  ) then
    raise exception 'invalid simulation lifecycle transition: % to %', old.status, new.status;
  end if;
  return new;
end;
$$;

create trigger simulation_lifecycle_guard
  before update of status on public.simulation_sessions
  for each row execute function public.enforce_simulation_lifecycle();

-- Audited mutation surface for technical and external engineering data.
create function public.append_technical_configuration(
  target_project uuid,
  configuration jsonb,
  target_supersedes uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare next_id uuid;
declare next_version integer;
declare previous_configuration public.technical_configurations;
begin
  if not public.can_write_project(target_project) then raise exception 'not authorized'; end if;
  perform 1 from public.projects where id = target_project for update;

  if target_supersedes is not null then
    select * into previous_configuration from public.technical_configurations
    where id = target_supersedes and project_id = target_project;
    if previous_configuration.id is null then raise exception 'invalid superseded configuration'; end if;
    next_version := previous_configuration.version + 1;
  else
    select coalesce(max(version), 0) + 1 into next_version
    from public.technical_configurations where project_id = target_project;
  end if;

  insert into public.technical_configurations(
    project_id, version, supersedes_id, pv_capacity_kwp, module_count,
    module_manufacturer, module_model, module_power_wp, inverter_manufacturer,
    inverter_model, inverter_count, orientation_deg, tilt_deg, production_source,
    system_losses_pct, degradation_pct_per_year, external_engine_reference,
    evidence_id, provenance, created_by
  ) values (
    target_project, next_version, target_supersedes,
    nullif(configuration->>'pvCapacityKwp','')::numeric,
    nullif(configuration->>'moduleCount','')::integer,
    nullif(configuration->>'moduleManufacturer',''), nullif(configuration->>'moduleModel',''),
    nullif(configuration->>'modulePowerWp','')::numeric,
    nullif(configuration->>'inverterManufacturer',''), nullif(configuration->>'inverterModel',''),
    nullif(configuration->>'inverterCount','')::integer,
    nullif(configuration->>'orientationDeg','')::numeric,
    nullif(configuration->>'tiltDeg','')::numeric,
    nullif(configuration->>'productionSource',''),
    nullif(configuration->>'systemLossesPct','')::numeric,
    nullif(configuration->>'degradationPctPerYear','')::numeric,
    nullif(configuration->>'externalEngineReference',''),
    nullif(configuration->>'evidenceId','')::uuid,
    coalesce(configuration->'provenance', '{}'::jsonb), auth.uid()
  ) returning id into next_id;

  return next_id;
end;
$$;

create function public.append_external_engine_result(
  target_project uuid,
  result_payload jsonb,
  target_scenario uuid default null,
  target_technical_configuration uuid default null,
  target_supersedes uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare next_id uuid;
declare next_version integer;
declare previous_result public.external_engine_results;
declare next_kind public.engine_result_kind;
declare create_as_validated boolean;
begin
  if not public.can_write_project(target_project) then raise exception 'not authorized'; end if;
  perform 1 from public.projects where id = target_project for update;
  next_kind := (result_payload->>'resultKind')::public.engine_result_kind;
  create_as_validated := next_kind in ('P50','P90');

  if create_as_validated and not public.has_project_role(
    target_project, array['ADMIN','SOLARSHIFT','EXPERT']::public.solarshift_role[]
  ) then
    raise exception 'P50/P90 creation requires an authorized validator';
  end if;
  if create_as_validated and nullif(result_payload->>'evidenceId','') is null then
    raise exception 'P50/P90 require Evidence';
  end if;
  if create_as_validated and nullif(result_payload->>'valueNumeric','') is null then
    raise exception 'P50/P90 require a numeric production value';
  end if;

  if target_supersedes is not null then
    select * into previous_result from public.external_engine_results
    where id = target_supersedes and project_id = target_project;
    if previous_result.id is null then raise exception 'invalid superseded external result'; end if;
    next_version := previous_result.version + 1;
  else
    select coalesce(max(version), 0) + 1 into next_version
    from public.external_engine_results
    where project_id = target_project
      and result_kind = next_kind
      and lower(source_engine) = lower(result_payload->>'sourceEngine')
      and source_reference = result_payload->>'sourceReference';
  end if;

  insert into public.external_engine_results(
    project_id, scenario_id, technical_configuration_id, source_engine,
    source_reference, result_kind, value_numeric, value_json, unit, methodology,
    evidence_id, quality_level, validation_status, provenance, version,
    supersedes_id, validated_by, validated_at, created_by
  ) values (
    target_project, target_scenario, target_technical_configuration,
    result_payload->>'sourceEngine', result_payload->>'sourceReference', next_kind,
    nullif(result_payload->>'valueNumeric','')::numeric, result_payload->'valueJson',
    result_payload->>'unit', nullif(result_payload->>'methodology',''),
    nullif(result_payload->>'evidenceId','')::uuid,
    (result_payload->>'qualityLevel')::public.calculation_quality_level,
    case when create_as_validated then 'VALIDATED'::public.validation_state else 'UNKNOWN'::public.validation_state end,
    coalesce(result_payload->'provenance', '{}'::jsonb), next_version,
    target_supersedes,
    case when create_as_validated then auth.uid() else null end,
    case when create_as_validated then now() else null end,
    auth.uid()
  ) returning id into next_id;

  if create_as_validated then
    insert into public.validations(
      project_id, entity_type, entity_id, previous_status, new_status, validated_by, comment
    ) values (
      target_project, 'EXTERNAL_ENGINE_RESULT', next_id,
      null, 'VALIDATED', auth.uid(), 'Validated P50/P90 external engineering result created'
    );
  end if;

  return next_id;
end;
$$;

create function public.validate_external_engine_result(
  target_result uuid,
  validation_comment text default null
) returns void language plpgsql security definer set search_path = public as $$
declare result_record public.external_engine_results;
begin
  select * into result_record from public.external_engine_results
  where id = target_result for update;

  if result_record.id is null or not public.has_project_role(
    result_record.project_id, array['ADMIN','SOLARSHIFT','EXPERT']::public.solarshift_role[]
  ) then
    raise exception 'not authorized';
  end if;
  if result_record.validation_status = 'VALIDATED' then
    raise exception 'external result is already validated';
  end if;
  if result_record.result_kind in ('P50','P90') and result_record.evidence_id is null then
    raise exception 'P50/P90 require Evidence before validation';
  end if;

  update public.external_engine_results
  set validation_status = 'VALIDATED', validated_by = auth.uid(), validated_at = now()
  where id = result_record.id;

  insert into public.validations(
    project_id, entity_type, entity_id, previous_status, new_status, validated_by, comment
  ) values (
    result_record.project_id, 'EXTERNAL_ENGINE_RESULT', result_record.id,
    result_record.validation_status::text, 'VALIDATED', auth.uid(), validation_comment
  );
end;
$$;

-- A run selected manually for a simulation must be the run of that simulation.
create or replace function public.update_working_simulation(
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
    select 1 from public.technical_configurations c
    where c.id = target_technical_configuration and c.project_id = sim.project_id
  ) then raise exception 'technical configuration does not belong to simulation project'; end if;
  if target_calculation_run is not null and not exists (
    select 1 from public.calculation_runs r
    where r.id = target_calculation_run
      and r.project_id = sim.project_id
      and r.simulation_session_id = sim.id
  ) then raise exception 'calculation run does not belong to this simulation'; end if;

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
