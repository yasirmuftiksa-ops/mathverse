# MATHVERSE Mission Control

Pages: `/` student mission portal, `/organizer` organizer login, `/organizer/dashboard` command center, and `/demo.html` offline demo.

## Setup

For a new Supabase project, run `supabase/schema.sql` once in the SQL Editor. Then run `supabase/phase2_security.sql`. For an existing Phase 1 project, run only the Phase 2 migration. Do not rerun the original non-idempotent schema on an existing project.

Create individual coordinator accounts in Supabase Auth. After the migration, promote the event owner to SUPER_ADMIN in the SQL Editor (replace the email):

```sql
update organizers o
set role = 'SUPER_ADMIN'
from auth.users u
where u.id = o.user_id and lower(u.email) = lower('owner@college.edu');
```

The existing organizer accounts become ADMIN by default. SUPER_ADMIN can add or change coordinator roles from the command center. Do not share coordinator passwords.

Copy `.env.local.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never rename it with a `NEXT_PUBLIC_` prefix or expose it in browser code. For production, set the same variables in the hosting provider and use the production site URL.

From the `mv` directory run:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000/organizer`. The protected `/organizer/dashboard`, `/admin/*`, and `/command-center/*` routes require an ADMIN or SUPER_ADMIN account.

## Teams And Roles

In the command center, add each team and assign its mission. Team creation generates a random six-digit PIN; it is shown once to the signed-in organizer. Existing Phase 1 teams have no PIN until an organizer selects GENERATE PIN. RESET PIN replaces the bcrypt hash and revokes that team's active student sessions. PIN hashes live in a table inaccessible to browser roles; the team monitor exposes only whether a PIN is configured.

Use the existing mission codes `MARS`, `RACE`, and `ROBOT` for MV-001, MV-002, and MV-003. `RACE` is the existing code for RACE DAY. Share each team PIN privately.

- SUPER_ADMIN: event control, teams and PINs, organizer roles, submissions/export, audit log, and reset/delete permissions.
- ADMIN: event and timer operations, team monitoring and PINs, broadcasts, challenge/final controls, and submission status. ADMIN cannot read submission answers, export submissions, manage organizer roles, or reset the event to standby.
- JUDGE: official submission read access and transmission view. Event-control RPCs and writes are denied by RLS.
- STUDENT: a Team ID + PIN login and a server-issued 12-hour HttpOnly session. Students do not use Supabase Auth.

## Security Model

The student API validates the Team ID and bcrypt-hashed PIN on the server, then stores only a SHA-256 hash of a random session token. Student endpoints derive the team and mission from that session and the current database assignment; client-supplied team or mission IDs are ignored. Ten failed PIN attempts for the same team/IP are throttled for 15 minutes. Invalid Team ID and invalid PIN both return `Invalid Team ID or PIN.`

The Next.js middleware verifies Supabase Auth and the organizer role before serving protected route shells. Database RLS and role-checking SECURITY DEFINER functions independently guard organizer data and event writes. Students receive Realtime only for shared event state and all-team broadcasts; mission content, teams, submissions, and audit records are not available through anonymous table access. Event state, timer, broadcasts, submissions, and audit history remain in Supabase for coordinator takeover from another device.

## Phase 2 Test Procedure

First create MV-001, MV-002, and MV-003 in the organizer page, assign MARS, RACE, and ROBOT respectively, and record each generated PIN. Use separate browser profiles or private windows for the teams so each has an independent session cookie.

1. **A: Valid credentials.** Enter MV-001 and its PIN. Confirm the MARS portal opens.
2. **B: Wrong PIN.** Enter MV-001 with a wrong PIN. Confirm the only credential error is `Invalid Team ID or PIN.`
3. **C: Team ID only.** Submit MV-001 with PIN blank. Confirm the same error as B.
4. **D: Cross-team access.** Log in as MV-001, then request `/api/student/mission?team_id=MV-002` and `/api/student/mission?mission_id=RACE`. Confirm both still return only the session's MARS mission. Repeat with MV-002 and MV-003.
5. **E: Mission tampering.** From the MV-001 session, send a submission request body containing `team_id: "MV-002"` and `mission_id: 5`. Confirm the server derives the team and mission from the session; do not transmit a real submission just for this check.
6. **F: Organizer route.** While signed in only as a student, open `/organizer`, `/admin`, and `/command-center`. Confirm each redirects to organizer login and no controls load.
7. **G: Organizer API/RPC.** From an unauthenticated browser session, attempt a direct anon-key call to `get_mission`, `submit_final`, or `timer_action`. Confirm it is denied. Confirm student API requests without the student cookie return 401.
8. **H: JUDGE.** Sign in as a JUDGE. Confirm submissions are viewable, event controls are absent, and calling `timer_action` or updating `mission_state` directly is denied.
9. **I: ADMIN.** Sign in as ADMIN from a second device. Confirm event phase/timer/broadcast/challenge/final operations and team monitoring work, while audit log, answer text, CSV export, and standby reset are unavailable.
10. **J: SUPER_ADMIN.** Confirm full event control, organizer role management, audit log, answer access, export, and reset permissions.
11. **K: Refresh.** Refresh each valid student portal. Confirm its authenticated team and assigned mission remain the same.
12. **L: Isolation.** Keep MV-001, MV-002, and MV-003 open in separate browser profiles. Confirm each portal remains on its own assigned mission while shared state and broadcasts update.

Regenerate one PIN after login and confirm the old PIN is rejected and the prior student session is revoked. Repeat the valid login with the new PIN.

## Validation Notes

The source TypeScript check is `npx tsc --noEmit`. The Phase 2 migration must be run and tested against the actual Supabase project; no database URL/credentials or local `psql` installation were available in this workspace, so the live A–L scenarios have not been executed here.

The app was advanced to Next.js `14.2.35` to address the known middleware bypass in the original `14.2.15` pin. `npm audit --omit=dev` still reports high/critical Next.js/PostCSS advisories whose published fix requires Next.js 16. The Phase 2 work intentionally does not force that major framework/React upgrade; production deployment should wait for a compatible framework security decision and full Phase 1 regression testing.
