-- Phase 2: team PINs, server-issued student sessions, organizer roles, and least-privilege RLS.
-- Apply after schema.sql. Student-facing RPCs are callable only by the server service role.

create extension if not exists pgcrypto with schema extensions;

alter table organizers add column if not exists role text not null default 'ADMIN'
  check (role in ('SUPER_ADMIN', 'ADMIN', 'JUDGE'));
alter table teams add column if not exists pin_configured boolean not null default false;
alter table audit_logs add column if not exists role text;
alter table audit_logs add column if not exists target text;
update audit_logs set role = 'ADMIN' where role is null;
alter table audit_logs alter column role set default 'ADMIN';

create table if not exists student_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references teams(team_id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen timestamptz not null default now()
);
create index if not exists student_sessions_expiry_idx on student_sessions(expires_at);
alter table student_sessions enable row level security;
revoke all on student_sessions from public, anon, authenticated;
grant all on student_sessions to service_role;
create table if not exists team_credentials (
  team_id text primary key references teams(team_id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
alter table team_credentials enable row level security;
revoke all on team_credentials from public, anon, authenticated;
grant all on team_credentials to service_role;
create table if not exists student_auth_failures (
  attempt_key text primary key,
  attempts int not null default 0,
  window_started timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table student_auth_failures enable row level security;
revoke all on student_auth_failures from public, anon, authenticated;
grant all on student_auth_failures to service_role;

create or replace view team_monitor with (security_invoker=on) as
  select t.team_id,t.team_name,t.mission_id,m.code mission_code,
    coalesce(t.last_seen>now()-interval '75 seconds',false) online,
    (s.team_id is not null) submitted,s.submitted_at,t.pin_configured has_pin
  from teams t left join missions m on m.id=t.mission_id
  left join submissions s on s.team_id=t.team_id;

create or replace function current_organizer_role()
returns text language sql security definer stable set search_path = public, pg_temp as $$
  select role from organizers where user_id = auth.uid()
$$;

create or replace function is_organizer()
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select current_organizer_role() is not null
$$;

revoke all on function current_organizer_role() from public, anon;
revoke all on function is_organizer() from public, anon;
grant execute on function current_organizer_role() to authenticated;
grant execute on function is_organizer() to authenticated, service_role;

-- Existing organizer logins remain ADMIN until a SUPER_ADMIN promotes the owner.
-- Use the documented one-time SQL promotion after applying this migration.

create or replace function audit_identity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.user_id := auth.uid();
  new.role := coalesce(current_organizer_role(), 'SYSTEM');
  new.actor := coalesce(auth.jwt() ->> 'email', 'SYSTEM');
  new.created_at := now();
  return new;
end
$$;
drop trigger if exists audit_identity_before_insert on audit_logs;
create trigger audit_identity_before_insert before insert on audit_logs
  for each row execute function audit_identity();

create or replace function audit_event_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row jsonb;
  v_target text;
  v_action text;
begin
  if tg_table_name = 'teams' then
    if tg_op = 'UPDATE' then
      if row(new.team_id, new.team_name, new.mission_id)
         is not distinct from row(old.team_id, old.team_name, old.mission_id) then
        return new;
      end if;
    end if;
  end if;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_target := coalesce(v_row ->> 'team_id', v_row ->> 'id', tg_table_name);
  v_action := tg_table_name || '_' || tg_op;
  if tg_table_name = 'teams' then
    v_row := jsonb_build_object('team_id', v_row -> 'team_id', 'team_name', v_row -> 'team_name', 'mission_id', v_row -> 'mission_id');
  end if;
  insert into audit_logs(actor, user_id, role, action, target, details)
  values (coalesce(auth.jwt() ->> 'email', 'SYSTEM'), auth.uid(), coalesce(current_organizer_role(), 'SYSTEM'),
          v_action, v_target, v_row::text);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create or replace function guard_team_capacity()
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

drop trigger if exists guard_team_capacity_insert on teams;
create trigger guard_team_capacity_insert before insert on teams
  for each row execute function guard_team_capacity();

create or replace function start_mathverse_event()
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
revoke all on function start_mathverse_event() from public, anon, authenticated;
grant execute on function start_mathverse_event() to authenticated;

create or replace function auto_assign_late_teams()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_team record;
  v_mission_ids int[];
  v_mission_id int;
  v_assigned int := 0;
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'forbidden';
  end if;
  perform 1 from mission_state where id = 1 and phase > 0 for update;
  if not found then
    raise exception 'Mission assignment has not started yet.';
  end if;

  select array_agg(id order by id) into v_mission_ids from missions;
  if v_mission_ids is null or cardinality(v_mission_ids) = 0 then
    raise exception 'No missions configured.';
  end if;

  for v_team in select team_id from teams where mission_id is null order by team_id for update loop
    select mission_id into v_mission_id
    from (
      select m.id mission_id, count(t.team_id)::int assigned_count
      from missions m
      left join teams t on t.mission_id = m.id
      group by m.id
      order by count(t.team_id)::int asc, m.id asc
      limit 1
    ) s;

    update teams set mission_id = v_mission_id where team_id = v_team.team_id;
    v_assigned := v_assigned + 1;
  end loop;

  insert into audit_logs(action, target, details)
    values ('AUTO_ASSIGN_LATE_TEAMS', 'teams', 'Assigned ' || v_assigned || ' late team(s) to the least-loaded missions.');

  return jsonb_build_object('assigned_count', v_assigned, 'message', 'Late teams assigned as evenly as possible.');
end
$$;
revoke all on function auto_assign_late_teams() from public, anon, authenticated;
grant execute on function auto_assign_late_teams() to authenticated;

create or replace function assign_team_mission(p_team_id text, p_mission_id int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_team text := upper(trim(p_team_id));
  v_row teams%rowtype;
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'forbidden';
  end if;

  if v_team is null or v_team !~ '^MV-[0-9]{3}$' then
    raise exception 'invalid team id';
  end if;
  if p_mission_id is null or not exists(select 1 from missions where id = p_mission_id) then
    raise exception 'invalid mission';
  end if;

  perform 1 from mission_state where id = 1 and phase > 0 for update;
  if not found then
    raise exception 'Mission assignment has not started yet.';
  end if;

  select * into v_row from teams where team_id = v_team for update;
  if not found then
    raise exception 'team not found';
  end if;
  if v_row.mission_id is not null then
    raise exception 'team already assigned a mission';
  end if;

  update teams set mission_id = p_mission_id where team_id = v_team;
  insert into audit_logs(action, target, details)
    values ('TEAM_MISSION_ASSIGN', v_team, 'Assigned to mission ID ' || p_mission_id || '.');

  return jsonb_build_object('team_id', v_team, 'mission_id', p_mission_id, 'assigned', true);
end
$$;
revoke all on function assign_team_mission(text, int) from public, anon, authenticated;
grant execute on function assign_team_mission(text, int) to authenticated;

-- Replace the original broad organizer policies and public student reads.
drop policy if exists org_all on missions;
drop policy if exists org_all on teams;
drop policy if exists org_all on mission_state;
drop policy if exists org_all on submissions;
drop policy if exists org_all on transmissions;
drop policy if exists org_all on broadcasts;
drop policy if exists org_all on audit_logs;
drop policy if exists state_read on mission_state;
drop policy if exists bc_read on broadcasts;
drop policy if exists organizer_self on organizers;
drop policy if exists organizer_super_admin on organizers;
drop policy if exists missions_read_organizers on missions;
drop policy if exists missions_super_admin_write on missions;
drop policy if exists teams_read_admin on teams;
drop policy if exists teams_admin_insert on teams;
drop policy if exists teams_admin_update on teams;
drop policy if exists teams_super_admin_delete on teams;
drop policy if exists state_read_organizers on mission_state;
drop policy if exists state_public_read on mission_state;
drop policy if exists state_write_admin on mission_state;
drop policy if exists submissions_read_judges on submissions;
drop policy if exists submissions_super_admin_write on submissions;
drop policy if exists transmissions_read_organizers on transmissions;
drop policy if exists transmissions_write_admin on transmissions;
drop policy if exists broadcasts_read_organizers on broadcasts;
drop policy if exists broadcasts_public_read on broadcasts;
drop policy if exists broadcasts_write_admin on broadcasts;
drop policy if exists audit_read_super_admin on audit_logs;
drop policy if exists audit_insert_organizers on audit_logs;
drop policy if exists audit_super_admin_update on audit_logs;
drop policy if exists audit_super_admin_delete on audit_logs;

create policy organizer_self on organizers for select to authenticated
  using (user_id = auth.uid() or current_organizer_role() = 'SUPER_ADMIN');
create policy organizer_super_admin on organizers for all to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN')
  with check (current_organizer_role() = 'SUPER_ADMIN');

create policy missions_read_organizers on missions for select to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN', 'JUDGE'));
create policy missions_super_admin_write on missions for all to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN')
  with check (current_organizer_role() = 'SUPER_ADMIN');

create policy teams_read_admin on teams for select to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'));
create policy teams_admin_update on teams for update to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'))
  with check (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'));
create policy teams_super_admin_delete on teams for delete to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN');

create policy state_read_organizers on mission_state for select to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN', 'JUDGE'));
create policy state_public_read on mission_state for select to anon using (true);
create policy state_write_admin on mission_state for update to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'))
  with check (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'));

create policy submissions_read_judges on submissions for select to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'JUDGE'));
create policy submissions_super_admin_write on submissions for all to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN')
  with check (current_organizer_role() = 'SUPER_ADMIN');

create policy transmissions_read_organizers on transmissions for select to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN', 'JUDGE'));
create policy transmissions_write_admin on transmissions for insert to authenticated
  with check (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'));
create policy broadcasts_read_organizers on broadcasts for select to authenticated
  using (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN', 'JUDGE'));
create policy broadcasts_public_read on broadcasts for select to anon using (true);
create policy broadcasts_write_admin on broadcasts for insert to authenticated
  with check (current_organizer_role() in ('SUPER_ADMIN', 'ADMIN'));

create policy audit_read_super_admin on audit_logs for select to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN');
create policy audit_super_admin_update on audit_logs for update to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN')
  with check (current_organizer_role() = 'SUPER_ADMIN');
create policy audit_super_admin_delete on audit_logs for delete to authenticated
  using (current_organizer_role() = 'SUPER_ADMIN');

-- Explicit grants make RLS the only browser path; anonymous clients get no table or RPC access.
revoke all on missions, teams, mission_state, submissions, transmissions, organizers, broadcasts, audit_logs
  from public, anon;
revoke all on all sequences in schema public from public, anon;
revoke all on missions, teams, mission_state, submissions, transmissions, organizers, broadcasts, audit_logs from authenticated;
grant select on missions, teams, mission_state, submissions, transmissions, organizers, broadcasts, audit_logs to authenticated;
grant select on mission_state, broadcasts to anon;
grant insert, update, delete on missions, submissions, organizers to authenticated;
grant update, delete on audit_logs to authenticated;
grant delete on teams to authenticated;
grant update (team_name, mission_id) on teams to authenticated;
grant update on mission_state to authenticated;
grant insert on transmissions, broadcasts to authenticated;
grant all on missions, teams, mission_state, submissions, transmissions, organizers, broadcasts, audit_logs
  to service_role;
revoke all on team_monitor from public, anon, authenticated;
grant all on team_monitor to service_role;
grant usage, select on all sequences in schema public to authenticated;

create or replace function authenticate_team(p_team text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  t teams%rowtype;
  m missions%rowtype;
  v_pin_hash text;
  v_pin_matches boolean;
begin
  if p_team is null or p_pin is null or p_pin !~ '^[0-9]{4,10}$' then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 12));
    return null;
  end if;
  select * into t from teams where team_id = upper(trim(p_team));
  if not found then
    perform extensions.crypt(p_pin, extensions.gen_salt('bf', 12));
    return null;
  end if;
  select pin_hash into v_pin_hash from team_credentials where team_id = t.team_id;
  if not found then
    perform extensions.crypt(p_pin, extensions.gen_salt('bf', 12));
    return null;
  end if;
  v_pin_matches := extensions.crypt(p_pin, v_pin_hash) = v_pin_hash;
  if not coalesce(v_pin_matches, false) or t.mission_id is null then
    return null;
  end if;
  select * into m from missions where id = t.mission_id;
  if not found then return null; end if;
  return jsonb_build_object('team_id', t.team_id, 'team_name', t.team_name,
    'mission', jsonb_build_object('code', m.code, 'title', m.title, 'tagline', m.tagline, 'theme', m.theme));
end
$$;
revoke all on function authenticate_team(text, text) from public, anon, authenticated;
grant execute on function authenticate_team(text, text) to service_role;

create or replace function student_auth_is_limited(p_attempt_key text)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select coalesce((select attempts >= 10 and window_started > now() - interval '15 minutes'
    from student_auth_failures where attempt_key = p_attempt_key), false)
$$;
create or replace function record_student_auth_failure(p_attempt_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into student_auth_failures(attempt_key, attempts) values (p_attempt_key, 1)
  on conflict (attempt_key) do update set
    attempts = case when student_auth_failures.window_started <= now() - interval '15 minutes'
      then 1 else student_auth_failures.attempts + 1 end,
    window_started = case when student_auth_failures.window_started <= now() - interval '15 minutes'
      then now() else student_auth_failures.window_started end,
    updated_at = now();
  delete from student_auth_failures where window_started < now() - interval '1 day';
end
$$;
create or replace function clear_student_auth_failures(p_attempt_key text)
returns void language sql security definer set search_path = public, pg_temp as $$
  delete from student_auth_failures where attempt_key = p_attempt_key
$$;
revoke all on function student_auth_is_limited(text), record_student_auth_failure(text), clear_student_auth_failures(text)
  from public, anon, authenticated;
grant execute on function student_auth_is_limited(text), record_student_auth_failure(text), clear_student_auth_failures(text)
  to service_role;

create or replace function issue_team_pin(p_team_id text, p_team_name text default null)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_pin text;
  v_bytes bytea;
  v_random bigint;
  v_team text := upper(trim(p_team_id));
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then raise exception 'forbidden'; end if;
  if v_team is null or v_team !~ '^MV-[0-9]{3}$' then raise exception 'invalid team id'; end if;
  if p_team_name is not null and exists(select 1 from teams where team_id = v_team) = false and (select count(*) from teams) >= 80 then
    raise exception 'Maximum capacity reached: 80 teams.';
  end if;
  v_bytes := extensions.gen_random_bytes(4);
  v_random := get_byte(v_bytes, 0)::bigint * 16777216 + get_byte(v_bytes, 1)::bigint * 65536
    + get_byte(v_bytes, 2)::bigint * 256 + get_byte(v_bytes, 3)::bigint;
  v_pin := lpad((100000 + (v_random % 900000))::text, 6, '0');
  if p_team_name is not null then
    if trim(p_team_name) = '' then raise exception 'team name required'; end if;
    insert into teams(team_id, team_name, pin_configured) values (v_team, trim(p_team_name), true);
    insert into team_credentials(team_id, pin_hash)
      values (v_team, extensions.crypt(v_pin, extensions.gen_salt('bf', 12)));
  else
    update teams set pin_configured = true where team_id = v_team;
    if not found then raise exception 'team not found'; end if;
    insert into team_credentials(team_id, pin_hash, updated_at)
      values (v_team, extensions.crypt(v_pin, extensions.gen_salt('bf', 12)), now())
      on conflict (team_id) do update set pin_hash = excluded.pin_hash, updated_at = excluded.updated_at;
  end if;
  delete from student_sessions where team_id = v_team;
  insert into audit_logs(action, target, details) values
    (case when p_team_name is null then 'TEAM_PIN_RESET' else 'TEAM_CREATED' end, v_team,
     case when p_team_name is null then 'Team PIN regenerated; existing student sessions revoked.' else 'Team created and initial PIN generated.' end);
  return v_pin;
end
$$;
revoke all on function issue_team_pin(text, text) from public, anon;
grant execute on function issue_team_pin(text, text) to authenticated;

create or replace function list_organizers()
returns table(user_id uuid, email text, role text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_organizer_role() is distinct from 'SUPER_ADMIN' then raise exception 'forbidden'; end if;
  return query select o.user_id, u.email::text, o.role from organizers o join auth.users u on u.id = o.user_id order by u.email;
end
$$;
revoke all on function list_organizers() from public, anon;
grant execute on function list_organizers() to authenticated;

create or replace function manage_organizer(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_email text := lower(trim(p_email));
begin
  if current_organizer_role() is distinct from 'SUPER_ADMIN' then raise exception 'forbidden'; end if;
  if p_role not in ('SUPER_ADMIN', 'ADMIN', 'JUDGE') then raise exception 'invalid role'; end if;
  select id into v_user_id from auth.users where lower(email) = v_email;
  if v_user_id is null then raise exception 'auth user not found'; end if;
  insert into organizers(user_id, role) values (v_user_id, p_role)
    on conflict (user_id) do update set role = excluded.role;
  insert into audit_logs(action, target, details) values ('ORGANIZER_ROLE_SET', v_email, 'Role set to ' || p_role);
end
$$;
revoke all on function manage_organizer(text, text) from public, anon;
grant execute on function manage_organizer(text, text) to authenticated;

create or replace function audit_submission_export(p_record_count int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_organizer_role() is distinct from 'SUPER_ADMIN' then raise exception 'forbidden'; end if;
  insert into audit_logs(action, target, details)
    values ('EXPORT_SUBMISSIONS', 'submissions', greatest(0, p_record_count)::text || ' records');
end
$$;
revoke all on function audit_submission_export(int) from public, anon;
grant execute on function audit_submission_export(int) to authenticated;

create or replace function advance_event_phase(p_phase int, p_content text)
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
revoke all on function advance_event_phase(int, text) from public, anon;
grant execute on function advance_event_phase(int, text) to authenticated;

create or replace function timer_action(a text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_state mission_state%rowtype;
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then raise exception 'forbidden'; end if;
  select * into v_state from mission_state where id = 1 for update;
  if not found then raise exception 'mission state is not initialized'; end if;
  if a = 'start' then
    if not v_state.timer_running then
      update mission_state set timer_running = true, timer_end = now() + timer_left * interval '1 second' where id = 1;
    end if;
  elsif a = 'pause' then
    if v_state.timer_running then
      update mission_state set timer_left = greatest(0, extract(epoch from v_state.timer_end - now())::int), timer_running = false, timer_end = null where id = 1;
    end if;
  elsif a = 'add' then
    update mission_state set timer_left = timer_left + 300,
      timer_end = case when timer_running then timer_end + interval '5 min' end where id = 1;
  else
    raise exception 'invalid timer action';
  end if;
end
$$;
create or replace function set_timer(p_seconds int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then raise exception 'forbidden'; end if;
  update mission_state set timer_left = greatest(0, p_seconds), timer_running = false, timer_end = null where id = 1;
end
$$;
create or replace function adjust_timer(p_delta int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then raise exception 'forbidden'; end if;
  update mission_state set timer_end = case when timer_running then timer_end + p_delta * interval '1 second' end,
    timer_left = case when timer_running then timer_left else greatest(0, timer_left + p_delta) end where id = 1;
end
$$;
revoke all on function timer_action(text), set_timer(int), adjust_timer(int) from public, anon;
grant execute on function timer_action(text), set_timer(int), adjust_timer(int) to authenticated;

create or replace function get_team_monitor()
returns table(team_id text, team_name text, mission_id int, mission_code text,
  online boolean, submitted boolean, submitted_at timestamptz, has_pin boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_organizer_role() is null or current_organizer_role() not in ('SUPER_ADMIN', 'ADMIN') then raise exception 'forbidden'; end if;
  return query select t.team_id,t.team_name,t.mission_id,m.code,
    coalesce(t.last_seen > now() - interval '75 seconds', false),
    (s.team_id is not null),s.submitted_at,t.pin_configured
  from teams t left join missions m on m.id=t.mission_id
  left join submissions s on s.team_id=t.team_id order by t.team_id;
end
$$;
revoke all on function get_team_monitor() from public, anon;
grant execute on function get_team_monitor() to authenticated;

create or replace function guard_event_changes()
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

drop trigger if exists guard_event_state_update on mission_state;
create trigger guard_event_state_update before update on mission_state
  for each row execute function guard_event_changes();
drop trigger if exists guard_team_mission_update on teams;
create trigger guard_team_mission_update before update on teams
  for each row execute function guard_event_changes();

-- Preserve Phase 1 RPC behavior only for trusted Next.js server routes.
revoke all on function team_access(text) from public, anon, authenticated;
revoke all on function get_mission(text) from public, anon, authenticated;
revoke all on function heartbeat(text) from public, anon, authenticated;
revoke all on function submit_final(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function team_access(text), get_mission(text), heartbeat(text),
  submit_final(text, text, text, text, text, text, text, text) to service_role;

-- Every table mutation that can control the shared live event is recorded server-side.
drop trigger if exists audit_teams_change on teams;
create trigger audit_teams_change after insert or update or delete on teams
  for each row execute function audit_event_change();
drop trigger if exists audit_state_change on mission_state;
create trigger audit_state_change after update on mission_state
  for each row execute function audit_event_change();
drop trigger if exists audit_transmissions_change on transmissions;
create trigger audit_transmissions_change after insert or update or delete on transmissions
  for each row execute function audit_event_change();
drop trigger if exists audit_broadcasts_change on broadcasts;
create trigger audit_broadcasts_change after insert or update or delete on broadcasts
  for each row execute function audit_event_change();

-- Retain Phase 1 Realtime publication membership; students receive only public state/broadcast events.
notify pgrst, 'reload schema';
