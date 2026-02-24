# progr3s-dev

Next.js full-stack productivity app with role-based access:
- user login/session
- admin login/session
- protected dashboard
- admin console for user management
- MongoDB-backed data (with fallback demo mode when DB is not configured)

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
- `admin`: dashboard + `/admin` access

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
- `GET /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/health/database`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/tasks`
- `POST /api/dashboard/tasks`
- `PATCH /api/dashboard/tasks/[taskId]`
- `DELETE /api/dashboard/tasks/[taskId]`
- `GET /api/admin/users` (admin-only)
- `PATCH /api/admin/users/[userId]` (admin-only)

## Data model (Mongo)

### User
- `email` (unique)
- `name`
- `passwordHash`
- `role` (`user` | `admin`)
- `isActive`

### Task
- `ownerEmail`
- `title`
- `done`

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`

## Notes

- Not classic MERN (no Express). This is Next.js + MongoDB full-stack.
- Session cookie format is intentionally simple for learning/demo and should be hardened for production.
