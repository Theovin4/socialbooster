import {cookies,headers} from "next/headers";import {after} from "next/server";import {z} from "zod";import {FieldValue} from "firebase-admin/firestore";import {adminAuth,adminDb} from "@/lib/firebase/admin";import {ensureApplicationUser} from "@/lib/firebase/application-user";import {SESSION_COOKIE} from "@/lib/firebase/session";import {sendAdminAlert} from "@/lib/email";
const bodySchema=z.object({idToken:z.string().min(100)}),MAX_AGE=60*60*24*5;
function trustedOrigin(origin:string|null){if(!origin)return false;try{const url=new URL(origin),app=new URL(process.env.NEXT_PUBLIC_APP_URL||"http://localhost:3000");return url.origin===app.origin||url.hostname==="localhost"}catch{return false}}
async function notifyNewSignup(uid:string,email?:string,name?:string){
  const event=adminDb().collection("adminNotificationEvents").doc(`signup_${uid}`),created=await event.create({type:"signup",userId:uid,status:"pending",createdAt:FieldValue.serverTimestamp()}).then(()=>true).catch(()=>false);
  if(!created)return;
  try{await sendAdminAlert({subject:"New Social Booster customer",title:"New customer signup",message:`${name||"A new customer"} created an account${email?` using ${email}`:""}.`,buttonLabel:"Open administration",buttonUrl:`${process.env.NEXT_PUBLIC_APP_URL||"https://www.socialbooster.net.ng"}/admin`});await event.set({status:"sent",sentAt:FieldValue.serverTimestamp()},{merge:true})}
  catch(error){await event.set({status:"failed",error:error instanceof Error?error.message:"Unknown error",updatedAt:FieldValue.serverTimestamp()},{merge:true}).catch(()=>undefined)}
}
export async function POST(request:Request){
  if(!trustedOrigin((await headers()).get("origin")))return Response.json({error:"Invalid origin"},{status:403});
  try{
    const{idToken}=bodySchema.parse(await request.json()),decoded=await adminAuth().verifyIdToken(idToken,true);
    if(Date.now()/1000-decoded.auth_time>300)return Response.json({error:"Recent sign-in required"},{status:401});
    const session=await adminAuth().createSessionCookie(idToken,{expiresIn:MAX_AGE*1000});
    (await cookies()).set(SESSION_COOKIE,session,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:MAX_AGE});
    after(async()=>{const results=await Promise.allSettled([ensureApplicationUser(decoded),notifyNewSignup(decoded.uid,decoded.email,decoded.name)]);for(const result of results)if(result.status==="rejected")console.error("[auth:session] post-login bootstrap failed",{userId:decoded.uid,error:result.reason instanceof Error?result.reason.message:"Unknown error"})});
    return Response.json({ok:true,admin:decoded.admin===true,emailVerified:decoded.email_verified===true});
  }catch{return Response.json({error:"Authentication failed"},{status:401})}
}
export async function DELETE(){(await cookies()).set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return Response.json({ok:true})}
