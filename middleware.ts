import {createServerClient} from '@supabase/ssr'
import {NextResponse,type NextRequest} from 'next/server'

export async function middleware(request:NextRequest){
 const path=request.nextUrl.pathname
 if(path==='/organizer'||path==='/organizer/login')return NextResponse.next()
 const response=NextResponse.next({request})
 const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  cookies:{
   getAll:()=>request.cookies.getAll(),
   setAll(values){values.forEach(({name,value})=>request.cookies.set(name,value));values.forEach(({name,value,options})=>response.cookies.set(name,value,options))}
  }
 })
 const{data:{user}}=await supabase.auth.getUser()
 let role:string|null=null
 if(user){const{data}=await supabase.from('organizers').select('role').eq('user_id',user.id).maybeSingle();role=data?.role||null}
 const organizer=path.startsWith('/organizer/')
 const admin=path==='/admin'||path.startsWith('/admin/')||path==='/command-center'||path.startsWith('/command-center/')
 if(!organizer&&!admin)return response
 if(!role){
  const destination=request.nextUrl.clone()
  destination.pathname='/organizer'
  destination.search=''
  return NextResponse.redirect(destination)
 }
 if((organizer||admin)&&role==='JUDGE'){
  const destination=request.nextUrl.clone()
  destination.pathname='/organizer'
  destination.search=''
  return NextResponse.redirect(destination)
 }
 return response
}

export const config={matcher:['/organizer/:path*','/admin/:path*','/command-center/:path*']}
