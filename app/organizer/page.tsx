'use client'
import {useState,type FormEvent} from 'react'
import {useRouter} from 'next/navigation'
import {sb} from '../../lib/supabase'

export default function OrganizerLogin(){
 const[email,setEmail]=useState('')
 const[password,setPassword]=useState('')
 const[message,setMessage]=useState('')
 const[loading,setLoading]=useState(false)
 const[recoveryLoading,setRecoveryLoading]=useState(false)
 const[recoveryMessage,setRecoveryMessage]=useState('')
 const router=useRouter()

 async function login(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(loading)return

  setLoading(true)
  setMessage('')

  const{data,error}=await sb.auth.signInWithPassword({email,password})

  if(error||!data.user){
   setMessage('Invalid email or password.')
   setLoading(false)
   return
  }

  const{data:organizer,error:organizerError}=await sb
   .from('organizers')
   .select('role')
   .eq('user_id',data.user.id)
   .maybeSingle()

  if(
   organizerError||
   !organizer||
   !['SUPER_ADMIN','ADMIN','JUDGE'].includes(organizer.role)
  ){
   await sb.auth.signOut()
   setMessage('Organizer access denied.')
   setLoading(false)
   return
  }

  router.replace('/organizer/dashboard')
 }

 async function recoverPassword(){
  if(!email.trim()){
   setRecoveryMessage('Enter your email address to request a password reset.')
   return
  }

  setRecoveryLoading(true)
  setRecoveryMessage('')

  const{error}=await sb.auth.resetPasswordForEmail(email.trim(),{
   redirectTo:'http://localhost:3000/auth/reset-password'
  })

  setRecoveryMessage(
   error
    ? 'Unable to send the reset email. Please try again.'
    : 'If an account exists for this email, password reset instructions have been sent.'
  )

  setRecoveryLoading(false)
 }

 return <div className="wrap">
  <header className="bar">
   <div>
    <div className="mono sub" style={{fontSize:11}}>
     MVS // OPERATIONS CONTROL · SECURE ACCESS
    </div>
    <h1 className="mono">MATHVERSE</h1>
   </div>

   <div className="mono sub">
    ORGANIZER AUTHENTICATION
   </div>
  </header>

  <main className="land">
   <div className="g" aria-hidden="true"/>

   <section
    className="card locked"
    style={{
     width:'100%',
     maxWidth:440,
     textAlign:'left'
    }}
   >
    <span className="tag">
     MISSION CONTROL // AUTHORIZED PERSONNEL
    </span>

    <h2 className="mono">
     ORGANIZER SIGN IN
    </h2>

    <p className="sub">
     Authenticate with your assigned Supabase account.
    </p>

    <form onSubmit={login}>
     <label htmlFor="organizer-email">
      EMAIL
     </label>

     <input
      id="organizer-email"
      type="email"
      autoComplete="username"
      required
      value={email}
      onChange={event=>setEmail(event.target.value)}
     />

     <label htmlFor="organizer-password">
      PASSWORD
     </label>

     <input
      id="organizer-password"
      type="password"
      autoComplete="current-password"
      required
      value={password}
      onChange={event=>setPassword(event.target.value)}
     />

     <p>
      <button
       className="pri"
       type="submit"
       disabled={loading}
      >
       {loading
        ? '[ VERIFYING ACCESS ]'
        : '[ AUTHENTICATE ]'}
      </button>
     </p>
    </form>

    <button
     type="button"
     onClick={recoverPassword}
     disabled={recoveryLoading}
    >
     {recoveryLoading
      ? 'SENDING RESET EMAIL'
      : 'FORGOT PASSWORD?'}
    </button>

    {recoveryMessage&&
     <p
      className="mono sub"
      role="status"
     >
      {recoveryMessage}
     </p>
    }

    {message&&
     <p
      className="mono"
      role="alert"
      style={{color:'var(--crit)'}}
     >
      {message}
     </p>
    }
   </section>

   <div
    className="co mono"
    style={{
     position:'relative',
     marginTop:14
    }}
   >
    ENCRYPTED COMMAND CHANNEL · MATHVERSE
   </div>
  </main>
 </div>
}