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
