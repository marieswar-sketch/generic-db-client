# Generic Spin Wheel Backend

A separate spin-wheel backend starter built on a generic Postgres-compatible client.

It works with:
- local PostgreSQL through Docker Compose
- hosted PostgreSQL
- Supabase Postgres through a standard `DATABASE_URL`

This repo does not depend on `supabase-js`.

## What it includes

- reusable generic DB client
- local PostgreSQL via Docker Compose
- separate command to create spin-wheel tables automatically
- Express API for player registration, spin, state, and transfer requests

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

## Main commands

```bash
npm run db:create-tables
npm run db:test
npm run dev
```

## Default API routes

- `GET /health`
- `POST /api/players/register`
- `GET /api/players/:mobileNumber/state`
- `POST /api/spin`
- `POST /api/transfers`

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
