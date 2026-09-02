import {applicationDefault,cert,getApp,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

function privateKey(){return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,"\n")}
export function firebaseAdmin(){
  if(getApps().length)return getApp();
  const projectId=process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  const key=privateKey();
  if(projectId&&clientEmail&&key)return initializeApp({credential:cert({projectId,clientEmail,privateKey:key}),projectId});
  if(projectId)return initializeApp({credential:applicationDefault(),projectId});
  throw new Error("Firebase Admin credentials are not configured");
}
export function adminAuth(){return getAuth(firebaseAdmin())}
export function adminDb(){return getFirestore(firebaseAdmin())}
