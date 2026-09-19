-- A failed or invalidated run is complete too; only pending/running runs are open.
alter table public.calculation_runs
  drop constraint if exists calculation_runs_check;

alter table public.calculation_runs
  add constraint calculation_runs_completion_check check (
    (status in ('PENDING','RUNNING') and completed_at is null)
    or (status in ('SUCCEEDED','FAILED','INVALIDATED') and completed_at is not null)
  );
