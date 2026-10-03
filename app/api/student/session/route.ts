import {createHash,randomBytes} from 'crypto'
import {NextRequest,NextResponse} from 'next/server'
import {supabaseAdmin} from '../../../../lib/supabase-admin'
import {getStudentSession} from '../../../../lib/student-session'

const invalid=()=>NextResponse.json({error:'Invalid Team ID or PIN.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
const sameOrigin=(request:NextRequest)=>request.headers.get('origin')===new URL(request.url).origin

export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Forbidden'},{status:403})
 let body:any
 try{body=await request.json()}catch{return invalid()}
 const teamId=typeof body.team_id==='string'?body.team_id:''
 const pin=typeof body.pin==='string'?body.pin:''
 const clientAddress=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown'
 const attemptKey=createHash('sha256').update(clientAddress+'|'+teamId.trim().toUpperCase()).digest('hex')
 const{data:limited,error:limitError}=await supabaseAdmin.rpc('student_auth_is_limited',{p_attempt_key:attemptKey})
 if(limitError)return NextResponse.json({error:'Authentication service unavailable.'},{status:503})
 if(limited)return invalid()
 const{data:team,error}=await supabaseAdmin.rpc('authenticate_team',{p_team:teamId,p_pin:pin})
 if(error)return NextResponse.json({error:'Authentication service unavailable.'},{status:503})
 if(!team){await supabaseAdmin.rpc('record_student_auth_failure',{p_attempt_key:attemptKey});return invalid()}
 await supabaseAdmin.rpc('clear_student_auth_failures',{p_attempt_key:attemptKey})
 const previous=await getStudentSession()
 const token=randomBytes(32).toString('hex')
 const expiresAt=new Date(Date.now()+12*60*60*1000)
 await supabaseAdmin.from('student_sessions').delete().lt('expires_at',new Date().toISOString())
 const{error:sessionError}=await supabaseAdmin.from('student_sessions').insert({
  team_id:team.team_id,token_hash:createHash('sha256').update(token).digest('hex'),expires_at:expiresAt.toISOString()
 })
 if(sessionError)return NextResponse.json({error:'Unable to create student session.'},{status:503})
 if(previous)await supabaseAdmin.from('student_sessions').delete().eq('id',previous.session.id)
 const response=NextResponse.json({team},{headers:{'Cache-Control':'private, no-store'}})
 response.cookies.set('mv_student_session',token,{
  httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/student',
  expires:expiresAt
 })
 return response
}

export async function GET(){
 const authenticated=await getStudentSession()
 if(!authenticated)return invalid()
 return NextResponse.json({team:authenticated.team},{headers:{'Cache-Control':'private, no-store'}})
}

export async function DELETE(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Forbidden'},{status:403})
 const authenticated=await getStudentSession()
 if(authenticated)await supabaseAdmin.from('student_sessions').delete().eq('id',authenticated.session.id)
 const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
 response.cookies.set('mv_student_session','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/student',maxAge:0})
 return response
}
