import {cookies,headers} from "next/headers";import {z} from "zod";import {adminAuth} from "@/lib/firebase/admin";import {SESSION_COOKIE} from "@/lib/firebase/session";
const bodySchema=z.object({idToken:z.string().min(100)}),MAX_AGE=60*60*24*5;
function trustedOrigin(origin:string|null){if(!origin)return false;try{const url=new URL(origin),app=new URL(process.env.NEXT_PUBLIC_APP_URL||"http://localhost:3000");return url.origin===app.origin||url.hostname==="localhost"}catch{return false}}
export async function POST(request:Request){
  if(!trustedOrigin((await headers()).get("origin")))return Response.json({error:"Invalid origin"},{status:403});
  try{
    const{idToken}=bodySchema.parse(await request.json()),decoded=await adminAuth().verifyIdToken(idToken);
    if(!decoded.email_verified)return Response.json({error:"Email verification required"},{status:403});
    if(Date.now()/1000-decoded.auth_time>300)return Response.json({error:"Recent sign-in required"},{status:401});
    const session=await adminAuth().createSessionCookie(idToken,{expiresIn:MAX_AGE*1000});
    (await cookies()).set(SESSION_COOKIE,session,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:MAX_AGE});
    return Response.json({ok:true,admin:decoded.admin===true});
  }catch{return Response.json({error:"Authentication failed"},{status:401})}
}
export async function DELETE(){(await cookies()).set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return Response.json({ok:true})}
