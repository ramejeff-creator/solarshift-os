-- CR-002 phases 2.1-2.3 live acceptance recipe.
-- Run as the Supabase database owner. Every fixture is rolled back.
begin;

create temporary table cr002_acceptance_results (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;
alter table cr002_acceptance_results enable row level security;
create policy cr002_acceptance_authenticated
  on cr002_acceptance_results for all to authenticated
  using (true) with check (true);
grant select, insert on cr002_acceptance_results to authenticated;

do $$
declare
  target_project uuid;
  worker_user uuid;
  investor_user uuid;
begin
  select g.project_id, g.user_id, candidate.id
  into target_project, worker_user, investor_user
  from public.project_access_grants g
  join public.projects project_record on project_record.id = g.project_id
  cross join lateral (
    select p.id
    from public.profiles p
    where p.id <> g.user_id
      and not exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = project_record.organization_id
          and membership.user_id = p.id
          and membership.role <> 'INVESTOR'
      )
      and not exists (
        select 1
        from public.project_access_grants existing_grant
        where existing_grant.project_id = g.project_id
          and existing_grant.user_id = p.id
          and existing_grant.role <> 'INVESTOR'
      )
    order by p.id
    limit 1
  ) candidate
  where g.role in ('ADMIN','SOLARSHIFT')
  order by g.created_at, candidate.id
  limit 1;

  if target_project is null then
    raise exception 'live acceptance requires an ADMIN or SOLARSHIFT project grant and a profile without internal access to that project';
  end if;

  insert into public.project_access_grants(project_id, user_id, role)
  values (target_project, investor_user, 'INVESTOR')
  on conflict do nothing;

  perform set_config('cr002.project_id', target_project::text, true);
  perform set_config('cr002.worker_user', worker_user::text, true);
  perform set_config('cr002.investor_user', investor_user::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('cr002.worker_user'), true);
select set_config(
  'cr002.simulation_id',
  public.create_working_simulation(
    current_setting('cr002.project_id')::uuid,
    'CR-002 live acceptance',
    90
  )::text,
  true
);

do $$
declare next_revision integer;
begin
  select public.update_working_simulation(
    current_setting('cr002.simulation_id')::uuid,
    1,
    'CR-002 live acceptance updated',
    '{"commercial_preanalysis":true}'::jsonb,
    '{"production_source":"PVGIS"}'::jsonb,
    null,
    null
  ) into next_revision;
  insert into cr002_acceptance_results values (
    'working simulation is editable and versioned',
    next_revision = 2,
    'revision=' || next_revision
  );
end;
$$;

select set_config(
  'cr002.scenario_id',
  public.freeze_simulation_to_scenario(
    current_setting('cr002.simulation_id')::uuid,
    'CR-002 live acceptance scenario',
    'CONFIGURATION'
  )::text,
  true
);

insert into cr002_acceptance_results
select
  'FREEZE creates a DRAFT scenario without overwriting the simulation',
  sim.status = 'PROMOTED' and scenario.status = 'DRAFT'
    and scenario.source_simulation_id = sim.id,
  'simulation=' || sim.status || ', scenario=' || scenario.status
from public.simulation_sessions sim
join public.scenarios scenario on scenario.id = current_setting('cr002.scenario_id')::uuid
where sim.id = current_setting('cr002.simulation_id')::uuid;

select set_config(
  'cr002.parameter_id',
  public.append_project_parameter(
    current_setting('cr002.project_id')::uuid,
    'C03',
    100000,
    null,
    null,
    null,
    null,
    'kWh/year',
    'LIVE_ACCEPTANCE',
    'L5',
    'VALIDATED',
    'CR-002 rollback-only acceptance evidence'
  )::text,
  true
);

reset role;

do $$
declare evidence_uuid uuid;
begin
  insert into public.evidences(
    project_id, parameter_id, extracted_value, extraction_method, confidence
  ) values (
    current_setting('cr002.project_id')::uuid,
    current_setting('cr002.parameter_id')::uuid,
    '{"acceptance_test":true}'::jsonb,
    'LIVE_ACCEPTANCE',
    1
  ) returning id into evidence_uuid;
  perform set_config('cr002.evidence_id', evidence_uuid::text, true);
end;
$$;

insert into public.calculation_runs(
  project_id, scenario_id, engine_version, financial_model_version,
  status, quality_level, input_snapshot, input_snapshot_hash,
  assumptions_snapshot, completed_at,
  created_by
) values (
  current_setting('cr002.project_id')::uuid,
  current_setting('cr002.scenario_id')::uuid,
  'LIVE-ACCEPTANCE',
  'LIVE-ACCEPTANCE',
  'SUCCEEDED',
  'Q1',
  '{"commercial_preanalysis":true,"p50_p90":null}'::jsonb,
  encode(digest('cr002-live-acceptance', 'sha256'), 'hex'),
  '{"production_source":"PVGIS"}'::jsonb,
  now(),
  current_setting('cr002.worker_user')::uuid
);

update public.scenarios
set status = 'CALCULATED'
where id = current_setting('cr002.scenario_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('cr002.worker_user'), true);

do $$
begin
  perform public.validate_scenario(
    current_setting('cr002.scenario_id')::uuid,
    'must fail without P50/P90'
  );
  insert into cr002_acceptance_results values (
    'CALCULATED remains usable without P50/P90 but cannot be VALIDATED',
    false,
    'validation unexpectedly succeeded'
  );
exception when others then
  insert into cr002_acceptance_results values (
    'CALCULATED remains usable without P50/P90 but cannot be VALIDATED',
    sqlerrm like '%requires current Evidence-backed P50 and P90%',
    sqlerrm
  );
end;
$$;

select public.append_external_engine_result(
  current_setting('cr002.project_id')::uuid,
  jsonb_build_object(
    'resultKind', 'P50',
    'sourceEngine', 'EXTERNAL_STUDY',
    'sourceReference', 'CR002-LIVE-ACCEPTANCE',
    'valueNumeric', '100000',
    'unit', 'kWh/year',
    'methodology', 'PROBABILISTIC_YIELD_STUDY',
    'evidenceId', current_setting('cr002.evidence_id'),
    'qualityLevel', 'Q4',
    'provenance', jsonb_build_object('test', 'rollback-only')
  ),
  current_setting('cr002.scenario_id')::uuid,
  null,
  null
);

select public.append_external_engine_result(
  current_setting('cr002.project_id')::uuid,
  jsonb_build_object(
    'resultKind', 'P90',
    'sourceEngine', 'EXTERNAL_STUDY',
    'sourceReference', 'CR002-LIVE-ACCEPTANCE',
    'valueNumeric', '90000',
    'unit', 'kWh/year',
    'methodology', 'PROBABILISTIC_YIELD_STUDY',
    'evidenceId', current_setting('cr002.evidence_id'),
    'qualityLevel', 'Q4',
    'provenance', jsonb_build_object('test', 'rollback-only')
  ),
  current_setting('cr002.scenario_id')::uuid,
  null,
  null
);

select public.validate_scenario(
  current_setting('cr002.scenario_id')::uuid,
  'CR-002 live acceptance validation'
);

insert into cr002_acceptance_results
select
  'Evidence-backed P50/P90 allow VALIDATED',
  status = 'VALIDATED',
  'status=' || status
from public.scenarios
where id = current_setting('cr002.scenario_id')::uuid;

reset role;

do $$
begin
  update public.scenarios
  set name = 'forbidden mutation'
  where id = current_setting('cr002.scenario_id')::uuid;
  insert into cr002_acceptance_results values (
    'validated scenario content is immutable', false, 'mutation unexpectedly succeeded'
  );
exception when others then
  insert into cr002_acceptance_results values (
    'validated scenario content is immutable',
    sqlerrm like '%immutable%',
    sqlerrm
  );
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('cr002.worker_user'), true);
select public.publish_scenario(
  current_setting('cr002.scenario_id')::uuid,
  array[current_setting('cr002.investor_user')::uuid],
  'CR-002 live acceptance publication'
);

select set_config('request.jwt.claim.sub', current_setting('cr002.investor_user'), true);

do $$
declare simulation_count integer;
declare scenario_count integer;
begin
  select count(*) into simulation_count
  from public.simulation_sessions
  where id = current_setting('cr002.simulation_id')::uuid;

  select count(*) into scenario_count
  from public.scenarios
  where id = current_setting('cr002.scenario_id')::uuid;

  insert into cr002_acceptance_results values (
    'investor sees only the explicitly published scenario, never the simulation',
    simulation_count = 0 and scenario_count = 1,
    'simulation_count=' || simulation_count || ', scenario_count=' || scenario_count
  );
exception when others then
  insert into cr002_acceptance_results values (
    'investor sees only the explicitly published scenario, never the simulation',
    false,
    sqlerrm
  );
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('cr002.worker_user'), true);
select public.revoke_scenario_publication(
  current_setting('cr002.scenario_id')::uuid,
  'CR-002 live acceptance revocation'
);

select set_config('request.jwt.claim.sub', current_setting('cr002.investor_user'), true);
insert into cr002_acceptance_results
select
  'revocation immediately removes investor visibility',
  count(*) = 0,
  'visible_scenarios_after_revocation=' || count(*)
from public.scenarios
where id = current_setting('cr002.scenario_id')::uuid;

reset role;

insert into cr002_acceptance_results
select
  'publication and revocation are audited',
  count(*) filter (where action = 'PUBLISHED_FOR_INVESTORS') = 1
    and count(*) filter (where action = 'INVESTOR_PUBLICATION_REVOKED') = 1,
  'publish_events=' || count(*) filter (where action = 'PUBLISHED_FOR_INVESTORS')
    || ', revoke_events=' || count(*) filter (where action = 'INVESTOR_PUBLICATION_REVOKED')
from public.audit_log
where entity_id = current_setting('cr002.scenario_id')::uuid;

select check_name, passed, detail
from cr002_acceptance_results
order by check_name;

rollback;
