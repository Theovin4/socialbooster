"use client";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {createUserWithEmailAndPassword,inMemoryPersistence,sendEmailVerification,sendPasswordResetEmail,setPersistence,signInWithEmailAndPassword,updateProfile} from "firebase/auth";
import {firebaseAuth} from "@/lib/firebase/client";

export function AuthForm({mode}:{mode:"login"|"register"|"reset"}){
  const router=useRouter();const[error,setError]=useState("");const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    const data=new FormData(event.currentTarget),email=String(data.get("email")||""),password=String(data.get("password")||""),name=String(data.get("name")||"");
    try{
      const auth=firebaseAuth();
      if(mode==="reset"){await sendPasswordResetEmail(auth,email);router.push("/login?reset=sent");return}
      await setPersistence(auth,inMemoryPersistence);
      if(mode==="register"){
        const credential=await createUserWithEmailAndPassword(auth,email,password);
        if(name)await updateProfile(credential.user,{displayName:name});
        await sendEmailVerification(credential.user);await auth.signOut();router.push("/login?confirmed=pending");return;
      }
      const credential=await signInWithEmailAndPassword(auth,email,password);
      if(!credential.user.emailVerified){await auth.signOut();throw new Error("Verify your email before signing in")}
      const idToken=await credential.user.getIdToken();
      const response=await fetch("/api/auth/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken})});
      if(!response.ok)throw new Error("Session creation failed");
      const session=await response.json() as {admin?:boolean};
      await auth.signOut();router.push(session.admin?"/admin":"/dashboard");router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Authentication failed");setBusy(false)}
  }
  return <form onSubmit={submit} style={{display:"grid",gap:14,marginTop:28}}>
    {mode==="register"&&<label>Full name<input className="field" name="name" autoComplete="name" minLength={2} maxLength={80} required/></label>}
    <label>Email<input className="field" name="email" type="email" autoComplete="email" required/></label>
    {mode!=="reset"&&<label>Password<input className="field" name="password" type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={10} maxLength={128} required/></label>}
    {mode==="register"&&<label style={{fontSize:13,color:"#aebbd5"}}><input type="checkbox" required/> I agree to the terms and acceptable use policy.</label>}
    {error&&<p role="alert" style={{color:"#ff9dba",margin:0}}>{error}</p>}
    <button className="btn primary" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":mode==="register"?"Create account":"Send reset link"}</button>
  </form>
}
