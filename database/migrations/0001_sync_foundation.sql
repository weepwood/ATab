begin;

create extension if not exists pgcrypto;

create table if not exists public.sync_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  platform text not null default 'unknown' check (char_length(platform) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists sync_devices_user_id_idx
  on public.sync_devices (user_id, created_at desc);

create table if not exists public.sync_entities (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('session', 'cloud-bookmark', 'setting')),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  version bigint not null check (version >= 1),
  payload jsonb,
  deleted boolean not null default false,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  updated_by_device uuid not null references public.sync_devices(id),
  primary key (user_id, entity_type, entity_id),
  check ((deleted and payload is null) or (not deleted and payload is not null)),
  check (payload is null or pg_column_size(payload) <= 262144)
);

create index if not exists sync_entities_user_updated_idx
  on public.sync_entities (user_id, updated_at desc);

create table if not exists public.sync_change_log (
  sequence bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  change_id uuid not null,
  device_id uuid not null references public.sync_devices(id),
  entity_type text not null check (entity_type in ('session', 'cloud-bookmark', 'setting')),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  base_version bigint not null check (base_version >= 0),
  version bigint not null check (version >= 1),
  operation text not null check (operation in ('upsert', 'delete')),
  payload jsonb,
  client_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, change_id),
  check ((operation = 'delete' and payload is null) or (operation = 'upsert' and payload is not null)),
  check (payload is null or pg_column_size(payload) <= 262144)
);

create index if not exists sync_change_log_user_sequence_idx
  on public.sync_change_log (user_id, sequence);

alter table public.sync_devices enable row level security;
alter table public.sync_entities enable row level security;
alter table public.sync_change_log enable row level security;

create policy "sync_devices_select_own"
  on public.sync_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "sync_entities_select_own"
  on public.sync_entities
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "sync_change_log_select_own"
  on public.sync_change_log
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.sync_devices from anon, authenticated;
revoke all on public.sync_entities from anon, authenticated;
revoke all on public.sync_change_log from anon, authenticated;

grant select on public.sync_devices to authenticated;
grant select on public.sync_entities to authenticated;
grant select on public.sync_change_log to authenticated;

create or replace function public.register_sync_device(
  p_device_id uuid,
  p_name text,
  p_platform text default 'unknown'
)
returns public.sync_devices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_device public.sync_devices;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_device_id is null then
    raise exception 'DEVICE_ID_REQUIRED' using errcode = '22023';
  end if;
  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'INVALID_DEVICE_NAME' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_platform, 'unknown'))) not between 1 and 60 then
    raise exception 'INVALID_DEVICE_PLATFORM' using errcode = '22023';
  end if;

  insert into public.sync_devices (id, user_id, name, platform)
  values (p_device_id, v_user_id, trim(p_name), trim(coalesce(p_platform, 'unknown')))
  on conflict (id) do update
    set name = excluded.name,
        platform = excluded.platform,
        updated_at = now(),
        last_seen_at = now()
    where sync_devices.user_id = v_user_id
      and sync_devices.revoked_at is null
  returning * into v_device;

  if v_device.id is null then
    raise exception 'DEVICE_UNAVAILABLE' using errcode = '42501';
  end if;

  return v_device;
end;
$$;

create or replace function public.revoke_sync_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  update public.sync_devices
  set revoked_at = coalesce(revoked_at, now()),
      updated_at = now()
  where id = p_device_id
    and user_id = v_user_id;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function public.apply_sync_changes(
  p_device_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_change jsonb;
  v_change_id uuid;
  v_entity_type text;
  v_entity_id text;
  v_base_version bigint;
  v_operation text;
  v_payload jsonb;
  v_client_updated_at timestamptz;
  v_entity public.sync_entities;
  v_entity_found boolean;
  v_existing_log public.sync_change_log;
  v_current_version bigint;
  v_new_version bigint;
  v_sequence bigint;
  v_snapshot jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.sync_devices
  where id = p_device_id
    and user_id = v_user_id
    and revoked_at is null;
  if not found then
    raise exception 'DEVICE_NOT_ACTIVE' using errcode = '42501';
  end if;

  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'CHANGES_MUST_BE_ARRAY' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 100 then
    raise exception 'TOO_MANY_CHANGES' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_change_id := (v_change ->> 'changeId')::uuid;
    v_entity_type := v_change ->> 'entityType';
    v_entity_id := trim(v_change ->> 'entityId');
    v_base_version := (v_change ->> 'baseVersion')::bigint;
    v_operation := v_change ->> 'operation';
    v_payload := v_change -> 'payload';
    v_client_updated_at := (v_change ->> 'clientUpdatedAt')::timestamptz;

    if v_entity_type not in ('session', 'cloud-bookmark', 'setting') then
      raise exception 'INVALID_ENTITY_TYPE' using errcode = '22023';
    end if;
    if char_length(v_entity_id) not between 1 and 160 then
      raise exception 'INVALID_ENTITY_ID' using errcode = '22023';
    end if;
    if v_base_version < 0 then
      raise exception 'INVALID_BASE_VERSION' using errcode = '22023';
    end if;
    if v_operation not in ('upsert', 'delete') then
      raise exception 'INVALID_OPERATION' using errcode = '22023';
    end if;
    if v_operation = 'delete' then
      v_payload := null;
    elsif v_payload is null or jsonb_typeof(v_payload) <> 'object' then
      raise exception 'INVALID_PAYLOAD' using errcode = '22023';
    elsif pg_column_size(v_payload) > 262144 then
      raise exception 'PAYLOAD_TOO_LARGE' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':change:' || v_change_id::text, 0));

    select * into v_existing_log
    from public.sync_change_log
    where user_id = v_user_id
      and change_id = v_change_id;

    if found then
      select * into v_entity
      from public.sync_entities
      where user_id = v_user_id
        and entity_type = v_existing_log.entity_type
        and entity_id = v_existing_log.entity_id;

      v_snapshot := case when found then jsonb_build_object(
        'entityType', v_entity.entity_type,
        'entityId', v_entity.entity_id,
        'version', v_entity.version,
        'payload', v_entity.payload,
        'deleted', v_entity.deleted,
        'updatedAt', v_entity.updated_at,
        'updatedByDevice', v_entity.updated_by_device
      ) else null end;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'changeId', v_change_id,
        'status', 'duplicate',
        'version', v_existing_log.version,
        'sequence', v_existing_log.sequence,
        'serverEntity', v_snapshot
      ));
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
      v_user_id::text || ':entity:' || v_entity_type || ':' || v_entity_id,
      0
    ));

    select * into v_entity
    from public.sync_entities
    where user_id = v_user_id
      and entity_type = v_entity_type
      and entity_id = v_entity_id
    for update;
    v_entity_found := found;
    v_current_version := case when v_entity_found then v_entity.version else 0 end;

    if v_base_version <> v_current_version then
      v_snapshot := case when v_entity_found then jsonb_build_object(
        'entityType', v_entity.entity_type,
        'entityId', v_entity.entity_id,
        'version', v_entity.version,
        'payload', v_entity.payload,
        'deleted', v_entity.deleted,
        'updatedAt', v_entity.updated_at,
        'updatedByDevice', v_entity.updated_by_device
      ) else null end;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'changeId', v_change_id,
        'status', 'conflict',
        'version', v_current_version,
        'sequence', null,
        'serverEntity', v_snapshot
      ));
      continue;
    end if;

    v_new_version := v_current_version + 1;

    insert into public.sync_entities (
      user_id,
      entity_type,
      entity_id,
      version,
      payload,
      deleted,
      client_updated_at,
      updated_at,
      updated_by_device
    ) values (
      v_user_id,
      v_entity_type,
      v_entity_id,
      v_new_version,
      v_payload,
      v_operation = 'delete',
      v_client_updated_at,
      now(),
      p_device_id
    )
    on conflict (user_id, entity_type, entity_id) do update
      set version = excluded.version,
          payload = excluded.payload,
          deleted = excluded.deleted,
          client_updated_at = excluded.client_updated_at,
          updated_at = now(),
          updated_by_device = excluded.updated_by_device
    returning * into v_entity;

    insert into public.sync_change_log (
      user_id,
      change_id,
      device_id,
      entity_type,
      entity_id,
      base_version,
      version,
      operation,
      payload,
      client_updated_at
    ) values (
      v_user_id,
      v_change_id,
      p_device_id,
      v_entity_type,
      v_entity_id,
      v_base_version,
      v_new_version,
      v_operation,
      v_payload,
      v_client_updated_at
    ) returning sequence into v_sequence;

    update public.sync_devices
    set last_seen_at = now(), updated_at = now()
    where id = p_device_id;

    v_snapshot := jsonb_build_object(
      'entityType', v_entity.entity_type,
      'entityId', v_entity.entity_id,
      'version', v_entity.version,
      'payload', v_entity.payload,
      'deleted', v_entity.deleted,
      'updatedAt', v_entity.updated_at,
      'updatedByDevice', v_entity.updated_by_device
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'changeId', v_change_id,
      'status', 'applied',
      'version', v_new_version,
      'sequence', v_sequence,
      'serverEntity', v_snapshot
    ));
  end loop;

  return jsonb_build_object('results', v_results);
end;
$$;

create or replace function public.pull_sync_changes(
  p_device_id uuid,
  p_after_sequence bigint default 0,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_changes jsonb;
  v_next_sequence bigint;
  v_has_more boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(p_after_sequence, 0) < 0 then
    raise exception 'INVALID_CURSOR' using errcode = '22023';
  end if;

  perform 1
  from public.sync_devices
  where id = p_device_id
    and user_id = v_user_id
    and revoked_at is null;
  if not found then
    raise exception 'DEVICE_NOT_ACTIVE' using errcode = '42501';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'sequence', entry.sequence,
      'entityType', entry.entity_type,
      'entityId', entry.entity_id,
      'version', entry.version,
      'operation', entry.operation,
      'payload', entry.payload,
      'deleted', entry.operation = 'delete',
      'updatedAt', entry.created_at,
      'updatedByDevice', entry.device_id
    ) order by entry.sequence), '[]'::jsonb),
    coalesce(max(entry.sequence), coalesce(p_after_sequence, 0))
  into v_changes, v_next_sequence
  from (
    select *
    from public.sync_change_log
    where user_id = v_user_id
      and sequence > coalesce(p_after_sequence, 0)
    order by sequence
    limit v_limit
  ) entry;

  select exists (
    select 1
    from public.sync_change_log
    where user_id = v_user_id
      and sequence > v_next_sequence
  ) into v_has_more;

  update public.sync_devices
  set last_seen_at = now(), updated_at = now()
  where id = p_device_id;

  return jsonb_build_object(
    'changes', v_changes,
    'nextSequence', v_next_sequence,
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.register_sync_device(uuid, text, text) from public;
revoke all on function public.revoke_sync_device(uuid) from public;
revoke all on function public.apply_sync_changes(uuid, jsonb) from public;
revoke all on function public.pull_sync_changes(uuid, bigint, integer) from public;

grant execute on function public.register_sync_device(uuid, text, text) to authenticated;
grant execute on function public.revoke_sync_device(uuid) to authenticated;
grant execute on function public.apply_sync_changes(uuid, jsonb) to authenticated;
grant execute on function public.pull_sync_changes(uuid, bigint, integer) to authenticated;

commit;
