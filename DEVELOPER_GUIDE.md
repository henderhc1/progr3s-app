# Progr3s Developer Guide

This document is the technical guide for developing and maintaining Progr3s.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- MongoDB + Mongoose
- bcryptjs for password hashing
- Global styling in `app/globals.css`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
copy .env.example .env.local
```

3. Set required env values in `.env.local`:
- `MONGODB_URI`
- `DEMO_USER_EMAIL`
- `DEMO_USER_PASSWORD`
- `DEMO_ADMIN_EMAIL`
- `DEMO_ADMIN_PASSWORD`

Optional notification env values:
- `RESEND_API_KEY`
- `SHARE_NOTIFICATION_FROM`
- `NEXT_PUBLIC_APP_URL`

4. Run:

```bash
npm run dev
```

## Core App Areas

- `app/`: routes + API handlers
- `components/`: UI and feature clients
- `lib/`: domain logic (auth, sessions, tasks, maintenance, models)

High-traffic feature files:
- Dashboard UI: `components/dashboard/DashboardClient.tsx`
- Task normalization/utilities: `lib/tasks.ts`
- Weekly maintenance/reset logic: `lib/taskMaintenance.ts`
- Task API: `app/api/dashboard/tasks/route.ts`, `app/api/dashboard/tasks/[taskId]/route.ts`
- Auth API: `app/api/auth/login/route.ts`, `app/api/auth/signup/route.ts`
- Connections API: `app/api/dashboard/network/route.ts`
- Settings API: `app/api/settings/account/route.ts`

## Product Behavior (Current)

## Goals and routines
- `goalCadence` differentiates:
- `one_time` -> goals
- `weekly` -> routines

- Dashboard category tabs split goals and routines.
- Progress metric is category-aware:
- goals: completed goals / total goals
- routines: weekly completed routine units / weekly planned routine units

## Weekly reset behavior

Implemented in `applyTaskMaintenance` (`lib/taskMaintenance.ts`):
- Week start is local Sunday (`start.getDate() - start.getDay()`).
- For `weekly` routines only:
- done status/subtask completion from previous week is reset
- progress carries over only within the current week
- routine definitions/subtasks remain intact

Important: This is maintenance-driven reset logic and runs when tasks/summary/peer endpoints load and normalize tasks.

## Verification and sharing
- Verification modes: `photo`, `geolocation`, `peer`.
- `peer` mode is automatically merged when a task is shared.
- Shared items are completed by recipient confirmation flow.
- Share targets must be in the owner's accepted network.

## Authentication and account rules

## Signup
- Requires `name`, `email`, `username`, `password`.
- Username must be lowercase/normalized and unique.
- Password limits enforced (8 to 72 chars).
- Stored as bcrypt hash (`passwordHash`).

## Login
- Supports `identifier` as email or username.
- Password validation includes max length guard (72).
- Stored hash shape is validated before `bcrypt.compare`.
- Response session cookie is set via `SESSION_COOKIE_NAME`.

## Settings
- Password update requires current password + new password.
- New password is validated and hashed before save.
- Reset-data endpoint keeps account but clears user-owned task data and network links.
- Delete-account endpoint removes account and related references.

## Connections model

Connections are username-driven with request workflow:
- send request (`POST /api/dashboard/network`)
- accept/decline/cancel (`PATCH /api/dashboard/network`)
- remove connection (`DELETE /api/dashboard/network`)

Data fields (User model):
- `connections`
- `connectionRequestsIncoming`
- `connectionRequestsOutgoing`

## API Summary

Auth:
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`

Dashboard:
- `GET /api/dashboard/summary`
- `GET /api/dashboard/tasks`
- `POST /api/dashboard/tasks`
- `PATCH /api/dashboard/tasks/[taskId]`
- `DELETE /api/dashboard/tasks/[taskId]`
- `GET /api/dashboard/peer-confirmations`
- `POST /api/dashboard/tasks/[taskId]/confirm`
- `DELETE /api/dashboard/tasks/[taskId]/confirm`
- `GET|POST|PATCH|DELETE /api/dashboard/network`

Settings:
- `PATCH /api/settings/account` (change password)
- `POST /api/settings/account` (reset data)
- `DELETE /api/settings/account` (delete account)

Admin:
- `GET|POST /api/admin/users`
- `PATCH|DELETE /api/admin/users/[userId]`

## Data Model (Key Fields)

User:
- `email` (unique)
- `username` (unique)
- `name`
- `passwordHash`
- `role` (`user` | `admin`)
- `isActive`
- connection arrays

Task:
- `ownerEmail`
- `title`
- `goalCadence` (`one_time` | `weekly`)
- `status`, `done`
- `goalTasks`
- `scheduledDays`
- `completionDates`
- `verification` block
- `sharedWith`

## Dev Commands

- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Production start: `npm run start`

## Recommended Pre-PR Checklist

1. `npm run lint`
2. `npm run build`
3. Manual check:
- goals tab progress
- routines tab progress
- Sunday weekly reset behavior
- login with email and username
- connection request accept/decline/cancel flow
