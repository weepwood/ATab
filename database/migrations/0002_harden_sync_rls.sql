begin;

drop policy if exists "sync_devices_select_own" on public.sync_devices;
drop policy if exists "sync_entities_select_own" on public.sync_entities;
drop policy if exists "sync_change_log_select_own" on public.sync_change_log;

create policy "sync_devices_select_own"
  on public.sync_devices
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

create policy "sync_entities_select_own"
  on public.sync_entities
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

create policy "sync_change_log_select_own"
  on public.sync_change_log
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

commit;
