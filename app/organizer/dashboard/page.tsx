'use client'
import {useEffect,useState,useCallback,useRef} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import {sb} from '../../../lib/supabase'
const CMD:[string,number,string,string][]=[['▶ START MISSION',1,'MISSION STARTED — BRIEFING RELEASED',''],['📡 RELEASE INTELLIGENCE',2,'DATA DROP 01 RELEASED',''],['🚨 TRIGGER CRITICAL ALERT',3,'CRITICAL ALERT TRANSMITTED','dng'],['🔓 UNLOCK ADAPTATION',4,'ADAPTATION PHASE UNLOCKED',''],['🏁 OPEN FINAL PHASE',5,'FINAL PHASE OPEN',''],['🔴 CLOSE MISSION',6,'MISSION CLOSED','dng']]
const QUICK:[string,string,string][]=[['EVENT START','Attention MATHVERSE teams. The mission has begun. Review your mission briefing and begin your mathematical planning.','info'],['30 MIN LEFT','Attention MATHVERSE teams. Thirty minutes remaining.','warning'],['15 MIN LEFT','Attention MATHVERSE teams. Fifteen minutes remaining.','warning'],['5 MIN LEFT','Attention MATHVERSE teams. Five minutes remaining.','warning'],['1 MIN LEFT','Attention MATHVERSE teams. One minute remaining.','critical'],['CHALLENGE UPDATE','Attention MATHVERSE teams. The challenge update has been released. Review the new mission intelligence and adapt your mathematical strategy.','critical'],['FINAL OPEN','Attention MATHVERSE teams. Final submission is now open. Review your mathematical justification and transmit your official solution.','info'],['SUBMISSION CLOSED','Attention MATHVERSE teams. Final submission is now closed.','warning'],['EVENT COMPLETE','Attention MATHVERSE teams. The event is complete. Thank you for your participation.','success']]
export default function Org(){
 const phaseActionRef=useRef(false)
 const [me,setMe]=useState(''),[role,setRole]=useState(''),[bm,setBm]=useState(''),[tt,setTt]=useState({h:0,m:45,s:0}),[au,setAu]=useState<any[]>([]),[subs,setSubs]=useState<any[]>([]),[orgs,setOrgs]=useState<any[]>([]),[ok,setOk]=useState(false),[st,setSt]=useState<any>(null),[teams,setTeams]=useState<any[]>([]),[ms,setMs]=useState<any[]>([]),[log,setLog]=useState<any[]>([]),[q,setQ]=useState(''),[nid,setNid]=useState(''),[nn,setNn]=useState(''),[msg,setMsg]=useState(''),[pinValue,setPinValue]=useState(''),[pinTeam,setPinTeam]=useState(''),[pinFeedback,setPinFeedback]=useState<{type:'success'|'error';text:string}|null>(null),[pinWorking,setPinWorking]=useState(false),[phaseWorking,setPhaseWorking]=useState(false),[orgEmail,setOrgEmail]=useState(''),[orgRole,setOrgRole]=useState('ADMIN'),[lateTeamId,setLateTeamId]=useState(''),[lateMissionId,setLateMissionId]=useState('')
 const load=useCallback(async()=>{const[a,b,c,d,e,f]=await Promise.all([sb.from('mission_state').select('*').single(),role==='JUDGE'?Promise.resolve({data:[]}):sb.rpc('get_team_monitor'),sb.from('missions').select('id,code,title').order('id'),sb.from('transmissions').select('*').order('id',{ascending:false}).limit(50),role==='SUPER_ADMIN'?sb.from('audit_logs').select('*').order('id',{ascending:false}).limit(30):Promise.resolve({data:[]}),sb.from('submissions').select('*').order('submitted_at',{ascending:false})]);setAu(e.data||[]);setSubs(f.data||[]);setSt(a.data);setTeams(b.data||[]);setMs(c.data||[]);setLog(d.data||[]);if(role==='SUPER_ADMIN'){const{data}=await sb.rpc('list_organizers');setOrgs(data||[])}},[role])
 useEffect(()=>{sb.auth.getSession().then(async({data})=>{const session=data.session;if(!session)return;const{data:authorized}=await sb.rpc('current_organizer_role');if(!authorized)return;setRole(authorized);setMe(session.user.email||'');setOk(true)})},[])
 useEffect(()=>{if(!ok)return;load();const ch=sb.channel('org').on('postgres_changes',{event:'*',schema:'public',table:'mission_state'},load).on('postgres_changes',{event:'*',schema:'public',table:'teams'},load).on('postgres_changes',{event:'*',schema:'public',table:'submissions'},load).subscribe();const t=setInterval(load,15000);return()=>{sb.removeChannel(ch);clearInterval(t)}},[ok,load])
 async function cmd(n:number,label:string){
  if(phaseWorking||phaseActionRef.current)return
  if(n!==(st?.phase??0)+1){setMsg('Only the next mission phase can be opened.');return}
  phaseActionRef.current=true
  setPhaseWorking(true)
  setMsg('')
  try{
   const{error}=await sb.rpc('advance_event_phase',{p_phase:n,p_content:label})
   if(error){setMsg(error.message);console.error(error);return}
   await load()
  }finally{
   phaseActionRef.current=false
   setPhaseWorking(false)
  }
 }
 async function warn(){setMsg('');const{data:stateData,error:stateError}=await sb.from('mission_state').update({warned:true}).eq('id',1);if(stateError){setMsg(stateError.message);console.error(stateError);return}void stateData;const{data:transmissionData,error:transmissionError}=await sb.from('transmissions').insert({type:'WARNING',content:'WARNING ISSUED'});if(transmissionError){setMsg(transmissionError.message);console.error(transmissionError);return}void transmissionData;load()}
 async function reset(){if(!confirm('Reset phase to STANDBY and stop the timer? (missions and submissions are retained)'))return;setMsg('');const{data,error}=await sb.from('mission_state').update({phase:0,warned:false,timer_running:false,timer_end:null}).eq('id',1);if(error){setMsg(error.message);console.error(error);return}void data;load()}
 async function assignByRpc(t:string,mid:string){
  if(!mid){setMsg('Select a mission before assigning.');return}
  const{data,error}=await sb.rpc('assign_team_mission',{p_team_id:t,p_mission_id:+mid})
  if(error){setMsg(error.message);console.error(error);return}
  void data;await load();setMsg('')
 }
 async function startMathverse(){
  setMsg('')
  const{data,error}=await sb.rpc('start_mathverse_event')
  if(error){setMsg(error.message);console.error(error);return}
  setMsg(data?.message || 'MATHVERSE started successfully.')
  await load()
 }
 async function autoAssignLate(){
  setMsg('')
  const{data,error}=await sb.rpc('auto_assign_late_teams')
  if(error){setMsg(error.message);console.error(error);return}
  setMsg(data?.message || 'Late teams assigned.')
  await load()
 }
 async function assignLateManual(){
  if(!lateTeamId||!lateMissionId){setMsg('Choose both a late team and a mission.');return}
  await assignByRpc(lateTeamId,lateMissionId)
  setLateTeamId('');setLateMissionId('')
 }
 async function generatePin(createTeam:boolean,requestedId=nid){
  const teamId=requestedId.trim().toUpperCase()
  setPinValue('');setPinTeam('');setPinFeedback(null)
  if(role!=='SUPER_ADMIN'&&role!=='ADMIN'){setPinFeedback({type:'error',text:'Organizer access denied.'});return}
  if(!/^MV-[0-9]{3}$/.test(teamId)){setPinFeedback({type:'error',text:'Team ID must match MV-###.'});return}
  if(createTeam&&!nn.trim()){setPinFeedback({type:'error',text:'Enter a team name to create a team.'});return}
  setPinWorking(true)
  const{data,error}=await sb.rpc('issue_team_pin',{p_team_id:teamId,p_team_name:createTeam?nn.trim():null})
  if(error){setPinFeedback({type:'error',text:error.message});setPinWorking(false);return}
  if(typeof data!=='string'||!/^\d{6}$/.test(data)){setPinFeedback({type:'error',text:'PIN generation returned an unexpected response.'});setPinWorking(false);return}
  setPinValue(data);setPinTeam(teamId)
  setPinFeedback({type:'success',text:`PIN generated for ${teamId}. Save it securely; it is only returned when generated or reset.`})
  if(createTeam){setNid('');setNn('')}
  await load()
  setPinWorking(false)
 }
 async function resetPin(t:string){setNid(t);await generatePin(false,t)}
 async function manageOrganizer(){const{error}=await sb.rpc('manage_organizer',{p_email:orgEmail,p_role:orgRole});if(error)setMsg(error.message);else{setMsg('');setOrgEmail('');load()}}
 async function exportCsv(){const{data}=await sb.from('submissions').select('*');if(!data?.length)return setMsg('No submissions yet');await sb.rpc('audit_submission_export',{p_record_count:data.length});const k=Object.keys(data[0]),csv=[k.join(','),...data.map((r:any)=>k.map(x=>JSON.stringify(r[x]??'')).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='mathverse-submissions.csv';a.click()}
 async function tm(a:string){setMsg('');const{data,error}=await sb.rpc('timer_action',{a});if(error){setMsg(error.message);console.error(error);return}void data;load()}
 async function adj(d:number){setMsg('');const{data,error}=await sb.rpc('adjust_timer',{p_delta:d});if(error){setMsg(error.message);console.error(error);return}void data;load()}
 async function setT(){setMsg('');const{data,error}=await sb.rpc('set_timer',{p_seconds:tt.h*3600+tt.m*60+tt.s});if(error){setMsg(error.message);console.error(error);return}void data;load()}
 async function bcast(m:string,level:string){if(!m.trim())return;const{error}=await sb.from('broadcasts').insert({message:m,level});if(error)return setMsg(error.message);await sb.from('transmissions').insert({type:'BROADCAST',content:m});setBm('');load()}
 const p=st?.phase??0,url=process.env.NEXT_PUBLIC_SITE_URL||''
 const cnt=(f:(t:any)=>boolean)=>teams.filter(f).length
 const dist:any={};teams.forEach(t=>{const c=t.mission_code||'UNASSIGNED';dist[c]=(dist[c]||0)+1})
 const registeredTeams=teams.length
 const assignmentState=(st && st.phase>0)?'COMPLETE':'NOT STARTED'
 const lateTeams=teams.filter((t:any)=>!t.mission_id)
 const capacityWarning=registeredTeams>=75&&registeredTeams<80?'CAPACITY WARNING: 75+ teams registered.':registeredTeams===80?'CAPACITY FULL':''
 if(!ok)return <div className="wrap"><div className="card locked"><span className="tag">ORGANIZER ACCESS</span><h2 className="mono">VERIFYING AUTHORIZATION</h2></div></div>
 return <div className="wrap"><div className="bar"><div><h1 className="mono">MATHVERSE COMMAND CENTER</h1><div className="mono sub" style={{fontSize:12}}>MVS // OPERATIONS CONTROL · PHASE {p} / 6 {st?.warned?'· ⚠ WARNED':''}</div><div className="mono sub">{me} · {role}</div></div><button onClick={async()=>{await sb.auth.signOut();location.href='/organizer'}}>SIGN OUT</button></div>
 <div className="grid"><div>
  {role!=='JUDGE'&&<div className="card"><span className="tag">COMMAND CONSOLE</span><div className="cmds">{CMD.map(([l,n,lab,c])=><button key={n} className={'cmd '+c} disabled={phaseWorking || p===0 || n!==p+1} onClick={()=>cmd(n,lab)}>{l}</button>)}<button className="cmd warn" onClick={warn}>⚠ ISSUE WARNING</button>{role==='SUPER_ADMIN'&&<button className="cmd" onClick={reset}>RESET TO STANDBY</button>}</div>
  <div className="cmds" style={{marginTop:12}}><button disabled={!!st?.timer_running} onClick={()=>tm('start')}>{st?.timer_running?'▶ TIMER RUNNING':'▶ START / RESUME'}</button><button onClick={()=>tm('pause')}>⏸ PAUSE</button>{[-300,-60,60,300,600].map(x=><button key={x} onClick={()=>adj(x)}>{x>0?'+':''}{x/60} MIN</button>)}</div>
  <div className="cmds" style={{marginTop:8,alignItems:'center'}}>{(['h','m','s'] as const).map(k=><label key={k} style={{margin:0}}>{k.toUpperCase()} <input type="number" min="0" style={{width:70}} value={tt[k]} onChange={e=>setTt({...tt,[k]:+e.target.value})}/></label>)}<button onClick={setT}>SET TIMER</button></div></div>}
  {(role==='SUPER_ADMIN'||role==='ADMIN')&&<div className="card"><span className="tag">TEAM MANAGEMENT</span>
   <div className="stats mono" style={{marginBottom:10}}><span className="pill in">REGISTERED TEAMS {registeredTeams} / 80</span><span className="pill ok">MISSION ASSIGNMENT {assignmentState}</span>{capacityWarning&&<span className="pill wr">{capacityWarning}</span>}</div>
   <div className="cmds" style={{marginBottom:12}}><button className="pri" disabled={!!st && st.phase>0 || registeredTeams>80} onClick={startMathverse}>🚀 START MATHVERSE</button></div>
   <div className="two"><label>TEAM ID<input placeholder="MV-001" value={nid} onChange={e=>setNid(e.target.value)}/></label><label>TEAM NAME<input placeholder="Team name" value={nn} onChange={e=>setNn(e.target.value)}/></label></div><div className="cmds"><button disabled={pinWorking || registeredTeams>=80} onClick={()=>generatePin(true)}>CREATE TEAM &amp; GENERATE PIN</button><button disabled={pinWorking} onClick={()=>generatePin(false)}>GENERATE / RESET PIN</button></div>
  {pinFeedback&&<p className={'mono '+(pinFeedback.type==='success'?'ok':'cr')} role={pinFeedback.type==='error'?'alert':'status'}>{pinFeedback.text}</p>}
  {pinValue&&<div className="obj mono" role="status"><small>NEW PIN FOR {pinTeam}</small><br/><b style={{fontSize:24}}>{pinValue}</b><br/>Save this PIN securely. It cannot be retrieved later.</div>}
  {msg&&<p className="mono" style={{color:'var(--warn)'}}>{msg}</p>}
   <input placeholder="search Team ID / name" value={q} onChange={e=>setQ(e.target.value)}/>
  <table><tbody><tr><th>TEAM</th><th>NAME</th><th>MISSION</th><th>ONLINE</th><th>FINAL</th><th>PIN</th></tr>{teams.filter(t=>(t.team_id+t.team_name).toLowerCase().includes(q.toLowerCase())).map(t=><tr key={t.team_id}><td className="mono">{t.team_id}</td><td>{t.team_name}</td>
  <td className="mono">{t.mission_code || 'UNASSIGNED'}</td><td>{t.online?'● ONLINE':'○ OFFLINE'}</td><td>{t.submitted?'✓ '+new Date(t.submitted_at).toLocaleTimeString():'PENDING'}</td><td><button disabled={pinWorking} onClick={()=>resetPin(t.team_id)}>GENERATE / RESET PIN</button></td></tr>)}</tbody></table>
   <div className="stats mono"><span className="pill in">TOTAL {teams.length}</span><span className="pill ok">ONLINE {cnt(t=>t.online)}</span><span className="pill in">SUBMITTED {cnt(t=>t.submitted)}</span><span className="pill wr">PENDING {cnt(t=>!t.submitted)}</span></div>
     <p className="mono sub">{Object.entries(dist).map(([k,v])=>`${k} — ${v}`).join(' · ')}</p>
     {lateTeams.length>0&&<div className="mono sub">LATE / UNASSIGNED {lateTeams.length}</div>}
     {role==='SUPER_ADMIN'&&<button onClick={exportCsv}>📊 EXPORT SUBMISSIONS CSV</button>}</div>}
   {(role==='SUPER_ADMIN'||role==='ADMIN')&&<div className="card"><span className="tag">ASSIGN LATE TEAMS</span>
    <div className="stats mono" style={{marginBottom:8}}><span className="pill wr">UNASSIGNED {lateTeams.length}</span></div>
    {lateTeams.length===0 ? <p className="mono sub">No currently unassigned teams.</p> : <div className="log mono">{lateTeams.map(t=><div key={t.team_id}>{t.team_id} · <b>Unassigned</b></div>)}</div>}
    <div className="cmds"><button onClick={autoAssignLate} disabled={lateTeams.length===0}>⚖️ AUTO ASSIGN LATE TEAMS</button></div>
    <div className="two" style={{marginTop:10}}>
      <label>TEAM<select value={lateTeamId} onChange={e=>setLateTeamId(e.target.value)}><option value="">Select team</option>{lateTeams.map(t=><option key={t.team_id} value={t.team_id}>{t.team_id}</option>)}</select></label>
      <label>MISSION<select value={lateMissionId} onChange={e=>setLateMissionId(e.target.value)}><option value="">Select mission</option>{ms.map(m=><option key={m.id} value={m.id}>{m.code}</option>)}</select></label>
    </div>
    <button onClick={assignLateManual} disabled={!lateTeamId || !lateMissionId}>ASSIGN MISSION</button>
   </div>}
</div>
 <div>{role==='SUPER_ADMIN'&&<div className="card"><span className="tag">ORGANIZER ACCESS CONTROL</span><div className="two"><input type="email" placeholder="Existing Supabase Auth email" value={orgEmail} onChange={e=>setOrgEmail(e.target.value)}/><select value={orgRole} onChange={e=>setOrgRole(e.target.value)}><option>ADMIN</option><option>JUDGE</option><option>SUPER_ADMIN</option></select></div><p><button onClick={manageOrganizer}>SET ORGANIZER ROLE</button></p><div className="log mono">{orgs.map(o=><div key={o.user_id}>{o.email} · {o.role}</div>)}</div></div>}
    {role==='JUDGE'&&<div className="card"><span className="tag">OFFICIAL SUBMISSIONS</span>{subs.map(s=><details key={s.team_id}><summary className="mono">{s.team_id} · {s.mission_id} · {new Date(s.submitted_at).toLocaleString()}</summary><p><b>Problem understanding</b><br/>{s.problem_understanding}</p><p><b>Mathematical approach</b><br/>{s.mathematical_approach}</p><p><b>Final solution</b><br/>{s.final_solution}</p><p><b>Adaptation</b><br/>{s.adaptation_explanation}</p><p><b>Final justification</b><br/>{s.final_justification}</p><p><b>Tools</b><br/>{s.ai_tools_used}: {s.ai_usage_explanation}</p></details>)}</div>}
    <div className="card"><span className="tag">TRANSMISSION LOG</span><div className="log mono">{log.map(l=><div key={l.id}><span className="sub">[{new Date(l.created_at).toLocaleTimeString()}]</span><br/><b>{l.type}</b> {l.content}</div>)}</div></div>
    {role!=='JUDGE'&&<div className="card"><span className="tag">BROADCAST CONTROL</span><div className="cmds">{QUICK.map(([l,m,lv])=><button key={l} onClick={()=>bcast(m,lv)}>{l}</button>)}</div><textarea style={{marginTop:10}} placeholder="Custom message to all teams" value={bm} onChange={e=>setBm(e.target.value)}/><div className="cmds" style={{marginTop:8}}><button onClick={()=>speechSynthesis.speak(new SpeechSynthesisUtterance(bm||'Voice test'))}>TEST VOICE</button><button className="pri" onClick={()=>bcast(bm,'info')}>BROADCAST TO ALL</button><button className="cmd dng" onClick={()=>bcast(bm.trim()?bm:'Critical mission alert. Teams, stay alert and review the latest mission information.','critical')}>CRITICAL BROADCAST</button></div></div>}
    {role==='SUPER_ADMIN'&&<div className="card"><span className="tag">AUDIT LOG</span><div className="log mono">{au.map(l=><div key={l.id}><span className="sub">[{new Date(l.created_at).toLocaleString()}]</span><br/><b>{l.actor} · {l.role}</b> {l.action} · {l.target} · {l.details}</div>)}</div></div>}
  <div className="card"><span className="tag">STUDENT MISSION PORTAL</span>{url&&<><QRCodeSVG value={url} size={160} bgColor="#e8ebe0"/><p className="mono">SCAN TO JOIN<br/><a href={url} style={{color:'var(--acc)'}}>{url}</a></p></>}</div></div></div></div>}
