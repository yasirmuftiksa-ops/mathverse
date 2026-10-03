import {createHash} from 'crypto'
import {cookies} from 'next/headers'
import {supabaseAdmin} from './supabase-admin'

export async function getStudentSession(){
 const token=cookies().get('mv_student_session')?.value
 if(!token)return null
 const tokenHash=createHash('sha256').update(token).digest('hex')
 const{data:session}=await supabaseAdmin.from('student_sessions').select('id,team_id,created_at')
  .eq('token_hash',tokenHash).gt('expires_at',new Date().toISOString()).maybeSingle()
 if(!session)return null
 const{data:team}=await supabaseAdmin.from('teams')
  .select('team_id,team_name,mission:missions(code,title,tagline,theme)').eq('team_id',session.team_id).maybeSingle()
 if(!team)return null
 await supabaseAdmin.from('student_sessions').update({last_seen:new Date().toISOString()}).eq('id',session.id)
 return{session,team}
}
