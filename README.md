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

## Setup

1. Install:

```bash
npm install
```

2. Configure env:

```bash
copy .env.example .env.local
```

Set:

```env
MONGODB_URI=your_mongodb_connection_string
```

3. Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Demo credentials (fallback mode)

- User: `demo@progr3s.dev` / `progress123`
- Admin: `admin@progr3s.dev` / `admin12345`

## Roles

- `user`: dashboard access
- `admin`: dashboard + `/admin` access

## Routes

### Pages
- `/`
- `/login`
- `/dashboard`
- `/admin` (admin-only)

### API
- `POST /api/auth/login`
- `GET /api/auth/logout`
- `GET /api/auth/session`
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
- Session cookie format is simple for learning/demo and should be hardened for production.

## Docs

- `docs/START_HERE.md`
- `docs/PRODUCT_GUIDE.md`
- Downloadable: `public/PRODUCT_GUIDE.md`, `public/PRODUCT_GUIDE.txt`, `public/PRODUCT_GUIDE_v2.docx`
