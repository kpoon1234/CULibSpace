# CULibSpace Deployment Guide (Docker Compose + Cloudflare Tunnel)

This setup maps container port `3000` of `frontend` to host port `127.0.0.1:64000` on your Ubuntu server, which your server's existing Cloudflare Tunnel forwards from `https://culibspace.andyntk.online`. Next.js proxies `/api/*` to the internal `backend` container over Docker's private bridge network, while `postgres` and `backend` stay unexposed to the public internet.

---

## 1. Prerequisites on Ubuntu Server

- Docker Engine & Docker Compose plugin (`docker compose version`)
- Existing `cloudflared` tunnel running on the Ubuntu host

---

## 2. Configure Environment Files

### Root `.env` (Docker Compose)

```bash
cp .env.example .env
```

Recommended overrides in `.env`:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=culibspace
POSTGRES_PORT=5432
FRONTEND_BIND=127.0.0.1
FRONTEND_PORT=64000
```

### Backend `apps/backend/.env`

```bash
cp apps/backend/.env.example apps/backend/.env
```

Set these values for `https://culibspace.andyntk.online`:

```env
PORT=8080
NODE_ENV=production
CLIENT_URL="https://culibspace.andyntk.online"
TRUST_PROXY="172.16.0.0/12,192.168.0.0/16,loopback"

JWT_SECRET="<generate-with-openssl-rand-hex-32>"
SESSION_SECRET="<generate-with-openssl-rand-hex-32>"

GOOGLE_CLIENT_ID="<your-google-client-id>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<your-google-client-secret>"
GOOGLE_CALLBACK_URL="https://culibspace.andyntk.online/api/auth/google/callback"

PAYMENT_GATEWAY="stripe"
PAYMENT_GATEWAY_TIMEOUT_MS="10000"
STRIPE_SECRET_KEY="sk_test_<your-stripe-test-secret-key>"
STRIPE_WEBHOOK_SECRET="whsec_<your-stripe-webhook-signing-secret>"
TICKET_CHECKOUT_SUCCESS_URL="https://culibspace.andyntk.online/tickets/success"
TICKET_CHECKOUT_CANCEL_URL="https://culibspace.andyntk.online/tickets/cancel"
```

> `DATABASE_URL` is automatically overridden inside `backend` and `migrate` containers to connect to `postgres:5432` using `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`.

---

## 3. External API Configuration

### A. Cloudflare Zero Trust Tunnel

In **Cloudflare One / Zero Trust -> Networks -> Connectors** (on your existing Ubuntu server tunnel):

1. Add a **Published Application Route** (Public Hostname):
   - **Public Hostname:** `culibspace.andyntk.online`
   - **Service Type:** `HTTP`
   - **Service URL:** `http://127.0.0.1:64000` (or `http://localhost:64000`)
2. *(Recommended)* Add a **Cloudflare Access** policy in front of `culibspace.andyntk.online` (email allowlist for teammates/instructors) while testing.

### B. Google Cloud Console (OAuth 2.0)

In **APIs & Services -> Credentials -> OAuth 2.0 Client IDs**:

- **Authorized JavaScript origins:**
  - `https://culibspace.andyntk.online`
- **Authorized redirect URIs:**
  - `https://culibspace.andyntk.online/api/auth/google/callback`

### C. Stripe Dashboard (Test Mode)

1. Switch Stripe Dashboard to **Test mode**.
2. Copy **Secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY`.
3. Under **Developers -> Webhooks -> Add endpoint**:
   - **Endpoint URL:** `https://culibspace.andyntk.online/api/tickets/payment/webhook`
   - **Events to listen for:**
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
   - Copy the **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

---

## 4. Build, Start, and Initial Seed

```bash
# 1. Build images and start postgres -> migrate -> backend -> frontend
npm run docker:up

# 2. First-time setup only: seed demo data
# (Equipped with safeguard: automatically skips if data already exists to protect live records; use FORCE_SEED=true to reset)
npm run docker:seed

# 3. Inspect logs
npm run docker:logs
```

### Seeded Demo Admin Accounts

- **Login URL:** `/login` (Admin tab)
- **Emails:** `admin@chula.ac.th` or `somsak@chula.ac.th`
- **Password:** `admin@example`

---

## 5. Updating from `main` & Backing Up PostgreSQL

Before pulling new `main` changes that may introduce Prisma migrations:

```bash
# 1. Back up the database
docker compose exec -T postgres pg_dump -U postgres culibspace > "backup-$(date +%Y%m%d-%H%M%S).sql"

# 2. Merge latest main into feature/deployment
git fetch origin
git merge origin/main

# 3. Rebuild and restart containers (migrate runs `prisma migrate deploy` automatically)
npm run docker:up
```
