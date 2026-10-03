-- Targeted repair for the START MATHVERSE RPC and the server-side team limit.
-- Safe for an existing public.start_mathverse_event() with no arguments.
-- Refuses to create an overload if a parameterized function of that name exists.

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'start_mathverse_event'
      and pg_get_function_identity_arguments(p.oid) <> ''
  ) then
    raise exception 'Found a parameterized public.start_mathverse_event overload; inspect its signature before applying this repair.';
  end if;
end
$$;

create or replace function public.guard_team_capacity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(572018);
    select count(*) into v_count from teams;
    if v_count >= 80 then
      raise exception 'Maximum capacity reached: 80 teams.';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists guard_team_capacity_insert on public.teams;
create trigger guard_team_capacity_insert before insert on public.teams
  for each row execute function public.guard_team_capacity();

create or replace function public.start_mathverse_event()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_total int;
  v_state mission_state%rowtype;
  v_team record;
  v_mission_id int;
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(572018);
  select * into v_state from mission_state where id = 1 for update;
  if not found then
    raise exception 'Mission state is not initialized.';
  end if;

  select count(*) into v_total from teams;
  if v_total > 80 then
    raise exception 'Maximum capacity reached: 80 teams.';
  end if;

  if v_state.phase > 0 then
    return jsonb_build_object(
      'started', true,
      'phase', v_state.phase,
      'team_count', v_total,
      'assigned_count', (select count(*) from teams where mission_id is not null),
      'message', 'Event already started. Existing assignments remain locked.'
    );
  end if;

  if (select count(*) from missions where code in
      ('MARS', 'STORM', 'PARK', 'CITY', 'RACE', 'RESCUE', 'STADIUM', 'MOVIE', 'ISLAND', 'ROBOT')) <> 10 then
    raise exception 'Expected all 10 MATHVERSE missions to be configured.';
  end if;

  for v_team in
    select team_id from teams where mission_id is null order by team_id for update
  loop
    select m.id into v_mission_id
    from missions m
    left join teams t on t.mission_id = m.id
    where m.code in ('MARS', 'STORM', 'PARK', 'CITY', 'RACE', 'RESCUE', 'STADIUM', 'MOVIE', 'ISLAND', 'ROBOT')
    group by m.id
    order by count(t.team_id), case m.code
      when 'MARS' then 1 when 'STORM' then 2 when 'PARK' then 3 when 'CITY' then 4
      when 'RACE' then 5 when 'RESCUE' then 6 when 'STADIUM' then 7 when 'MOVIE' then 8
      when 'ISLAND' then 9 when 'ROBOT' then 10 end
    limit 1;

    update teams set mission_id = v_mission_id
    where team_id = v_team.team_id and mission_id is null;
  end loop;

  update mission_state set phase = 1, warned = false,
    timer_running = true, timer_end = now() + timer_left * interval '1 second'
  where id = 1;
  insert into audit_logs(action, target, details)
    values ('START_MATHVERSE', 'mission_state', 'Started event with ' || v_total || ' teams assigned across 10 missions.');

  return jsonb_build_object(
    'started', true,
    'phase', 1,
    'team_count', v_total,
    'assigned_count', (select count(*) from teams where mission_id is not null),
    'message', 'MATHVERSE started successfully.'
  );
end
$$;

revoke all on function public.start_mathverse_event() from public, anon, authenticated;
grant execute on function public.start_mathverse_event() to authenticated;
notify pgrst, 'reload schema';
