import {readFile} from "node:fs/promises";
import {cert,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";

const [serviceAccountPath,email]=process.argv.slice(2);
if(!serviceAccountPath||!email){
  console.error('Usage: npm run admin:set -- "C:\\path\\service-account.json" "you@example.com"');
  process.exit(1);
}

try{
  const serviceAccount=JSON.parse(await readFile(serviceAccountPath,"utf8"));
  if(!serviceAccount.project_id||!serviceAccount.client_email||!serviceAccount.private_key)throw new Error("The selected file is not a Firebase service-account key");
  initializeApp({credential:cert({projectId:serviceAccount.project_id,clientEmail:serviceAccount.client_email,privateKey:serviceAccount.private_key})});
  const auth=getAuth(),user=await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
  await auth.revokeRefreshTokens(user.uid);
  console.log(`Admin access enabled for ${user.email} (${user.uid}).`);
  console.log("Sign out of Social Booster, then sign in again before opening /admin.");
}catch(error){
  console.error(`Could not enable admin access: ${error instanceof Error?error.message:"Unknown error"}`);
  process.exit(1);
}
