# Progr3s Product Guide (Admin + User Build)

## 1) Overview

Current build includes:
- landing and marketing sections
- login/session auth
- role-based access (`user`, `admin`)
- protected dashboard
- admin console for user management
- MongoDB persistence via Mongoose
- fallback demo mode when DB is not configured

## 2) Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- MongoDB + Mongoose
- bcryptjs
- Tailwind import + custom CSS

## 3) Roles and permissions

### user
- can log in
- can access `/dashboard`
- can manage own tasks

### admin
- all user permissions
- can access `/admin`
- can view all users
- can update user `name`, `role`, `isActive`

## 4) Credentials in fallback mode

- User: `demo@progr3s.dev` / `progress123`
- Admin: `admin@progr3s.dev` / `admin12345`

## 5) Environment

Create `.env.local`:

```env
MONGODB_URI=your_mongodb_connection_string
```

If missing, app uses fallback mode.

## 6) Routes

### Pages
- `/` -> `app/page.tsx`
- `/login` -> `app/login/page.tsx`
- `/dashboard` -> `app/dashboard/page.tsx`
- `/admin` -> `app/admin/page.tsx`

### API
- `POST /api/auth/login` -> `app/api/auth/login/route.ts`
- `GET /api/auth/logout` -> `app/api/auth/logout/route.ts`
- `GET /api/auth/session` -> `app/api/auth/session/route.ts`
- `GET /api/dashboard/summary` -> `app/api/dashboard/summary/route.ts`
- `GET /api/dashboard/tasks` -> `app/api/dashboard/tasks/route.ts`
- `POST /api/dashboard/tasks` -> `app/api/dashboard/tasks/route.ts`
- `PATCH /api/dashboard/tasks/[taskId]` -> `app/api/dashboard/tasks/[taskId]/route.ts`
- `DELETE /api/dashboard/tasks/[taskId]` -> `app/api/dashboard/tasks/[taskId]/route.ts`
- `GET /api/admin/users` -> `app/api/admin/users/route.ts`
- `PATCH /api/admin/users/[userId]` -> `app/api/admin/users/[userId]/route.ts`

## 7) Data model

### User (`lib/models/User.ts`)
- `email` unique
- `name`
- `passwordHash`
- `role` (`user` | `admin`)
- `isActive`
- timestamps

### Task (`lib/models/Task.ts`)
- `ownerEmail`
- `title`
- `done`
- timestamps

## 8) Session/auth internals

- Cookie name: `progr3s_session`
- Session format: `session:<email>`
- Session identity helper: `lib/session.ts`
- Role checks happen in page guards and admin API routes

## 9) Frontend architecture

### Server pages
- `app/page.tsx`
- `app/login/page.tsx`
- `app/dashboard/page.tsx`
- `app/admin/page.tsx`

### Client components
- `components/ui/LoginForm.tsx`
- `components/ui/ProgressPlayground.tsx`
- `components/dashboard/DashboardClient.tsx`
- `components/admin/AdminPanelClient.tsx`

## 10) Styling

Main style file: `app/globals.css`

Includes:
- layout and card system
- dashboard UI styles
- admin table and controls
- responsive behavior for mobile

## 11) Storage behavior

### Mongo mode
- login validates users with bcrypt hash compare
- tasks and summaries from DB
- admin edits persist in DB

### Fallback mode
- demo user/admin login available
- dashboard data uses fallback responses
- admin user edits require DB and are blocked

## 12) Project structure

```text
app/
  admin/page.tsx
  dashboard/page.tsx
  login/page.tsx
  api/
    auth/
    dashboard/
    admin/
components/
  ui/
  dashboard/
  admin/
lib/
  auth.ts
  session.ts
  mongodb.ts
  models/
docs/
  START_HERE.md
  PRODUCT_GUIDE.md
```

## 13) Scripts

- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`

## 14) Key customization points

- Theme and visual style: `app/globals.css`
- Dashboard behavior: `components/dashboard/DashboardClient.tsx`
- Admin behavior/UI: `components/admin/AdminPanelClient.tsx`
- Auth logic: `app/api/auth/login/route.ts`, `lib/session.ts`
- Permissions model: `lib/models/User.ts`, admin API routes

## 15) Production hardening TODO

- Replace simple session format with signed/encrypted sessions
- Add CSRF protection for state-changing routes
- Add rate limiting for auth/admin endpoints
- Add audit logs for admin actions
- Add automated tests
