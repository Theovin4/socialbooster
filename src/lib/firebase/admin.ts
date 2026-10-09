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
export function productionFirestoreBlocked(environment: Record<string, string | undefined> = process.env) {
  if (environment.FIRESTORE_EMULATOR_HOST) return false;
  if (environment.ALLOW_PRODUCTION_FIRESTORE === "true") return false;
  // Vercel runtimes explicitly identify their deployment environment. Local
  // development, CI and test processes do not and are blocked by default.
  return !environment.VERCEL_ENV;
}
export function adminDb(){
  if(productionFirestoreBlocked()) throw new Error("Production Firestore access is blocked outside Vercel. Start the Firebase emulator or explicitly set ALLOW_PRODUCTION_FIRESTORE=true for an approved maintenance task.");
  return getFirestore(firebaseAdmin());
}
