# START_HERE

Quick startup and customization checklist for the current build.

## 1) Install and run

```bash
npm install
copy .env.example .env.local
npm run dev
```

Set `MONGODB_URI` in `.env.local`.

## 2) Know the modes

### Mongo mode (`MONGODB_URI` set)
- Users/tasks are persisted in MongoDB
- Admin APIs are fully enabled

### Fallback mode (`MONGODB_URI` missing)
- Demo user login works
- Demo admin login works
- Admin user edits are disabled (DB required)

Demo credentials:
- User: `demo@progr3s.dev` / `progress123`
- Admin: `admin@progr3s.dev` / `admin12345`

## 3) Key pages

- `/` landing
- `/login` auth
- `/dashboard` protected user workspace
- `/admin` protected admin console

## 4) Most important files

- `app/page.tsx`
- `app/login/page.tsx`
- `app/dashboard/page.tsx`
- `app/admin/page.tsx`
- `components/dashboard/DashboardClient.tsx`
- `components/admin/AdminPanelClient.tsx`
- `app/globals.css`
- `lib/auth.ts`
- `lib/session.ts`
- `lib/mongodb.ts`
- `lib/models/User.ts`
- `lib/models/Task.ts`

## 5) API map

- `app/api/auth/*`
- `app/api/dashboard/summary/route.ts`
- `app/api/dashboard/tasks/*`
- `app/api/admin/users/*`

## 6) Verify quality

```bash
npm run lint
npm run build
```

## 7) Full reference

See `docs/PRODUCT_GUIDE.md`.
