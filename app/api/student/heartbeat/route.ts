import {NextRequest,NextResponse} from 'next/server'
import {getStudentSession} from '../../../../lib/student-session'
import {supabaseAdmin} from '../../../../lib/supabase-admin'

export async function POST(request:NextRequest){
 const origin=request.headers.get('origin')
 if(origin!==new URL(request.url).origin)return NextResponse.json({error:'Forbidden'},{status:403})
 const authenticated=await getStudentSession()
 if(!authenticated)return NextResponse.json({error:'Student session expired.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 const{error}=await supabaseAdmin.from('teams').update({last_seen:new Date().toISOString()}).eq('team_id',authenticated.session.team_id)
 return error?NextResponse.json({error:'Unable to update session.'},{status:503,headers:{'Cache-Control':'private, no-store'}}):NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}})
}
