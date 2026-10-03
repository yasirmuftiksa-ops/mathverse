'use client'
import {useEffect,useState,type FormEvent} from 'react'
import {useRouter} from 'next/navigation'
import {sb} from '../../../lib/supabase'

export default function ResetPassword(){
 const[newPassword,setNewPassword]=useState('')
 const[confirmPassword,setConfirmPassword]=useState('')
 const[status,setStatus]=useState<'checking'|'ready'|'invalid'>('checking')
 const[message,setMessage]=useState('')
 const[loading,setLoading]=useState(false)
 const router=useRouter()

 useEffect(()=>{
  let active=true
  const{data:{subscription}}=sb.auth.onAuthStateChange((event,session)=>{
   if(!active)return
   if(event==='PASSWORD_RECOVERY'&&session)setStatus('ready')
   else if(session)setStatus('ready')
   else if(event==='SIGNED_OUT')setStatus('invalid')
  })
  sb.auth.getSession().then(({data,error})=>{
   if(!active)return
   if(error||!data.session)setStatus('invalid')
   else setStatus('ready')
  })
  return()=>{active=false;subscription.unsubscribe()}
 },[])

 async function savePassword(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(status!=='ready'||loading)return
  if(newPassword!==confirmPassword){setMessage('Passwords do not match.');return}
  setLoading(true)
  setMessage('')
  const{error}=await sb.auth.updateUser({password:newPassword})
  if(error){setMessage(error.message);setLoading(false);return}
  await sb.auth.signOut()
  router.replace('/organizer')
 }

 return <div className="wrap">
  <header className="bar">
   <div><div className="mono sub" style={{fontSize:11}}>MVS // OPERATIONS CONTROL · SECURE ACCESS</div><h1 className="mono">MATHVERSE</h1></div>
   <div className="mono sub">CREDENTIAL RECOVERY</div>
  </header>
  <main className="land">
   <div className="g" aria-hidden="true"/>
   <section className="card locked" style={{width:'100%',maxWidth:440,textAlign:'left'}}>
    <span className="tag">MISSION CONTROL // ACCOUNT SECURITY</span>
    <h2 className="mono">RESET PASSWORD</h2>
    {status==='checking'&&<p className="mono sub" role="status">VERIFYING RECOVERY SESSION…</p>}
    {status==='invalid'&&<p className="mono cr" role="alert">This password reset link is invalid or expired. Request a new reset email.</p>}
    {status==='ready'&&<form onSubmit={savePassword}>
     <label htmlFor="new-password">NEW PASSWORD</label>
     <input id="new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={event=>setNewPassword(event.target.value)}/>
     <label htmlFor="confirm-password">CONFIRM PASSWORD</label>
     <input id="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/>
     {message&&<p className="mono cr" role="alert">{message}</p>}
     <p><button className="pri" type="submit" disabled={loading}>{loading?'[ UPDATING PASSWORD ]':'[ SAVE NEW PASSWORD ]'}</button></p>
    </form>}
   </section>
   <div className="co mono" style={{position:'relative',marginTop:14}}>ENCRYPTED COMMAND CHANNEL · MATHVERSE</div>
  </main>
 </div>
}
