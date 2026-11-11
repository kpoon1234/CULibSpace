# 🚀 CULibSpace - Quick Deployment & Testing Guide (Solution A)

This guide explains how to run CULibSpace locally and expose it securely over the internet for instructor evaluation, grading, and testing with **zero cloud costs** and **no cold starts**.

---

## 🛠️ Step 1: Run the Project Locally

You can choose either of the two ways below:

### Option 1: Full Docker Compose (Recommended for grading / Docker submission)
Spins up PostgreSQL, Backend, and Frontend inside isolated Docker containers:

```bash
# 1. Build and start all services (PostgreSQL, Backend, Frontend)
npm run docker:up

# 2. View logs in real-time
npm run docker:logs

# 3. Stop all services when finished
npm run docker:down
```

The database is automatically migrated and seeded with test data upon startup.

---

### Option 2: Hybrid Local Dev (Fastest for iterative coding)
Runs PostgreSQL in Docker, while running Backend & Frontend directly with Node.js on your Mac:

```bash
# 1. Start PostgreSQL
npm run db:up

# 2. (First time only) Reset and seed the database
npm run db:fresh

# 3. Start Frontend & Backend
npm run dev
```

* **Frontend:** [http://localhost:3000](http://localhost:3000)
* **Backend:** [http://localhost:8080](http://localhost:8080)

---

## 🌐 Step 2: Expose the App via ngrok (Static Domain)

To let your teacher or teammates test from any device with persistent Google OAuth support, use **ngrok** with your permanent static domain:

```bash
# Start ngrok tunnel pointing to Frontend port 3000
ngrok http --domain=<your-static-domain>.ngrok-free.dev 3000
# Example: ngrok http --domain=hatchet-crisped-recycled.ngrok-free.dev 3000
```

Set `CLIENT_URL` in `apps/backend/.env`:
```env
CLIENT_URL="https://<your-static-domain>.ngrok-free.dev"
```

All callback and checkout redirect URLs are automatically derived from `CLIENT_URL`.
```

### 3. Share the URL
Cloudflare will output a public HTTPS link in your terminal:
```text
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:                                          |
|  https://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.trycloudflare.com                           |
+--------------------------------------------------------------------------------------------+
```

Send this link to your teacher! 

> [!NOTE]
> All `/api/*` requests are automatically proxied by Next.js to the backend on port 8080. You only need to tunnel **port 3000**, preventing any mixed-content HTTPS/HTTP or CORS issues.

---

## 🏠 Step 3: Deploying on a Home Cloud Server / Custom Domain

If you or your friend are hosting the project on a home server (homelab, VPS, mini PC) with a custom domain or subdomain (e.g., `https://culib.yourdomain.com`):

### 1. Configure the Environment
Copy `.env.example` to `.env` in the repository root:
```bash
cp .env.example .env
```
Edit `.env` and set your public domain:
```env
CLIENT_URL="https://culib.yourdomain.com"
```
*(All OAuth redirects, Next.js proxying, and Stripe checkout return URLs will automatically derive from this domain)*

### 2. Reverse Proxy Setup (Port Forwarding / Nginx / Cloudflare Tunnel / Caddy)
Point your domain's reverse proxy directly to **Frontend port 3000**:
* **Frontend port:** `3000` (handles SSR and proxies `/api/*` requests to Backend on port 8080 internally)
* **SSL / TLS:** Terminated at your reverse proxy (e.g. Let's Encrypt or Cloudflare SSL)
* **Important Headers:** Ensure standard proxy headers are passed (`Host`, `X-Forwarded-Proto: https`, `X-Forwarded-Host`)

### 3. Database Data Persistence (No Data Loss on Restart)
PostgreSQL data is stored in a dedicated named Docker volume:
* **Volume Name:** `culibspace_postgres_data`
* **Restarting containers:**
  ```bash
  # Stop containers safely (keeps all database data, users, bookings, and tickets intact):
  docker compose down

  # Start containers again:
  docker compose up -d
  ```
> [!CAUTION]
> **Never run `docker compose down -v`** on your server! The `-v` flag deletes Docker volumes, which will wipe your database files. Regular `docker compose down` safely preserves all database volumes.

> [!NOTE]
> Database seeding (`prisma/seed.ts`) is equipped with an automatic safeguard: it only seeds if the database is completely empty. On every subsequent restart, it automatically skips seeding to prevent overwriting your existing user records and bookings. If you ever want to force a re-seed, run with `FORCE_SEED=true`.

---

## 🔑 Demo & Test Accounts (Pre-seeded)

When testing with your teacher, you can use the pre-seeded accounts:

### 1. Admin / Librarian Portal
* **URL:** `/login` (Toggle to Admin tab)
* **Email:** `admin@example.com`
* **Password:** `admin@example`
* **Capabilities:** Adjust user behavior credit scores, review issue tickets, inspect audit logs, and configure operating schedules.

### 2. General Users & Google OAuth
* **Local Testing:** Google OAuth redirects to `http://localhost:8080/api/auth/google/callback`.
* **Tunnel Testing:** If your teacher wants to test Google OAuth from their own device via the tunnel URL:
  1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
  2. Add the tunnel URL to **Authorized JavaScript origins** (`https://<your-tunnel>.trycloudflare.com`).
  3. Add the callback URL to **Authorized redirect URIs** (`http://localhost:8080/api/auth/google/callback` or backend proxy callback).
  4. Alternatively, use Admin Login which does not depend on third-party OAuth redirect domains.

---

## 🧹 Maintenance Commands

| Task | Command |
| :--- | :--- |
| Start Database only | `npm run db:up` |
| Stop Database only | `npm run db:down` |
| Reset & Re-seed Database | `npm run db:fresh` |
| Start all in Docker | `npm run docker:up` |
| Stop all in Docker | `npm run docker:down` |
| Follow Docker logs | `npm run docker:logs` |
