'use client'

import {useEffect,useState,useCallback,useRef} from 'react'
import {sb} from '../lib/supabase'

const Hd=()=>(
  <div className="bar">
    <div>
      <div className="mono sub" style={{fontSize:11}}>
        MVS // OPERATIONS CONTROL · MISSION INTELLIGENCE SYSTEM
      </div>
      <h1 className="mono">MATHVERSE</h1>
      <div className="mono" style={{color:'var(--acc)',fontSize:12}}>
        MATHEMATICAL OPERATIONS DIVISION · SOLVE. ADAPT. INNOVATE.
      </div>
    </div>
    <div className="mono sub" style={{fontSize:12}}>
      SYSTEM <span className="dot"/> ONLINE
    </div>
  </div>
)

const LB=[
  ['pu','1. PROBLEM UNDERSTANDING'],
  ['ma','2. MATHEMATICAL APPROACH'],
  ['fs','3. FINAL SOLUTION'],
  ['ad','4. HOW DID YOU ADAPT AFTER THE CHALLENGE UPDATE?'],
  ['fj','5. FINAL JUSTIFICATION']
]

const PH=[
  'ACCESS',
  'MISSION BRIEFING',
  'INTELLIGENCE RELEASE',
  'SOLVE',
  'CHALLENGE',
  'ADAPT',
  'FINALIZE',
  'MISSION COMPLETE'
]

const MISSION_BACKGROUND_ART: Record<string, string> = {
  MARS: '/mission-backgrounds/mars.webp',
  STORM: '/mission-backgrounds/storm.webp',
  PARK: '/mission-backgrounds/park.webp',
  AMUSEMENT: '/mission-backgrounds/park.webp',
  CITY: '/mission-backgrounds/city.webp',
  FUTURE_CITY: '/mission-backgrounds/city.webp',
  RACE: '/mission-backgrounds/race.webp',
  RESCUE: '/mission-backgrounds/rescue.webp',
  SPACE_RESCUE: '/mission-backgrounds/rescue.webp',
  STADIUM: '/mission-backgrounds/stadium.webp',
  MOVIE: '/mission-backgrounds/movie.webp',
  ISLAND: '/mission-backgrounds/island.webp',
  ROBOT: '/mission-backgrounds/robot.webp'
}

const DEVELOPMENT_MISSIONS = [
  {code:'MARS',title:'MISSION: MARS'},
  {code:'STORM',title:'SURVIVE THE STORM'},
  {code:'PARK',title:'PERFECT AMUSEMENT PARK'},
  {code:'CITY',title:'BUILD THE FUTURE CITY'},
  {code:'RACE',title:'RACE DAY'},
  {code:'RESCUE',title:'SPACE RESCUE'},
  {code:'STADIUM',title:'STADIUM MASTERPLAN'},
  {code:'MOVIE',title:'MOVIE MONEY'},
  {code:'ISLAND',title:'SAVE THE ISLAND'},
  {code:'ROBOT',title:'ROBOT FACTORY'}
]

export default function Student(){

  const A=useRef({
    on:false,
    vol:0.8,
    context:null as AudioContext|null,
    oscillators:new Set<OscillatorNode>(),
    nextSoundAt:0,
    pendingSounds:0
  })
  const seenBroadcast=useRef(0)
  const observedPhase=useRef<{teamId:string;phase:number|null}>({teamId:'',phase:null})

  const [audio,setAudio]=useState(false)
  const [audioMessage,setAudioMessage]=useState('')
  const [vol,setVol]=useState(0.8)
  const [bc,setBc]=useState<any>(null)
  const [id,setId]=useState('')
  const [pin,setPin]=useState('')
  const [team,setTeam]=useState<any>(null)
  const [v,setV]=useState<any>(null)
  const [previewMission,setPreviewMission]=useState('')
  const [criticalAlertSequence,setCriticalAlertSequence]=useState(0)
  const [err,setErr]=useState('')
  const [off,setOff]=useState(0)
  const [down,setDown]=useState(false)
  const [sessionReady,setSessionReady]=useState(false)
  const [authenticating,setAuthenticating]=useState(false)
  const [,tick]=useState(0)
  const [f,setF]=useState<any>({ai:'No AI used'})

  function warnAudio(error:unknown){
    if(process.env.NODE_ENV==='development'){
      console.warn('MATHVERSE notification audio unavailable.',error)
    }
  }

  function playToneSequence(frequencies:number[],duration:number,gap:number){
    const state=A.current
    const context=state.context
    if(!state.on||!context)return
    if(context.state!=='running'){
      warnAudio(new Error(`AudioContext state is ${context.state}.`))
      return
    }
    if(state.pendingSounds>=5){
      warnAudio(new Error('Notification audio queue is full.'))
      return
    }

    const startAt=Math.max(context.currentTime,state.nextSoundAt)
    if(startAt-context.currentTime>2){
      warnAudio(new Error('Notification audio queue exceeded two seconds.'))
      return
    }
    state.nextSoundAt=startAt+frequencies.length*(duration+gap)
    state.pendingSounds+=1

      try{
        frequencies.forEach((frequency,index)=>{
          const startsAt=startAt+index*(duration+gap)
          const oscillator=context.createOscillator()
          const gain=context.createGain()
          oscillator.type=frequencies.length>2?'triangle':'sine'
          oscillator.frequency.setValueAtTime(frequency,startsAt)
          gain.gain.setValueAtTime(.0001,startsAt)
          gain.gain.exponentialRampToValueAtTime(Math.max(.0001,.045*state.vol),startsAt+.012)
          gain.gain.exponentialRampToValueAtTime(.0001,startsAt+duration)
          oscillator.connect(gain)
          gain.connect(context.destination)
          state.oscillators.add(oscillator)
          oscillator.onended=()=>{
            state.oscillators.delete(oscillator)
            if(index===frequencies.length-1){
              state.pendingSounds=Math.max(0,state.pendingSounds-1)
            }
          }
          oscillator.start(startsAt)
          oscillator.stop(startsAt+duration+.02)
        })
      }catch(error){
        state.pendingSounds=Math.max(0,state.pendingSounds-1)
        warnAudio(error)
      }
  }

  function playBroadcastSound(){
    try{playToneSequence([740,988],.085,.035)}catch(error){warnAudio(error)}
  }

  function playCriticalAlertSound(){
    if(!A.current.on)return
      try{playToneSequence([880,660,880],.16,.075)}catch(error){warnAudio(error)}
    if(typeof window!=='undefined'&&'speechSynthesis' in window){
      try{
        speechSynthesis.cancel()
        const utterance=new SpeechSynthesisUtterance('Critical mission alert.')
        utterance.volume=A.current.vol
        speechSynthesis.speak(utterance)
      }catch(error){warnAudio(error)}
    }
  }

  async function enableAudio(){
    try{
      const context=A.current.context||new AudioContext()
      A.current.context=context
      if(context.state==='suspended')await context.resume()
      if(context.state!=='running')throw new Error(`AudioContext state is ${context.state}.`)
      A.current.on=true
      setAudio(true)
      setAudioMessage('AUDIO ENABLED')
    }catch(error){
      A.current.on=false
      setAudio(false)
      setAudioMessage('Audio is unavailable. Mission messages will still appear.')
      warnAudio(error)
    }
  }

  function disableAudio(){
    const state=A.current
    state.on=false
    state.nextSoundAt=0
    state.pendingSounds=0
    state.oscillators.forEach(oscillator=>{
      try{oscillator.stop()}catch(error){warnAudio(error)}
    })
    state.oscillators.clear()
    if(typeof window!=='undefined'&&'speechSynthesis' in window){
      try{speechSynthesis.cancel()}catch(error){warnAudio(error)}
    }
    if(state.context&&state.context.state!=='closed'){
      void state.context.suspend().catch(warnAudio)
    }
    setAudio(false)
    setAudioMessage('AUDIO OFF')
  }

  const onBc=useCallback((broadcast:any)=>{
    const broadcastId=Number(broadcast.id)
    if(!Number.isFinite(broadcastId)||broadcastId<=seenBroadcast.current)return
    seenBroadcast.current=broadcastId
    if(team?.team_id){
      try{sessionStorage.setItem(`mv:last-broadcast:${team.team_id}`,String(broadcastId))}catch(error){warnAudio(error)}
    }
    setBc(broadcast)

    if(broadcast.level==='critical'){
      setCriticalAlertSequence(sequence=>sequence+1)
    }

    const state=A.current
    if(!state.on)return
    if(broadcast.level==='critical'){
      playCriticalAlertSound()
    }else{
      playBroadcastSound()
    }

    if(broadcast.level!=='critical'&&typeof window!=='undefined'&&'speechSynthesis' in window){
      try{
        speechSynthesis.cancel()
        const utterance=new SpeechSynthesisUtterance(broadcast.message)
        utterance.volume=state.vol
        speechSynthesis.speak(utterance)
      }catch(error){warnAudio(error)}
    }
  },[team?.team_id])

  function observeMissionPhase(nextPhase:number,teamId:string,phaseUpdatedAt?:string){
    const previous=observedPhase.current.teamId===teamId
      ?observedPhase.current.phase
      :null
    if(observedPhase.current.teamId!==teamId){
      observedPhase.current={teamId,phase:null}
    }

    const seenKey=`mv:critical-alert-seen:${teamId}`
    const alertIdentity=phaseUpdatedAt||'phase-3'
    if(nextPhase<3){
      try{sessionStorage.removeItem(seenKey)}catch(error){warnAudio(error)}
    }

    if(nextPhase===3&&previous!==3){
      let alreadySeen=false
      try{alreadySeen=sessionStorage.getItem(seenKey)===alertIdentity}catch(error){warnAudio(error)}
      if(!alreadySeen){
        try{sessionStorage.setItem(seenKey,alertIdentity)}catch(error){warnAudio(error)}
        setCriticalAlertSequence(sequence=>sequence+1)
        playCriticalAlertSound()
      }
    }

    observedPhase.current={teamId,phase:nextPhase}
  }

  const load=useCallback(async()=>{

    const r=await fetch('/api/student/mission',{cache:'no-store'})

    if(r.status===401){
      setTeam(null)
      setV(null)
      return
    }

    const body=await r.json()

    if(!r.ok){
      setDown(true)
      return
    }

    setDown(false)
    setV(body.mission)
    setOff(Date.parse(body.mission.now)-Date.now())
    if(team?.team_id&&Number.isFinite(Number(body.mission.phase))){
      observeMissionPhase(Number(body.mission.phase),team.team_id,body.mission.phase_updated_at)
    }

    const br=await fetch('/api/student/broadcasts',{cache:'no-store'})

    if(br.ok){
      const result=await br.json()
      const latest=result.broadcasts?.[0]

      if(latest)onBc(latest)
    }

  },[onBc,team?.team_id])

  async function access(){

    if(authenticating)return

    setAuthenticating(true)

    try{

      const r=await fetch('/api/student/session',{
        method:'POST',
        headers:{
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          team_id:id,
          pin
        })
      })

      const result=await r.json()

      if(!r.ok){
        setErr('Invalid Team ID or PIN.')
        return
      }

      setErr('')
      setPin('')
      setTeam(result.team)

    }catch{
      setErr('Unable to authenticate.')
    }finally{
      setAuthenticating(false)
    }
  }

  useEffect(()=>{

    fetch('/api/student/session',{
      cache:'no-store'
    })
      .then(async r=>{
        if(r.ok){
          const result=await r.json()
          setTeam(result.team)
        }
      })
      .catch(()=>{})
      .finally(()=>{
        setSessionReady(true)
      })

  },[])

  useEffect(()=>{
    const teamId=team?.team_id
    if(!teamId)return
    observedPhase.current={teamId,phase:null}
    try{
      seenBroadcast.current=Number(
        sessionStorage.getItem(`mv:last-broadcast:${teamId}`)
      )||0
    }catch(error){warnAudio(error)}
  },[team?.team_id])

  useEffect(()=>{

    if(!team)return

    load()

    fetch('/api/student/heartbeat',{
      method:'POST'
    })

    const ch=sb
      .channel('student-live')
      .on(
        'postgres_changes',
        {
          event:'*',
          schema:'public',
          table:'mission_state'
        },
        (payload:any)=>{
          const phase=Number(payload.new?.phase)
          if(team?.team_id&&Number.isFinite(phase)){
            observeMissionPhase(phase,team.team_id,payload.new?.updated_at)
          }
          void load()
        }
      )
      .on(
        'postgres_changes',
        {
          event:'INSERT',
          schema:'public',
          table:'broadcasts'
        },
        (payload:any)=>{
          onBc(payload.new)
        }
      )
      .subscribe()

    const a=setInterval(load,20000)

    const b=setInterval(
      ()=>fetch('/api/student/heartbeat',{
        method:'POST'
      }),
      30000
    )

    const c=setInterval(
      ()=>tick(x=>x+1),
      1000
    )

    return()=>{
      sb.removeChannel(ch)
      clearInterval(a)
      clearInterval(b)
      clearInterval(c)
    }

  },[team,load,onBc])

  useEffect(()=>{
    return()=>{
      const state=A.current
      state.on=false
      state.oscillators.forEach(oscillator=>{
        try{oscillator.stop()}catch(error){warnAudio(error)}
      })
      state.oscillators.clear()
      if(typeof window!=='undefined'&&'speechSynthesis' in window){
        speechSynthesis.cancel()
      }
      if(state.context&&state.context.state!=='closed'){
        void state.context.close().catch(warnAudio)
      }
    }
  },[])

  async function submit(){

    if(!confirm(
      'ONE OFFICIAL SUBMISSION. Once transmitted, your response is locked. Continue?'
    ))return

    const response=await fetch(
      '/api/student/submission',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json'
        },
        body:JSON.stringify(f)
      }
    )

    const result=await response.json()

    if(!response.ok){
      setErr(
        result.error ||
        'Unable to submit.'
      )
    }else{
      load()
    }
  }

  const left=v
    ?(
      v.timer_running
        ?Math.max(
          0,
          Math.round(
            (
              Date.parse(v.timer_end)-
              (Date.now()+off)
            )/1000
          )
        )
        :v.timer_left
    )
    :0

  const T=(s:number)=>
    [
      s/3600|0,
      s%3600/60|0,
      s%60
    ]
      .map(n=>String(n).padStart(2,'0'))
      .join(':')

  const m=team?.mission
  const p=v?.phase??0
  const locked=v?.submitted||p===6
  const idx=[0,1,3,4,5,6,7][p]

  /*
    Determine the current mission theme.

    The database may return:
    RESCUE
    SPACE_RESCUE
    STORM
    etc.

    We normalize the value so both the short and
    full mission codes are supported.
  */
  const missionCode=String(
    m?.code ||
    m?.title ||
    ''
  )
    .trim()
    .toUpperCase()
    .replace(/_/g,' ')
    .replace(/[^A-Z0-9 ]/g,'')
    .replace(/\s+/g,' ')

  const normalizedMission=
    missionCode==='SPACE RESCUE'
      ?'SPACE_RESCUE'
      :missionCode==='RESCUE'
        ?'RESCUE'
        :missionCode==='AMUSEMENT'
          ?'PARK'
          :missionCode==='PARK'
            ?'PARK'
            :missionCode==='FUTURE CITY'
              ?'CITY'
              :missionCode==='CITY'
                ?'CITY'
                :missionCode

  const missionBackground=
    (process.env.NODE_ENV==='development' && previewMission
      ? MISSION_BACKGROUND_ART[previewMission]
      : MISSION_BACKGROUND_ART[normalizedMission] || MISSION_BACKGROUND_ART[missionCode]) ||
    '/mission-backgrounds/mars.svg'

  const developmentPreview=process.env.NODE_ENV==='development'
    ? DEVELOPMENT_MISSIONS.find(mission=>mission.code===previewMission)
    : undefined
  const displayedTheme=developmentPreview?.code || normalizedMission

  return(
    <div className={'mission-shell'+(p>=3&&p<6?' mission-critical':'')}>
      <div
        className="mission-background"
        aria-hidden="true"
        style={{backgroundImage:`url(${missionBackground})`}}
      />

      <div className="mission-stage">
        <div className="mission-console">
          <div
            className={
              'wrap mission-'+
              displayedTheme.toLowerCase()
            }
          >

            <Hd/>

      {process.env.NODE_ENV==='development'&&
        <section className="development-preview" aria-label="Development mission preview">
          <div className="development-preview-heading">
            <span className="mono">DEVELOPMENT PREVIEW</span>
            <span className="mono">VISUAL ONLY · LIVE ASSIGNMENT UNCHANGED</span>
          </div>

          <label className="development-preview-select">
            PREVIEW ENVIRONMENT
            <select
              value={previewMission}
              onChange={event=>setPreviewMission(event.target.value)}
            >
              <option value="">LIVE ASSIGNMENT</option>
              {DEVELOPMENT_MISSIONS.map(mission=>(
                <option key={mission.code} value={mission.code}>
                  {mission.code}
                </option>
              ))}
            </select>
          </label>

          {developmentPreview&&
            <div className="development-preview-title" role="status">
              <span className="mono">PREVIEW MISSION · {developmentPreview.code}</span>
              <strong className="mono">{developmentPreview.title}</strong>
            </div>
          }
        </section>
      }

      {down&&
        <div className="card tx wr">
          <b className="mono">
            CONNECTION INTERRUPTED — CONTINUE OFFLINE. AWAIT COMMAND CHANNEL RESTORATION.
          </b>
        </div>
      }

      {bc&&
        <div
          key={bc.level==='critical'?`critical-${criticalAlertSequence}`:`broadcast-${bc.id}`}
          className={
            'card tx '+
            (bc.level==='critical'?'alert critical-alert-shake':'wr')
          }
        >
          <span className="tag">
            COMMAND BROADCAST · {bc.level.toUpperCase()}
          </span>

          <p
            className="mono"
            style={{fontSize:18}}
          >
            {bc.message}
          </p>

          <button onClick={()=>setBc(null)}>
            DISMISS
          </button>
        </div>
      }

      {team&&!audio&&
        <div className="card tx">
          <span className="tag">
            MISSION AUDIO
          </span>

          <p>
            Enable mission audio to receive spoken commands and alerts.
            Text alerts work without it.
          </p>

          <button
            className="pri"
              onClick={enableAudio}
          >
            [ ENABLE MISSION AUDIO ]
          </button>
          {audioMessage&&<p className="mono sub" role="status">{audioMessage}</p>}
        </div>
      }

      {team&&audio&&
        <div
          className="mono sub"
          style={{marginTop:10}}
        >
          🔊 AUDIO ON

          <input
            type="range"
            aria-label="Volume"
            min="0"
            max="1"
            step=".1"
            value={vol}
            style={{width:120}}
            onChange={e=>{
              setVol(+e.target.value)
              A.current.vol=+e.target.value
            }}
          />

          <button onClick={disableAudio}>
            OFF
          </button>
          {audioMessage&&<span role="status">{audioMessage}</span>}
        </div>
      }

      {
        !team&&!sessionReady
          ?
          <div className="card locked">
            <span className="tag">
              STUDENT SESSION
            </span>

            <h2 className="mono">
              RESTORING SESSION…
            </h2>
          </div>

          :
          !team
            ?
            <div className="card locked">

              <span className="tag">
                MISSION ACCESS TERMINAL
              </span>

              <h2 className="mono">
                ENTER TEAM ID + PIN
              </h2>

              <input
                className="mono"
                style={{
                  maxWidth:280,
                  textAlign:'center'
                }}
                placeholder="MV-001"
                value={id}
                onChange={e=>setId(e.target.value)}
                onKeyDown={
                  e=>e.key==='Enter'&&access()
                }
              />

              <input
                className="mono"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                style={{
                  maxWidth:280,
                  textAlign:'center',
                  marginTop:8
                }}
                placeholder="TEAM PIN"
                value={pin}
                onChange={e=>setPin(e.target.value)}
                onKeyDown={
                  e=>e.key==='Enter'&&access()
                }
              />

              <p>
                <button
                  className="pri"
                  disabled={authenticating}
                  onClick={access}
                >
                  {
                    authenticating
                      ?'[ AUTHENTICATING ]'
                      :'[ ACCESS MISSION ]'
                  }
                </button>
              </p>

              {err&&
                <p
                  style={{color:'var(--crit)'}}
                  className="mono"
                >
                  {err}
                </p>
              }

            </div>

            :

            <div className="cols">

              <aside>

                <div className="card">

                  <span className="tag">
                    TEAM AUTHENTICATION
                  </span>

                  <div className="mono">
                    IDENTITY VERIFIED ✓
                    <br/>
                    TEAM: <b>{team.team_name}</b>
                    <br/>
                    TEAM ID: <b>{team.team_id}</b>
                  </div>

                  <div
                    className="mono"
                    style={{marginTop:12}}
                  >
                    <small className="sub">
                      {
                        p===0
                          ?'EVENT STANDBY'
                          :left<=300
                            ?'CRITICAL'
                            :left<=600
                              ?'WARNING'
                              :'MISSION TIME REMAINING'
                      }
                    </small>

                    <br/>

                    <b
                      className={
                        'timer '+
                        (
                          left<=300
                            ?'cr'
                            :left<=600
                              ?'wr'
                              :''
                        )
                      }
                    >
                      {v&&p>0?T(left):'--:--:--'}
                    </b>
                  </div>

                </div>

                <div className="card">

                  <span className="tag">
                    MISSION PHASES
                  </span>

                  <ul className="tl">

                    {PH.map((n,i)=>
                      <li
                        key={n}
                        className={
                          i<idx
                            ?'done'
                            :i===idx
                              ?'cur'
                              :''
                        }
                      >
                        <b className="mono">
                          0{i+1}
                        </b>

                        {n}
                      </li>
                    )}

                  </ul>

                </div>

              </aside>

              <main>

                <div className="card tx">

                  <span className="tag">
                    MISSION ASSIGNED
                  </span>

                  <h2 className="mono">
                    {m.title}
                  </h2>

                  <p
                    className="mono"
                    style={{color:'var(--acc)'}}
                  >
                    {m.tagline.toUpperCase()}
                  </p>

                  {p===0&&
                    <p className="mono sub">
                      AWAITING COMMAND RELEASE…
                    </p>
                  }

                </div>

                {v?.warned&&p<3&&
                  <div className="card tx wr">

                    <span className="pill wr mono">
                      ⚠ COMMAND ADVISORY
                    </span>

                    <p>
                      Stay alert. Conditions may change without notice.
                    </p>

                  </div>
                }

                {p>=3&&p<6&&!locked&&
                  <div
                    key={criticalAlertSequence}
                    className={criticalAlertSequence?'critical-alert-shake':''}
                  >

                    <div className="card alert">

                      <span className="tag">
                        COMMAND CHANNEL // 01
                      </span>

                      <span className="pill cr mono">
                        <span className="dot rx"/>
                        🚨 PRIORITY TRANSMISSION
                      </span>

                      <div className="big mono">
                        ⚠ SITUATION UPDATE
                      </div>

                      <p
                        className="mono"
                        style={{fontSize:20}}
                      >
                        {v.challenge}
                      </p>

                      <div className="obj mono">

                        <small>
                          NEW OBJECTIVE
                        </small>

                        <br/>

                        {v.adaptation||'ADAPT YOUR SOLUTION'}

                      </div>

                    </div>

                  </div>
                }

                {p>=1&&
                  <div className="card tx">

                    <span className="tag">
                      CLASSIFICATION: MISSION INTELLIGENCE
                    </span>

                    <h3 className="mono">
                      MISSION BRIEFING
                    </h3>

                    <p>
                      {v.briefing}
                    </p>

                    <div className="obj mono">

                      <small>
                        [ OBJECTIVE ]
                      </small>

                      <br/>

                      {v.objective}

                    </div>

                  </div>
                }

                {p>=2&&
                  <div className="card tx">

                    <span className="tag">
                      TACTICAL INTELLIGENCE
                    </span>

                    <span className="pill in mono">
                      📡 DATA DROP // 01
                    </span>

                    {
                      /*
                        The database stores mission data as
                        a JSON object.

                        This safely converts it into rows for
                        the existing tactical intelligence UI.
                      */
                    }

                    {(() => {

                      const dataRows:
                        Array<[string,unknown]> =
                        Array.isArray(v?.data)
                          ?v.data
                          :v?.data &&
                            typeof v.data==='object'
                              ?Object.entries(v.data)
                              :[]

                      return(
                        <div
                          className="data"
                          style={{marginTop:12}}
                        >

                          {dataRows.map(
                            ([key,value])=>
                              <div
                                key={String(key)}
                              >

                                <small>
                                  {String(key)
                                    .split('_')
                                    .join(' ')
                                    .toUpperCase()}
                                </small>

                                <b>
                                  {String(value)}
                                </b>

                              </div>
                          )}

                        </div>
                      )

                    })()}

                    {v.constraints&&
                      <p className="sub">
                        {v.constraints}
                      </p>
                    }

                    <p className="sub">
                      No method assigned. Solve offline:
                      paper, calculator, sheets, code.
                      Your team decides.
                    </p>

                  </div>
                }

                {p===5&&!locked&&
                  <div className="card tx fin">

                    <span className="tag">
                      FINAL TRANSMISSION
                    </span>

                    <h2 className="mono">
                      FINAL MISSION SOLUTION
                    </h2>

                    <p className="mono sub">
                      {team.team_id} · {team.team_name} · {m.title}
                    </p>

                    {LB.map(([k,l])=>
                      <div key={k}>

                        <label>
                          {l}
                        </label>

                        <textarea
                          value={f[k]||''}
                          onChange={
                            e=>setF({
                              ...f,
                              [k]:e.target.value
                            })
                          }
                        />

                      </div>
                    )}

                    <label>
                      AI / DIGITAL TOOLS USED (OPTIONAL)
                    </label>

                    <select
                      value={f.ai}
                      onChange={
                        e=>setF({
                          ...f,
                          ai:e.target.value
                        })
                      }
                    >

                      {[
                        'No AI used',
                        'ChatGPT',
                        'Gemini',
                        'Claude',
                        'Other'
                      ].map(o=>
                        <option key={o}>
                          {o}
                        </option>
                      )}

                    </select>

                    <label>
                      HOW WAS IT USED?
                    </label>

                    <input
                      value={f.aix||''}
                      onChange={
                        e=>setF({
                          ...f,
                          aix:e.target.value
                        })
                      }
                    />

                    <p className="sub">
                      AI may assist the team, but the team must understand
                      and justify its final solution. Hand supporting working
                      to the judges physically.
                    </p>

                    {err&&
                      <p style={{color:'var(--crit)'}}>
                        {err}
                      </p>
                    }

                    <button
                      className="pri"
                      onClick={submit}
                    >
                      [ TRANSMIT FINAL SOLUTION ]
                    </button>

                  </div>
                }

                {locked&&
                  <div
                    className="card tx fin"
                    style={{
                      textAlign:'center',
                      padding:30
                    }}
                  >

                    <span className="tag">
                      MATHVERSE COMMAND
                    </span>

                    <h2 className="mono">
                      {
                        v.submitted
                          ?'MISSION COMPLETE'
                          :'MISSION CLOSED'
                      }
                    </h2>

                    <p
                      className="mono"
                      style={{lineHeight:2}}
                    >

                      {v.submitted&&
                        <>
                          ✓ FINAL RESPONSE RECEIVED
                          <br/>
                          ✓ TIMESTAMP RECORDED
                          <br/>
                        </>
                      }

                      <span className="pill cr">
                        🔒 SUBMISSION LOCKED
                      </span>

                    </p>

                  </div>
                }

              </main>

            </div>
      }

            <div className="foot mono">
              ENCRYPTED MISSION CHANNEL // {down?'INTERRUPTED':'CONNECTED'}
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}