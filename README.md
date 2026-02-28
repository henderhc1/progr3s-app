# progr3s-dev

Next.js full-stack productivity app with role-based access:
- user login/session
- admin login/session
- protected dashboard
- admin console for user management
- MongoDB-backed data (with fallback demo mode when DB is not configured)
- multi-goal dashboard with status filters and completed folder
- sharing workflow with cross-user approval queue (`Shared With You`)
- month-aware completion calendar with streak marks and previous/next month navigation

## Documentation

- User guide: [USER_GUIDE.md](./USER_GUIDE.md)
- Developer guide: [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- MongoDB + Mongoose
- bcryptjs
- Tailwind import + custom CSS

## Project root

The active app root is this repository root (`progr3s-dev`).

## Setup

1. Install:

```bash
npm install
```

2. Configure env:

```bash
copy .env.example .env.local
```

Set at least:

```env
MONGODB_URI=your_mongodb_connection_string
DEMO_USER_EMAIL=demo@progr3s.dev
DEMO_USER_PASSWORD=your_demo_password
DEMO_ADMIN_EMAIL=admin@progr3s.dev
DEMO_ADMIN_PASSWORD=your_admin_password
```

Optional share email notifications:

```env
RESEND_API_KEY=your_resend_api_key
SHARE_NOTIFICATION_FROM=Progr3s <noreply@yourdomain.com>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

3. Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Folder structure

- `app/`: pages + API routes
- `components/`: UI and feature client components
- `lib/`: auth, DB connection, sessions, models
- `public/`: static assets

## Credentials and where to see them

- Credential source of truth is local `.env.local`.
- Demo/admin credential keys:
  - `DEMO_USER_EMAIL`
  - `DEMO_USER_PASSWORD`
  - `DEMO_ADMIN_EMAIL`
  - `DEMO_ADMIN_PASSWORD`
- Passwords are never returned by API and are not visible in the app UI.
- MongoDB stores only `passwordHash` in the `users` collection.
- To inspect users (email/name/role/active status), sign in as admin and open `/admin`.

## Roles

- `user`: dashboard access
- `admin`: `/admin` access only (goal dashboard and goal APIs are user-only)

### Admin capabilities (current)
- Create new users from `/admin` (default password: `defaultpass` unless custom value is provided in API).
- Edit user name/role/active state.
- Reset user passwords from `/admin` (defaults to `defaultpass`).
- Delete users (and their tasks). Self-delete is blocked for the current admin session.

## Routes

### Pages
- `/`
- `/login`
- `/signup`
- `/dashboard`
- `/admin` (admin-only)

### API
- `POST /api/auth/login`
- `POST /api/auth/signup`
- `POST /api/auth/logout` (recommended)
- `GET /api/auth/logout` (safe redirect, no session mutation)
- `GET /api/auth/session`
- `GET /api/health/database`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/tasks`
- `POST /api/dashboard/tasks`
- `PATCH /api/dashboard/tasks/[taskId]`
- `DELETE /api/dashboard/tasks/[taskId]`
- `GET /api/dashboard/peer-confirmations`
- `GET /api/dashboard/network`
- `POST /api/dashboard/network`
- `DELETE /api/dashboard/network`
- `POST /api/dashboard/tasks/[taskId]/confirm`
- `DELETE /api/dashboard/tasks/[taskId]/confirm`
- `GET /api/admin/users` (admin-only)
- `POST /api/admin/users` (admin-only)
- `PATCH /api/admin/users/[userId]` (admin-only)
- `DELETE /api/admin/users/[userId]` (admin-only)

## Data model (Mongo)

### User
- `email` (unique)
- `username` (unique, lowercase)
- `name`
- `passwordHash`
- `role` (`user` | `admin`)
- `isActive`
- `connections` (email list for connected users)

### Task
- `ownerEmail`
- `title`
- `status` (`not_started` | `in_progress` | `completed`)
- `done` (legacy compatibility flag)
- `scheduledDays` (0..6 weekday values)
- `completionDates` (`YYYY-MM-DD` date keys used for streak/calendar marks)
- `sharedWith` (emails for share visibility list)
- `verification`:
  - `mode` (`none` | `photo` | `geolocation` | `peer`)
  - `state` (`not_required` | `pending` | `submitted` | `verified`)
  - `proofLabel` (test proof metadata, e.g. file name)
  - `peerConfirmers` (emails allowed to confirm this goal)
  - `peerConfirmations` (email + timestamp records of completed confirmations)

## Sharing & Approval Rules

- Users connect with each other by username in the dashboard network section.
- Owners can share a goal only with users already in their network.
- Sharing UI now accepts usernames and resolves them to connected user emails on save.
- New share recipients receive an email notification when `RESEND_API_KEY` and `SHARE_NOTIFICATION_FROM` are configured.
- Shared recipients appear on the owner goal card (`Sharing with: ...`) and can be removed individually.
- Switching verification mode away from `peer` clears `sharedWith` recipients and stops sharing for that goal.
- Users see incoming shares in the `Shared With You` section (who shared and who else it is shared with).
- Shared goals are completed by recipient approval (`Approve Shared Goal`) instead of owner-completed status changes.
- When any shared recipient approves, the goal moves to completed and appears in the completed folder.
- Completed goals can be deleted from both the active list and completed folder.
- Completed filter behavior:
  - `Completed` view routes completed goals into the completed folder section (no duplicate rendering in the main list).

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`

## Notes

- Not classic MERN (no Express). This is Next.js + MongoDB full-stack.
- Session cookie format is intentionally simple for learning/demo and should be hardened for production.
- Session checks now keep users signed in during transient DB outages and return service errors instead of forcing logout.

## Troubleshooting Vercel Login

If login shows a client-side network failure on a deployed domain:

1. Confirm you are testing the correct project domain (especially if multiple Vercel projects exist).
2. Open `https://<your-domain>/api/health/database`:
   - `ok: true` means DB is reachable.
   - `503`/`500` means env or network access is broken.
3. Verify Vercel Production environment variables are set:
   - `MONGODB_URI`
   - `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`
   - `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`
4. If using MongoDB Atlas, confirm the Vercel egress IP can connect (temporary test: allow `0.0.0.0/0`, then tighten later).
5. Check browser DevTools `Network` for `POST /api/auth/login`:
   - If there is no request, the browser/client blocked it before reaching Vercel.
   - If request exists with non-JSON/5xx body, the login form now surfaces status and response text.
