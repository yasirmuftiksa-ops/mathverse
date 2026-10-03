-- MATHVERSE schema. Run in Supabase SQL editor.
create table missions(id serial primary key,code text unique not null,title text not null,tagline text,theme text,
 briefing text default 'BRIEFING NOT YET AUTHORED',initial_data jsonb default '[]',constraints text,objective text,challenge_update text default 'CHALLENGE NOT YET AUTHORED',adaptation_objective text default 'ADAPT YOUR SOLUTION.');
create table teams(team_id text primary key check(team_id~'^MV-[0-9]{3}$'),team_name text not null,mission_id int references missions(id),last_seen timestamptz,created_at timestamptz default now());
create table mission_state(id int primary key default 1 check(id=1),phase int not null default 0 check(phase between 0 and 6),warned boolean default false,
 timer_running boolean default false,timer_end timestamptz,timer_left int default 19800,updated_at timestamptz default now());
insert into mission_state(id) values(1);
create table submissions(team_id text primary key references teams(team_id),mission_id int references missions(id),problem_understanding text,mathematical_approach text,final_solution text,
 adaptation_explanation text,final_justification text,ai_tools_used text,ai_usage_explanation text,file_path text,submitted_at timestamptz default now(),locked boolean default true);
create table transmissions(id bigserial primary key,type text,content text,created_at timestamptz default now());
create table organizers(user_id uuid primary key references auth.users(id));
create index on teams(mission_id);
create function is_organizer() returns boolean language sql security definer stable set search_path=public as $$select exists(select 1 from organizers where user_id=auth.uid())$$;
alter table missions enable row level security;alter table teams enable row level security;alter table mission_state enable row level security;
alter table submissions enable row level security;alter table transmissions enable row level security;alter table organizers enable row level security;
create policy org_all on missions for all using(is_organizer()) with check(is_organizer());
create policy org_all on teams for all using(is_organizer()) with check(is_organizer());
create policy org_all on submissions for all using(is_organizer()) with check(is_organizer());
create policy org_all on transmissions for all using(is_organizer()) with check(is_organizer());
create policy org_all on mission_state for all using(is_organizer()) with check(is_organizer());
create policy state_read on mission_state for select using(true); -- flags only, no mission content
-- students have NO table access: only these RPCs
create function team_access(p_team text) returns json language sql security definer set search_path=public as $$
 select json_build_object('team_id',t.team_id,'team_name',t.team_name,'mission',json_build_object('code',m.code,'title',m.title,'tagline',m.tagline,'theme',m.theme))
 from teams t join missions m on m.id=t.mission_id where t.team_id=upper(trim(p_team))$$;
create function get_mission(p_team text) returns json language plpgsql security definer set search_path=public as $$
declare s mission_state%rowtype;t teams%rowtype;m missions%rowtype;
begin select * into t from teams where team_id=upper(trim(p_team));if not found or t.mission_id is null then return null;end if;
 select * into m from missions where id=t.mission_id;select * into s from mission_state where id=1;
 return json_build_object('now',now(),'phase',s.phase,'phase_updated_at',s.updated_at,'warned',s.warned,'timer_running',s.timer_running,'timer_end',s.timer_end,'timer_left',s.timer_left,
  'submitted',exists(select 1 from submissions where team_id=t.team_id),
  'briefing',case when s.phase>=1 then m.briefing end,'objective',case when s.phase>=1 then m.objective end,
  'data',case when s.phase>=2 then m.initial_data end,'constraints',case when s.phase>=2 then m.constraints end,
  'challenge',case when s.phase>=3 then m.challenge_update end,'adaptation',case when s.phase>=4 then m.adaptation_objective end);end$$;
create function heartbeat(p_team text) returns void language sql security definer set search_path=public as $$update teams set last_seen=now() where team_id=upper(trim(p_team))$$;
create function submit_final(p_team text,p_pu text,p_ma text,p_fs text,p_ad text,p_fj text,p_ai text,p_aix text) returns json language plpgsql security definer set search_path=public as $$
declare s mission_state%rowtype;t teams%rowtype;
begin select * into t from teams where team_id=upper(trim(p_team));if not found then raise exception 'unknown team';end if;
 select * into s from mission_state where id=1;if s.phase<>5 then raise exception 'final phase not open';end if;
 insert into submissions(team_id,mission_id,problem_understanding,mathematical_approach,final_solution,adaptation_explanation,final_justification,ai_tools_used,ai_usage_explanation)
 values(t.team_id,t.mission_id,left(p_pu,10000),left(p_ma,10000),left(p_fs,10000),left(p_ad,10000),left(p_fj,10000),left(p_ai,50),left(p_aix,1000));
 return json_build_object('ok',true,'at',now());
exception when unique_violation then raise exception 'already submitted';end$$;
create function timer_action(a text) returns void language plpgsql security definer set search_path=public as $$
begin if not is_organizer() then raise exception 'forbidden';end if;
 if a='start' then update mission_state set timer_running=true,timer_end=now()+timer_left*interval '1 second' where id=1;
 elsif a='pause' then update mission_state set timer_left=greatest(0,extract(epoch from timer_end-now())::int),timer_running=false where id=1;
 elsif a='add' then update mission_state set timer_left=timer_left+300,timer_end=case when timer_running then timer_end+interval '5 min' end where id=1;end if;end$$;
create view team_monitor with(security_invoker=on) as select t.team_id,t.team_name,t.mission_id,m.code mission_code,coalesce(t.last_seen>now()-interval '75 seconds',false) online,
 (s.team_id is not null) submitted,s.submitted_at from teams t left join missions m on m.id=t.mission_id left join submissions s on s.team_id=t.team_id;
alter publication supabase_realtime add table mission_state,teams,submissions;
insert into missions(code,title,tagline,theme) values
('MARS','MISSION: MARS','Every Resource Counts.','mars'),('STORM','SURVIVE THE STORM','Plan Before It Hits.','storm'),('PARK','PERFECT AMUSEMENT PARK','Maximum Fun. Minimum Space.','park'),
('CITY','BUILD THE FUTURE CITY','₹100 Crore. One City.','city'),('RACE','RACE DAY','Fastest Doesn''t Always Mean First.','race'),('RESCUE','SPACE RESCUE','One Mission. Limited Fuel. One Chance.','space'),
('STADIUM','STADIUM MASTERPLAN','Fit Everyone. Move Everyone.','stadium'),('MOVIE','MOVIE MONEY','Big Movie. Limited Budget.','cinema'),('ISLAND','SAVE THE ISLAND','The Water Is Rising.','island'),('ROBOT','ROBOT FACTORY','Build More. Waste Less.','factory');
update missions set briefing='A severe storm has affected the region. 23 civilians require evacuation. Develop a mathematically justified evacuation plan.',objective='Develop a mathematically justified evacuation plan.',
 initial_data='[["PERSONNEL","23"],["SHELTER CAPACITY","40"],["DISTANCE","12 KM"],["BUSES","3"],["BUS CAPACITY","20 PAX"],["AVG SPEED","30 KM/H"],["TIME","45 MIN"]]',
 challenge_update='ONE EVACUATION BUS HAS BECOME UNAVAILABLE. AVAILABLE: 02. PREVIOUS: 03. DEADLINE: UNCHANGED. CURRENT PLAN COMPROMISED.' where code='STORM';
update missions set briefing='Plan a 25-lap race strategy. Decide fuel use and pit stops to finish in the best total time.',objective='Build the best race strategy.',
 initial_data='[["TRACK LENGTH","4 KM"],["RACE LAPS","25"],["AVG SPEED","200 KM/H"],["FUEL CAPACITY","50 L"],["FUEL USE","2 L / LAP"],["PIT STOP","25 S"]]',
 challenge_update='RACE CONDITIONS UPDATED. TRACK SPEED DOWN 20%. FUEL CONSUMPTION UP 15%. YOUR ORIGINAL STRATEGY MAY NO LONGER WORK.' where code='RACE';
-- Create organizer: sign up in Auth dashboard, then:
-- insert into organizers select id from auth.users where email='you@college.edu';
-- ===== v2: broadcasts, audit log, custom timer =====
create table broadcasts(id bigserial primary key,message text not null,level text default 'info' check(level in('info','warning','critical','success')),created_by uuid default auth.uid(),created_at timestamptz default now());
alter table broadcasts enable row level security;
create policy org_all on broadcasts for all using(is_organizer()) with check(is_organizer());
create policy bc_read on broadcasts for select using(true); -- TODO: targeted (mission/team) broadcasts
alter publication supabase_realtime add table broadcasts;
create table audit_logs(id bigserial primary key,user_id uuid default auth.uid(),actor text,action text not null,details text,created_at timestamptz default now());
alter table audit_logs enable row level security;
create policy org_all on audit_logs for all using(is_organizer()) with check(is_organizer());
create function set_timer(p_seconds int) returns void language plpgsql security definer set search_path=public as $$
begin if not is_organizer() then raise exception 'forbidden';end if;
 update mission_state set timer_left=greatest(0,p_seconds),timer_running=false,timer_end=null where id=1;end$$;
create function adjust_timer(p_delta int) returns void language plpgsql security definer set search_path=public as $$
begin if not is_organizer() then raise exception 'forbidden';end if;
 update mission_state set timer_end=case when timer_running then timer_end+p_delta*interval '1 second' end,
  timer_left=case when timer_running then timer_left else greatest(0,timer_left+p_delta) end where id=1;end$$;
