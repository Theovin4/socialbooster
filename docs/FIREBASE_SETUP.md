# Firebase setup

## Create the project and web app

1. Open Firebase Console → **Add project** and create `socialbooster`.
2. Project overview → **Add app** → Web (`</>`) → nickname `Social Booster Web` → Register.
3. In **Project settings → General → Your apps → SDK setup and configuration → Config**, copy the six web values into the matching `NEXT_PUBLIC_FIREBASE_*` variables in Vercel.
4. Authentication → **Sign-in method** → enable **Email/Password**. Authentication → Settings → Authorized domains → add `socialbooster-sigma.vercel.app` and the final custom domain.
5. Firestore Database → **Create database** → Production mode → choose the closest appropriate region. The region cannot be changed later.

## Create server credentials

1. Firebase Console → Project settings → **Service accounts** → Firebase Admin SDK → **Generate new private key**.
2. Download the JSON once and store it securely. Do not commit or upload it to the browser.
3. Map `project_id` to `FIREBASE_PROJECT_ID`, `client_email` to `FIREBASE_CLIENT_EMAIL`, and the complete `private_key` to `FIREBASE_PRIVATE_KEY` in Vercel. Preserve its `BEGIN/END PRIVATE KEY` lines; Vercel supports multiline values.
4. Delete any local downloaded key after secure storage is confirmed. Rotate it immediately if exposed.

## Deploy rules and indexes

1. Install/login: `npx firebase-tools login`.
2. Select the project: `npx firebase-tools use --add`.
3. Deploy only database controls: `npx firebase-tools deploy --only firestore:rules,firestore:indexes`.
4. Use the Firebase Rules Playground and Emulator Suite to verify cross-user reads/writes are denied.

## Bootstrap the first admin

Create the user normally, then use a trusted local Admin SDK script or Cloud Shell to call `setCustomUserClaims(uid, { admin: true })`. Sign out and back in so a new token/session includes the claim. Never let clients assign custom claims.
