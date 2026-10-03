import {NextRequest,NextResponse} from 'next/server'
import {getStudentSession} from '../../../../lib/student-session'
import {supabaseAdmin} from '../../../../lib/supabase-admin'

export async function GET(){
 const authenticated=await getStudentSession()
 if(!authenticated)return NextResponse.json({error:'Student session expired.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 const{data,error}=await supabaseAdmin.from('submissions').select('*').eq('team_id',authenticated.session.team_id).maybeSingle()
 if(error)return NextResponse.json({error:'Unable to load submission.'},{status:503,headers:{'Cache-Control':'private, no-store'}})
 return NextResponse.json({submission:data},{headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(request:NextRequest){
 const origin=request.headers.get('origin')
 if(origin!==new URL(request.url).origin)return NextResponse.json({error:'Forbidden'},{status:403})
 const authenticated=await getStudentSession()
 if(!authenticated)return NextResponse.json({error:'Student session expired.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 let body:any
 try{body=await request.json()}catch{return NextResponse.json({error:'Invalid submission.'},{status:400,headers:{'Cache-Control':'private, no-store'}})}
 const text=(key:string)=>typeof body[key]==='string'?body[key]:''
 const{data,error}=await supabaseAdmin.rpc('submit_final',{
  p_team:authenticated.session.team_id,p_pu:text('pu'),p_ma:text('ma'),p_fs:text('fs'),
  p_ad:text('ad'),p_fj:text('fj'),p_ai:text('ai'),p_aix:text('aix')
 })
 if(error)return NextResponse.json({error:error.message},{status:400,headers:{'Cache-Control':'private, no-store'}})
 return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}})
}
