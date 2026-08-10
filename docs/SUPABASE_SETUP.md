# Supabase setup

1. Create a production project at Supabase, choose the closest region, and store the database password securely.
2. In **Project Settings → API Keys**, copy the Project URL, publishable key, and server secret key into Vercel. The secret key is server-only.
3. Install the Supabase CLI, run `supabase link --project-ref <ref>`, review `supabase/migrations`, then run `supabase db push`.
4. In **Authentication → URL Configuration**, set Site URL to `https://socialbooster.vercel.app` and add local/Preview callback URLs deliberately.
5. Enable email confirmation and configure the reset/confirmation email templates. Redirect confirmation to `/api/auth/callback` once that production callback is enabled.
6. Confirm RLS is enabled. Run database advisors. The migration intentionally denies client writes to wallets, orders, roles, payment events and ledger rows.

First admin: register normally, then use the SQL editor while authenticated as the database owner: `insert into public.roles(user_id, role) values ('USER_UUID','admin');`. Find the UUID under Authentication → Users. Never expose a role-elevation endpoint or rely on user metadata.
