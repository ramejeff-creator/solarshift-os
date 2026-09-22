begin;

-- Supabase installs pgcrypto in the extensions schema. Security-definer
-- functions deliberately use a restricted search_path, so digest must be
-- schema-qualified for FREEZE to work in the hosted environment.
create or replace function public.freeze_simulation_to_scenario(
  target_simulation uuid,
  scenario_name text,
  target_kind public.scenario_kind default 'CONFIGURATION'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  sim public.simulation_sessions;
  cfg public.technical_configurations;
  next_scenario uuid;
  next_version integer;
  snapshot jsonb;
begin
  select * into sim
  from public.simulation_sessions
  where id = target_simulation
  for update;

  if sim.id is null or not public.can_write_project(sim.project_id) then
    raise exception 'not authorized';
  end if;
  if sim.status <> 'WORKING' then
    raise exception 'only a working simulation can be frozen';
  end if;

  if sim.technical_configuration_id is not null then
    select * into cfg
    from public.technical_configurations
    where id = sim.technical_configuration_id
      and project_id = sim.project_id
    for update;
    if cfg.id is null then
      raise exception 'technical configuration does not belong to simulation project';
    end if;
    update public.technical_configurations
    set is_frozen = true, frozen_at = now()
    where id = cfg.id;
  end if;

  snapshot := jsonb_build_object(
    'simulation_id', sim.id,
    'simulation_revision', sim.revision,
    'working_assumptions', sim.working_assumptions,
    'working_configuration', sim.working_configuration,
    'technical_configuration_id', sim.technical_configuration_id,
    'latest_calculation_run_id', sim.latest_calculation_run_id
  );

  select coalesce(max(version), 0) + 1
  into next_version
  from public.scenarios
  where project_id = sim.project_id and name = scenario_name;

  insert into public.scenarios(
    project_id, scenario_kind, name, generation_method,
    technical_configuration, assumptions, technical_configuration_id,
    source_simulation_id, status, version, created_by
  ) values (
    sim.project_id, target_kind, scenario_name, 'SIMULATION_FREEZE',
    sim.working_configuration, sim.working_assumptions,
    sim.technical_configuration_id, sim.id, 'DRAFT', next_version, auth.uid()
  ) returning id into next_scenario;

  update public.simulation_sessions
  set status = 'PROMOTED',
    frozen_snapshot = snapshot,
    frozen_snapshot_hash = encode(extensions.digest(snapshot::text, 'sha256'), 'hex'),
    frozen_at = now(),
    promoted_scenario_id = next_scenario,
    promoted_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  where id = sim.id;

  insert into public.audit_log(
    project_id, entity_type, entity_id, action, new_value, user_id
  ) values (
    sim.project_id, 'SIMULATION_SESSION', sim.id,
    'FROZEN_TO_DRAFT_SCENARIO',
    jsonb_build_object('scenario_id', next_scenario, 'snapshot', snapshot),
    auth.uid()
  );

  return next_scenario;
end;
$$;

commit;
