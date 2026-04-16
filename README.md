# Generic Spin Wheel Backend

A separate spin-wheel project that ports the core behavior of the older Dostt spin-wheel app into a generic Postgres-based stack.

It works with:
- local PostgreSQL through Docker Compose
- hosted PostgreSQL
- Supabase Postgres through a standard `DATABASE_URL`

This repo does not depend on `supabase-js`.

## What it includes

- reusable generic DB client
- local PostgreSQL via Docker Compose
- separate command to create spin-wheel tables automatically
- served frontend with login, wheel, countdowns, tester panel, reward modal, transfer modal
- Express API for player registration, spin, state, transfers, tester reset, and public config
- deterministic daily reward logic from the older repo
- tester-only forced rewards and custom transfer amounts
- once-per-day transfer restriction for normal users
- optional Redash + Dostt + Slack transfer integration through environment variables

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies:
   `npm install`
3. Start local PostgreSQL:
   `docker compose up -d`
4. Create the spin-wheel tables:
   `npm run db:create-tables`
5. Test database connectivity:
   `npm run db:test`
6. Start the backend:
   `npm run dev`
7. Open:
   `http://localhost:3000`

## Main commands

```bash
npm run db:create-tables
npm run db:test
npm run dev
```

## Default API routes

- `GET /health`
- `GET /api/config`
- `POST /api/players/register`
- `GET /api/players/:mobileNumber/state`
- `POST /api/spin`
- `POST /api/transfers`
- `POST /api/test/reset`

## Example `.env`

### Local PostgreSQL

```env
DATABASE_URL=postgresql://app_user:app_password@localhost:5432/app_db
DB_SSL=false
PORT=3000
```

### Supabase Postgres

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
DB_SSL=true
PORT=3000
```

## Transfer integration

Set `TRANSFER_MODE=mock` for local testing with no external provider.

To mimic the older repo's transfer flow, set:

```env
TRANSFER_MODE=provider
REDASH_API_KEY=...
REDASH_QUERY_ID=...
DOSTT_AUTH_KEY=...
SLACK_WEBHOOK_URL=...
```

If these are not configured, the app can still run locally in mock mode.
