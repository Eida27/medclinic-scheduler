# MedClinic Scheduler

Queue-based scheduling version for the CPU Medical Clinic physical examination and laboratory scheduling capstone.

## What This Version Builds

- Next.js App Router project
- PostgreSQL database access through `pg`
- Raw SQL schema and seed files
- Sample students, doctors, and schedule-day capacity rows
- `Generate Schedule` button
- Date-specific doctor unavailability entry with physical-exam recomputation
- Generated physical and laboratory queue appointment tables
- Automatic weekday overflow when a service reaches daily capacity

## 1. Install PostgreSQL

Install PostgreSQL for Windows with the default components, including Command Line Tools.

After installation, confirm `psql` works:

```powershell
psql --version
```

If PowerShell cannot find `psql`, add PostgreSQL's `bin` folder to PATH. It is usually similar to:

```text
C:\Program Files\PostgreSQL\18\bin
```

## 2. Create The Database

```powershell
createdb -U postgres medclinic_scheduler
```

## 3. Configure The App

Edit `.env.local` and replace `<your-password>` with your PostgreSQL `postgres` user password:

```env
DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/medclinic_scheduler
```

## 4. Load The Schema And Sample Data

Run these from the project folder:

```powershell
psql -U postgres -d medclinic_scheduler -f db/schema.sql
psql -U postgres -d medclinic_scheduler -f db/seed.sql
```

To reset the database while practicing:

```powershell
psql -U postgres -d medclinic_scheduler -f db/reset.sql
```

This project does not currently use database migrations. If you already loaded an older version of the schema, run the reset command above so the database replaces fixed `time_slots` with queue-based `schedule_days` and adds doctor unavailability tables.

## 5. Run The App

For local development:

```powershell
npm run dev
```

For local network access:

```powershell
npm run dev:network
```

Open:

```text
http://localhost:3000
```

From another device on the same network, use:

```text
http://<server-ip-address>:3000
```

## 6. Verify

```powershell
npm test
npm run lint
npm run build
```
