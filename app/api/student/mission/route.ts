import {NextResponse} from 'next/server'
import {getStudentSession} from '../../../../lib/student-session'
import {supabaseAdmin} from '../../../../lib/supabase-admin'

export async function GET(){
 const authenticated=await getStudentSession()
 if(!authenticated)return NextResponse.json({error:'Student session expired.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 const{data,error}=await supabaseAdmin.rpc('get_mission',{p_team:authenticated.session.team_id})
 if(error)return NextResponse.json({error:'Unable to load mission.'},{status:503,headers:{'Cache-Control':'private, no-store'}})
 if(!data)return NextResponse.json({error:'No mission is assigned.'},{status:404,headers:{'Cache-Control':'private, no-store'}})
 return NextResponse.json({mission:data},{headers:{'Cache-Control':'private, no-store'}})
}
