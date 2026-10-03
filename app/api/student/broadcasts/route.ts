import {NextResponse} from 'next/server'
import {getStudentSession} from '../../../../lib/student-session'
import {supabaseAdmin} from '../../../../lib/supabase-admin'

export async function GET(){
 const authenticated=await getStudentSession()
 if(!authenticated)return NextResponse.json({error:'Student session expired.'},{status:401,headers:{'Cache-Control':'private, no-store'}})
 const{data,error}=await supabaseAdmin.from('broadcasts').select('id,message,level,created_at')
  .gt('created_at',authenticated.session.created_at).order('id',{ascending:false}).limit(10)
 if(error)return NextResponse.json({error:'Unable to load broadcasts.'},{status:503,headers:{'Cache-Control':'private, no-store'}})
 return NextResponse.json({broadcasts:data||[]},{headers:{'Cache-Control':'private, no-store'}})
}
