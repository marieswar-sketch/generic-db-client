# Generic DB Client

A separate, non-Supabase-specific database client that works with:
- local PostgreSQL
- hosted PostgreSQL
- Supabase Postgres through a normal Postgres connection string

This keeps the implementation generic by using `pg` only.

## Files

- `src/db.js`: reusable Postgres-compatible database client
- `src/index.js`: small demo script
- `scripts/create-table.js`: command to create the table automatically
- `scripts/test-connection.js`: command to verify DB connectivity
- `sql/create_app_users.sql`: table definition
- `docker-compose.yml`: local PostgreSQL setup

## Setup

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Start the database with `docker compose up -d`
4. Create the table with `npm run db:create-table`
5. Test connectivity with `npm run db:test`
6. Run the sample flow with `npm start`

## Connection model

Set `DATABASE_URL` to any Postgres-compatible database.

Example local PostgreSQL:

```env
DATABASE_URL=postgresql://app_user:app_password@localhost:5432/app_db
DB_SSL=false
```

Example Supabase Postgres:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
DB_SSL=true
```

## Main command

To create the table automatically:

```bash
npm run db:create-table
```
