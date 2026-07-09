# Mr Bakr Accounting App

Private internal accounting system for student groups, monthly billing, payments, screenshot imports, arrears reports, and staff permissions.

## Project Structure

- `backend`: NestJS API with Prisma and PostgreSQL.
- `frontend`: Next.js dashboard.
- `docs`: working notes and implementation handoff files.

## Local Setup

1. Install dependencies in both apps:

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

2. Copy environment examples:

```powershell
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

3. Fill `backend\.env` with the real database URL, strong secrets, and the first admin account values.

4. Prepare the database:

```powershell
cd backend
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

5. Run locally:

```powershell
cd backend
npm run start:dev

cd ..\frontend
npm run dev
```

Frontend runs on `http://localhost:3002` when started with the existing local port setup. Backend uses `http://localhost:3003`.

## Deployment Notes

Do not commit real `.env` files, backups, logs, import previews, screenshots, or exported accounting data. Use a private GitHub repository, then configure hosting environment variables directly on the hosting provider.
