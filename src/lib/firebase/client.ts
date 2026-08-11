"use client";
import {getApp,getApps,initializeApp} from "firebase/app";
import {getAuth} from "firebase/auth";

const config={
  apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function firebaseClient(){
  if(!config.apiKey||!config.projectId||!config.appId)throw new Error("Firebase web configuration is incomplete");
  return getApps().length?getApp():initializeApp(config);
}
export function firebaseAuth(){return getAuth(firebaseClient())}
