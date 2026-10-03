-- Batch 1 event-control repair: idempotent timer start and sequential phases.
-- No tables, policies, assignments, mission data, or submissions are changed.

create or replace function public.advance_event_phase(p_phase int, p_content text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_phase int;
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'forbidden';
  end if;

  select phase into v_phase from mission_state where id = 1 for update;
  if not found then
    raise exception 'mission state is not initialized';
  end if;
  if p_phase <> v_phase + 1 or p_phase < 1 or p_phase > 6 then
    raise exception 'only the next mission phase can be opened';
  end if;

  update mission_state set phase = p_phase where id = 1;
  insert into transmissions(type, content) values ('COMMAND', left(p_content, 1000));
end
$$;
revoke all on function public.advance_event_phase(int, text) from public, anon;
grant execute on function public.advance_event_phase(int, text) to authenticated;

create or replace function public.timer_action(a text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_state mission_state%rowtype;
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'forbidden';
  end if;

  select * into v_state from mission_state where id = 1 for update;
  if not found then
    raise exception 'mission state is not initialized';
  end if;

  if a = 'start' then
    if not v_state.timer_running then
      update mission_state
      set timer_running = true, timer_end = now() + timer_left * interval '1 second'
      where id = 1;
    end if;
  elsif a = 'pause' then
    if v_state.timer_running then
      update mission_state
      set timer_left = greatest(0, extract(epoch from v_state.timer_end - now())::int),
          timer_running = false, timer_end = null
      where id = 1;
    end if;
  elsif a = 'add' then
    update mission_state
    set timer_left = timer_left + 300,
        timer_end = case when timer_running then timer_end + interval '5 min' end
    where id = 1;
  else
    raise exception 'invalid timer action';
  end if;
end
$$;

create or replace function public.guard_event_changes()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'mission_state' and current_organizer_role() = 'ADMIN'
     and (new.phase < old.phase or (old.phase > 0 and not new.warned and old.warned)) then
    raise exception 'forbidden';
  end if;

  if tg_table_name = 'mission_state' and new.phase is distinct from old.phase
     and new.phase <> old.phase + 1
     and not (new.phase = 0 and current_organizer_role() = 'SUPER_ADMIN') then
    raise exception 'only the next mission phase can be opened';
  end if;
  if tg_table_name = 'mission_state' and new.phase is distinct from old.phase then
    new.updated_at := now();
  end if;

  if tg_table_name = 'teams' and new.mission_id is distinct from old.mission_id
     and exists(select 1 from mission_state where id = 1 and phase > 0) then
    if old.mission_id is not null or new.mission_id is null then
      raise exception 'mission assignment is locked';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists guard_event_state_update on public.mission_state;
create trigger guard_event_state_update before update on public.mission_state
  for each row execute function public.guard_event_changes();
drop trigger if exists guard_team_mission_update on public.teams;
create trigger guard_team_mission_update before update on public.teams
  for each row execute function public.guard_event_changes();

revoke all on function public.timer_action(text) from public, anon;
grant execute on function public.timer_action(text) to authenticated;
create or replace function public.get_mission(p_team text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s mission_state%rowtype;
  t teams%rowtype;
  m missions%rowtype;
begin
  select * into t from teams where team_id = upper(trim(p_team));
  if not found or t.mission_id is null then return null; end if;
  select * into m from missions where id = t.mission_id;
  select * into s from mission_state where id = 1;
  return json_build_object(
    'now', now(), 'phase', s.phase, 'phase_updated_at', s.updated_at,
    'warned', s.warned, 'timer_running', s.timer_running,
    'timer_end', s.timer_end, 'timer_left', s.timer_left,
    'submitted', exists(select 1 from submissions where team_id = t.team_id),
    'briefing', case when s.phase >= 1 then m.briefing end,
    'objective', case when s.phase >= 1 then m.objective end,
    'data', case when s.phase >= 2 then m.initial_data end,
    'constraints', case when s.phase >= 2 then m.constraints end,
    'challenge', case when s.phase >= 3 then m.challenge_update end,
    'adaptation', case when s.phase >= 4 then m.adaptation_objective end
  );
end
$$;

do $$
begin
  if not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guard_event_changes' and p.prorettype = 'trigger'::regtype
  ) then
    raise exception 'Expected the existing public.guard_event_changes() trigger function.';
  end if;
end
$$;

notify pgrst, 'reload schema';
