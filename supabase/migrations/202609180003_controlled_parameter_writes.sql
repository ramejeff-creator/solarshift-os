-- SolarShift OS — Phase 2: append-only parameter writes and audit.

alter type public.validation_state add value if not exists 'PROVISIONAL';
alter type public.validation_state add value if not exists 'OVERRIDDEN';

create function public.can_write_project(target_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m join public.projects p on p.organization_id = m.organization_id
    where p.id = target_project and m.user_id = auth.uid()
      and m.role in ('ADMIN','SOLARSHIFT','MANDATAIRE','EXPERT')
  ) or exists (
    select 1 from public.project_access_grants g
    where g.project_id = target_project and g.user_id = auth.uid()
      and g.role in ('ADMIN','SOLARSHIFT','MANDATAIRE','EXPERT')
  );
$$;

create function public.append_project_parameter(
  target_project uuid, target_code text, numeric_value numeric, text_value text,
  boolean_value boolean, date_value date, p_json_value jsonb, value_unit text,
  source_kind text, certainty_level text, next_validation public.validation_state,
  change_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare previous_parameter public.project_parameters; next_id uuid; next_version integer;
begin
  if not public.can_write_project(target_project) then raise exception 'not authorized'; end if;
  select * into previous_parameter from public.project_parameters
    where project_id = target_project and parameter_code = target_code order by version desc limit 1;
  next_version := coalesce(previous_parameter.version, 0) + 1;
  insert into public.project_parameters(project_id, parameter_code, value_numeric, value_text, value_boolean, value_date, value_json, unit, source_type, confidence_level, validation_status, version, supersedes_id, created_by)
  values(target_project, target_code, numeric_value, text_value, boolean_value, date_value, p_json_value, value_unit, source_kind, certainty_level, next_validation, next_version, previous_parameter.id, auth.uid()) returning id into next_id;
  insert into public.audit_log(project_id, entity_type, entity_id, action, old_value, new_value, reason, user_id)
  values(target_project, 'PROJECT_PARAMETER', next_id, 'VERSION_APPENDED', to_jsonb(previous_parameter), (select to_jsonb(p) from public.project_parameters p where p.id = next_id), change_reason, auth.uid());
  return next_id;
end;
$$;
create function public.validate_project_parameter(target_parameter uuid, resulting_state public.validation_state, validation_comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare current_parameter public.project_parameters; next_id uuid;
begin
  select * into current_parameter from public.project_parameters where id = target_parameter;
  if current_parameter.id is null or not public.can_write_project(current_parameter.project_id) then raise exception 'not authorized'; end if;
  next_id := public.append_project_parameter(current_parameter.project_id, current_parameter.parameter_code, current_parameter.value_numeric, current_parameter.value_text, current_parameter.value_boolean, current_parameter.value_date, current_parameter.value_json, current_parameter.unit, current_parameter.source_type, current_parameter.confidence_level, resulting_state, validation_comment);
  insert into public.validations(project_id, entity_type, entity_id, previous_status, new_status, validated_by, comment)
  values(current_parameter.project_id, 'PROJECT_PARAMETER', next_id, current_parameter.validation_status::text, resulting_state::text, auth.uid(), validation_comment);
  return next_id;
end;
$$;
