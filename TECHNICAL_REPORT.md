# PrintRUSH Lopez — Technical Report

**Project:** PrintRUSH Lopez Smart Queue Management System
**Type:** Multi-Tenant Progressive Web Application (PWA) + Native Desktop Agent
**Scope:** Municipality of Lopez, Quezon, Philippines
**Version:** 1.0.0
**Date:** May 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Frontend — PWA](#5-frontend--pwa)
6. [Backend — Supabase](#6-backend--supabase)
7. [Desktop Agent](#7-desktop-agent)
8. [Database Schema](#8-database-schema)
9. [Security Design](#9-security-design)
10. [API & Integrations](#10-api--integrations)
11. [Deployment Infrastructure](#11-deployment-infrastructure)
12. [Design System](#12-design-system)
13. [File & Directory Structure](#13-file--directory-structure)
14. [Known Limitations & Future Work](#14-known-limitations--future-work)

---

## 1. Executive Summary

PrintRUSH Lopez is a locally-deployed, multi-tenant SaaS platform designed to modernize campus printing shops in the Municipality of Lopez, Quezon. It replaces physical queues with a cloud-synchronized print queue system accessible via any mobile device or desktop browser.

The platform consists of three tightly integrated layers:

- A **Progressive Web Application (PWA)** for both students (ordering) and shop owners (managing the queue).
- A **Supabase** backend handling database, real-time subscriptions, authentication, file storage, and serverless Edge Functions.
- A **native Windows Desktop Agent** (Electron) that bridges the gap for walk-in customers without internet access by intercepting Bluetooth file transfers and syncing them to the cloud queue.

---

## 2. Problem Statement

Campus printing shops in Lopez, Quezon face recurring operational issues:

- Students queue physically for 15–20 minutes per job even for simple document prints.
- Shop owners have no digital record of pending, in-progress, or completed jobs.
- Walk-in customers without internet access cannot participate in a digital queue.
- Spam and abuse (submitting dozens of jobs) disrupts fair queue ordering.
- No payment integration forces cash-only transactions with no receipts.

PrintRUSH directly addresses all five pain points through its integrated online + offline architecture.

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     STUDENTS / CUSTOMERS                     │
│  Mobile Browser / Desktop Browser / Installed PWA            │
└───────────────────────┬──────────────────────────────────────┘
                        │  HTTPS + WebSockets
┌───────────────────────▼──────────────────────────────────────┐
│                    PWA FRONTEND (Vercel)                      │
│  index.html · order.html · tracker.html · confirmation.html  │
│  Vanilla JS + Custom CSS Design System (CMYK tokens)         │
│  Service Worker → Offline-capable                            │
└───────────────────────┬──────────────────────────────────────┘
                        │  Supabase JS SDK v2
┌───────────────────────▼──────────────────────────────────────┐
│                  SUPABASE BACKEND                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ PostgreSQL  │  │  Realtime    │  │    Edge Functions    │ │
│  │ + PostGIS   │  │  WebSockets  │  │  (Deno / TypeScript) │ │
│  │ + RLS       │  │  (live queue)│  │  payment-webhook     │ │
│  └─────────────┘  └──────────────┘  │  dispatch-delivery   │ │
│  ┌─────────────┐  ┌──────────────┐  │  notify-push         │ │
│  │  Auth       │  │  Storage     │  │  send-agent-email    │ │
│  │  (JWT/OTP)  │  │  (file URLs) │  │  mock-payment-status │ │
│  └─────────────┘  └──────────────┘  └──────────────────────┘ │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│              DESKTOP AGENT (Electron / Win32)                 │
│  Wraps Owner Portal PWA + injects Node.js capabilities       │
│  pdf-to-printer → Silent Print                               │
│  chokidar → Bluetooth file watcher                           │
│  electron-updater → Auto-update from GitHub Releases         │
└──────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Model

Each registered printing shop is a **tenant**. All database tables include a `shop_id` foreign key, and Row Level Security (RLS) policies on PostgreSQL ensure that owners can only read and write data belonging to their own shop. A `platform_admins` table provides a Super Admin portal for centralized management.

---

## 4. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (ES Modules) | Zero framework overhead; instant load on 3G |
| Styling | Custom CSS Design Tokens (CMYK system) | Full control, no build step, consistent theming |
| PWA | Service Worker + Web App Manifest | Offline capability, installable on iOS/Android/Desktop |
| Backend-as-a-Service | Supabase (PostgreSQL 15 + PostGIS) | Real-time, Auth, Storage, RLS — fully managed |
| Serverless Functions | Supabase Edge Functions (Deno) | Isolated, secure server-side logic |
| Desktop Agent | Electron v34 (Node.js) | Native Win32 printing, Bluetooth file watching |
| Desktop Build | electron-builder (portable .exe) | Single-file distribution, no installer needed |
| Auto-Update | electron-updater + GitHub Releases | Zero-touch updates for shop owners |
| Hosting | Vercel (Static / Edge Network) | Auto-HTTPS, global CDN, zero config |
| Maps | Leaflet.js + OpenStreetMap | Zero-cost, no API key required |
| Anti-Spam | FingerprintJS (open-source) + hCaptcha | Bot and spam prevention without accounts |
| Push Notifications | Web Push API (VAPID) | Native browser push, no third-party service fee |
| Payments (sandbox) | Internal simulation + PayMongo-ready | Simulates GCash/Maya; ready for real integration |
| Delivery (sandbox) | Internal simulation + Shipmates-ready | Simulates courier tracking |

---

## 5. Frontend — PWA

### Pages

| File | Role | User |
|---|---|---|
| `index.html` | Landing page, shop locator map (Leaflet) | Public |
| `order.html` | Multi-step order wizard (file upload, options, payment) | Student |
| `tracker.html` | Real-time job status tracker via job token | Student |
| `confirmation.html` | Post-order success screen with job token | Student |
| `payment.html` | Payment gateway redirect / callback handler | Student |
| `owner/login.html` | Owner authentication page | Owner |
| `owner/dashboard.html` | Summary statistics, revenue, job counts | Owner |
| `owner/queue.html` | Live Kanban board (drag-and-drop job management) | Owner |
| `owner/inventory.html` | Ink, paper, consumables tracker | Owner |
| `owner/services.html` | Pricing and service catalog management | Owner |
| `owner/settings.html` | Shop profile, logo, delivery fees, subscription | Owner |
| `admin/index.html` | Super Admin login | Super Admin |
| `admin/dashboard.html` | Platform-wide shop management | Super Admin |

### JavaScript Modules (`js/`)

| Module | Description |
|---|---|
| `js/config.js` | Supabase URL, anon key, app URL, shop ID |
| `js/lib/supabase.js` | Supabase client singleton |
| `js/lib/push.js` | Web Push VAPID subscription handler |
| `js/sw.js` | Service Worker (cache-first, offline fallback) |
| `js/student/order.js` | Order wizard logic, file upload, hCaptcha |
| `js/student/tracker.js` | Real-time job status polling |
| `js/student/locator.js` | Leaflet map, geolocation, proximity search |
| `js/owner/auth.js` | Supabase Auth sign-in / session management |
| `js/owner/dashboard.js` | Revenue charts, job statistics |
| `js/owner/queue-board.js` | Kanban board, drag-drop, real-time updates |
| `js/owner/inventory.js` | Inventory CRUD, low-stock alerts |
| `js/owner/services.js` | Service catalog CRUD |
| `js/owner/settings.js` | Shop settings, map location picker |
| `js/owner/layout.js` | Sidebar navigation, theme toggle |

### PWA Features

- **Service Worker** (`js/sw.js`): Implements cache-first strategy. Critical assets are pre-cached at install time. Provides full offline fallback for the owner dashboard.
- **Web App Manifest** (`manifest.json`): Enables installation on iOS (Add to Home Screen), Android, and desktop Chrome. Configures app shortcuts for "Join Queue" and "Track My Job".
- **Share Target API**: The PWA registers as a file share target. Students can share a document directly from their file manager into the order form.

---

## 6. Backend — Supabase

### Services Used

| Service | Usage |
|---|---|
| **PostgreSQL + PostGIS** | Primary relational database with geospatial queries |
| **Row Level Security** | Enforces tenant isolation at the database layer |
| **Supabase Auth** | JWT-based authentication for shop owners and admins |
| **Supabase Storage** | Stores uploaded print files (PDFs, images, DOCX) |
| **Supabase Realtime** | WebSocket channels for live queue board updates |
| **Edge Functions (Deno)** | Server-side payment, delivery, and push notification logic |

### Edge Functions

| Function | Trigger | Purpose |
|---|---|---|
| `payment-webhook` | HTTP POST from payment gateway | Verifies and records payment confirmation |
| `mock-payment-status` | HTTP GET (polling) | Simulates sandbox payment status changes |
| `create-payment` | HTTP POST from order form | Creates payment intent record |
| `dispatch-delivery` | HTTP POST from owner queue | Initiates delivery booking (sandbox/Shipmates) |
| `delivery-status` | HTTP GET (polling) | Returns current delivery tracking stage |
| `notify-push` | Called internally after job status change | Sends Web Push notification to customer |
| `send-agent-email` | Called on new walk-in job | Emails shop owner if desktop agent is offline |

---

## 7. Desktop Agent

The Desktop Agent is a native Windows application built on **Electron v34**. It is distributed as a portable `.exe` (no installation required) via GitHub Releases.

### Architecture

The agent follows a **Hybrid Shell** pattern:

1. It opens a `BrowserWindow` and loads the live production PWA URL (`APP_URL`).
2. It injects a `preload.js` script into the web page's renderer context that exposes a safe, sandboxed `window.electronAPI` bridge.
3. The PWA detects the presence of `window.electronAPI` and activates native features not available in a regular browser.

### Key Capabilities

| Feature | Implementation |
|---|---|
| **Silent Printing** | `pdf-to-printer` npm package. The "Print" button on job cards calls `window.electronAPI.printFile(url)` which downloads the file to a temp path and sends it directly to the Windows default printer without showing a print dialog. |
| **Bluetooth File Watcher** | `chokidar` watches the Windows Bluetooth receive folder (`%USERPROFILE%\Downloads`). When a new file appears, the agent creates a walk-in job record directly in Supabase and displays an interactive notification inside the PWA UI. |
| **Auto-Update** | `electron-updater` checks the GitHub Releases API on startup. If a new version is available, it downloads and installs silently in the background, applying the update on the next launch. |
| **Persistent Config** | `electron-store` saves `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SHOP_ID`, and `APP_URL` to an encrypted local file, surviving application restarts. |

### Build & Distribution

```
npm run build         → Produces portable PrintRUSH-Agent.exe (no installer)
npm run build:publish → Builds and uploads to GitHub Releases automatically
```

The GitHub Release asset is downloaded directly by shop owners. No app store, no admin rights, no installer required.

---

## 8. Database Schema

The schema is defined in `supabase/schema.sql`. Key tables are listed below.

### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `shops` | Tenant root record | `id`, `slug`, `plan`, `lat`, `lng`, `specialties[]`, `is_active` |
| `shop_owners` | Links Supabase Auth users to shops | `shop_id`, `user_id`, `role` |
| `platform_admins` | Super admin users | `user_id`, `role` |
| `services` | Per-shop pricing catalog (13 categories) | `shop_id`, `category`, `name`, `unit_price` |
| `jobs` | Core print queue table | `shop_id`, `job_number`, `job_token`, `job_status`, `payment_status`, `source` |
| `payments` | Payment records linked to jobs | `job_id`, `amount`, `method`, `provider`, `gateway_status` |
| `inventory` | Consumables stock tracker | `shop_id`, `item_name`, `quantity`, `low_threshold` |
| `deliveries` | Courier/delivery tracking records | `job_id`, `courier`, `stage`, `tracking_number` |

### Anti-Spam Tables

| Table | Purpose |
|---|---|
| `device_bans` | Permanently banned device fingerprints per shop |
| `job_throttle` | Sliding-window rate limiter (max 3 active jobs per device) |

### Supporting Tables

| Table | Purpose |
|---|---|
| `push_subscriptions` | VAPID Web Push endpoint + keys per customer/owner |
| `loyalty` | Tracks total jobs and spend per device fingerprint for discounts |

### Database Functions

| Function | Description |
|---|---|
| `next_job_number(shop_id)` | Atomically returns the next sequential job number per shop |
| `touch_updated_at()` | Trigger function that auto-updates the `updated_at` timestamp |
| `auth_owns_shop(shop_id)` | Security definer function used in RLS policies |
| `seed_default_services(shop_id)` | Seeds all 13 service categories for a new shop |
| `get_shops_near(lat, lng, max_dist_m)` | PostGIS proximity search returning shops sorted by distance |

### Job Status Lifecycle

```
pending → approved → processing → ready → done
                                        ↘ cancelled
```

- **pending**: Job submitted, awaiting owner review (if `approval_mode` is on).
- **approved**: Owner approved the job; ready to process.
- **processing**: Currently being printed.
- **ready**: Job is done; customer can pick it up.
- **done**: Customer has collected the order.
- **cancelled**: Job was cancelled by owner or customer.

### Job Source Types

| Source | Description |
|---|---|
| `online` | Submitted via the PWA order form |
| `walkin` | Manually created by the owner at the counter |
| `bluetooth` | Auto-created by the Desktop Agent from a Bluetooth transfer |

---

## 9. Security Design

### Row Level Security (RLS)

All 12 database tables have RLS enabled. The helper function `auth_owns_shop(shop_id)` is used as the check in all owner-scoped policies:

```sql
-- Example: Owners can only update their own shop's jobs
create policy "Owners can update jobs"
  on jobs for update using (auth_owns_shop(shop_id));
```

Public-facing policies (e.g., job insert, tracker read) are restricted at the application layer using `job_token` — a UUID that is only shown to the customer immediately after placing an order.

### Anti-Spam (3-Layer)

1. **hCaptcha** — Validates the order form submission is from a human.
2. **FingerprintJS** — Assigns a hardware-level hash to each browser. The `job_throttle` table enforces a maximum of 3 active jobs per fingerprint per shop.
3. **Owner Ban** — From the Kanban board, owners can permanently ban a device fingerprint. Banned devices receive an error on their next submission attempt.

### Content Security Policy

Defined in `vercel.json`, applied globally to all routes:

- `script-src` allows only `'self'`, `'unsafe-inline'` (required for inline handlers), hCaptcha, and CDN sources.
- `connect-src` restricts outbound connections to Supabase, PayMongo, Shipmates, hCaptcha, and OpenStreetMap tile servers.
- `frame-src` restricts embedded frames to hCaptcha domains only.

Additional security headers applied:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(self)` |

### Authentication

- Shop owners authenticate via **Supabase Auth** (email + password with optional OTP via SMTP).
- Student/customer access is **account-free**. Customers receive a `job_token` (UUID) to track their specific job anonymously.
- The Desktop Agent authenticates to Supabase using the shop owner's session, stored securely via `electron-store`.

---

## 10. API & Integrations

### Supabase (Primary)

- Client initialized in `js/lib/supabase.js` using the public anon key.
- Real-time queue updates use `supabase.channel('jobs').on('postgres_changes', ...)`.
- File uploads use `supabase.storage.from('print-files').upload(...)`.

### Payment (Sandbox / PayMongo)

- The `create-payment` Edge Function creates a payment intent.
- The `mock-payment-status` Edge Function simulates GCash/Maya payment confirmation for development and demo purposes.
- For production, the `payment-webhook` function receives and verifies signed callbacks from PayMongo.

### Delivery (Sandbox / Shipmates)

- The `dispatch-delivery` Edge Function creates a delivery booking.
- The `delivery-status` function returns the current stage (pending → picked up → in transit → delivered).
- Production integration connects to the Shipmates PH courier API.

### Web Push Notifications (VAPID)

- VAPID public/private key pair is generated once and stored:
  - Public key: in `js/lib/push.js`
  - Private key: as a Supabase Secret (`VAPID_PRIVATE_KEY`)
- Subscriptions stored in the `push_subscriptions` table.
- The `notify-push` Edge Function sends notifications to customers when their job status changes.

### Maps (Leaflet + OpenStreetMap)

- No API key required.
- The `get_shops_near()` PostgreSQL function (PostGIS) returns shops sorted by GPS distance.
- Rendered via Leaflet.js on the landing page (`js/student/locator.js`).

---

## 11. Deployment Infrastructure

### Production Stack

| Service | Role | Cost |
|---|---|---|
| **Vercel** | PWA hosting (global CDN, auto-HTTPS) | Free tier |
| **Supabase** | Database, Auth, Storage, Edge Functions | Free tier |
| **GitHub** | Source control + Desktop Agent binary releases | Free |
| **GitHub Actions** | (Optional) CI/CD pipeline for auto-build | Free |

### Deployment Steps

**1. PWA (Vercel)**
1. Connect the GitHub repository to Vercel.
2. Set no build command (static site).
3. Deploy the `main` branch. `vercel.json` applies all security headers automatically.

**2. Database (Supabase)**
1. Create a new Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `js/config.js`.

**3. Edge Functions (Supabase CLI)**
```bash
supabase link --project-ref <project-id>
supabase functions deploy payment-webhook
supabase functions deploy dispatch-delivery
supabase functions deploy notify-push
supabase functions deploy send-agent-email
supabase functions deploy create-payment
supabase functions deploy mock-payment-status
supabase functions deploy delivery-status
```

**4. Desktop Agent (GitHub Release)**
```bash
cd desktop-agent
npm run build:publish   # Builds portable .exe and uploads to GitHub Releases
```
Shop owners download the `.exe` directly from the GitHub Releases page. No installation or admin rights required.

### Required Configuration Keys

| Key | Location | Description |
|---|---|---|
| `SUPABASE_URL` | `js/config.js`, `desktop-agent/.env` | Supabase project URL |
| `SUPABASE_ANON_KEY` | `js/config.js`, `desktop-agent/.env` | Public Supabase anon key |
| `APP_URL` | `js/config.js`, `desktop-agent/.env` | Deployed PWA URL |
| `SHOP_ID` | `desktop-agent/.env` | UUID of the shop tied to this PC |
| `VAPID_PUBLIC_KEY` | `js/lib/push.js` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Supabase Secret | Web Push private key (server-side only) |

---

## 12. Design System

PrintRUSH uses a custom **CMYK** (Cyan, Magenta, Yellow, Key/Black) design token system, mirroring the printing industry's color model.

### Tokens (`css/tokens.css`)

- **Colors**: CSS custom properties for cyan, magenta, yellow, and black in multiple shades, with semantic aliases (e.g., `--color-primary`, `--color-danger`).
- **Typography**: Scale defined in `rem` units with Google Fonts (`Inter`).
- **Spacing**: 4px base unit with an 8-step scale.
- **Borders / Radii**: Consistent border-radius tokens for cards, buttons, and inputs.
- **Shadows**: Layered elevation shadows.
- **Z-index**: Named layers (`--z-modal`, `--z-toast`, `--z-overlay`).
- **Dark Mode**: All color tokens are overridden under a `[data-theme="dark"]` attribute on `<html>`, swapped by a JavaScript toggle with no page reload.

### Components (`css/components.css`)

Reusable UI patterns: Buttons, Cards, Badges, Kanban columns, Modals, Toast notifications, Form inputs, Navigation sidebar, Loading spinners, and the Kanban board drag-and-drop overlay.

---

## 13. File & Directory Structure

```
PrintRush Lopez/
├── index.html                   # Landing page & shop locator
├── order.html                   # Customer order wizard
├── tracker.html                 # Real-time job tracker
├── confirmation.html            # Post-order confirmation
├── payment.html                 # Payment gateway handler
├── manifest.json                # PWA Web App Manifest
├── vercel.json                  # Hosting config & security headers
│
├── css/
│   ├── tokens.css               # CMYK design tokens & variables
│   └── components.css           # Reusable component styles
│
├── js/
│   ├── config.js                # App-wide configuration (keys, URLs)
│   ├── sw.js                    # Service Worker
│   ├── lib/
│   │   ├── supabase.js          # Supabase client singleton
│   │   └── push.js              # Web Push VAPID handler
│   ├── student/
│   │   ├── order.js             # Order wizard logic
│   │   ├── tracker.js           # Job status tracker
│   │   └── locator.js           # Map & proximity search
│   ├── owner/
│   │   ├── auth.js              # Owner login / session
│   │   ├── layout.js            # Sidebar & navigation
│   │   ├── dashboard.js         # Stats & revenue dashboard
│   │   ├── queue-board.js       # Live Kanban board
│   │   ├── inventory.js         # Inventory management
│   │   ├── services.js          # Service catalog
│   │   └── settings.js          # Shop settings
│   └── admin/                   # Super Admin scripts
│
├── owner/                       # Owner portal HTML pages (shell pages)
│   ├── login.html
│   ├── dashboard.html
│   ├── queue.html
│   ├── inventory.html
│   ├── services.html
│   └── settings.html
│
├── admin/                       # Super Admin portal
│   ├── index.html
│   └── dashboard.html
│
├── icons/                       # PWA icons (96, 192, 512px + SVG)
│
├── supabase/
│   ├── schema.sql               # Full PostgreSQL schema + RLS + seed
│   ├── deno.json                # Edge Function Deno config
│   └── functions/               # Supabase Edge Functions
│       ├── create-payment/
│       ├── payment-webhook/
│       ├── mock-payment-status/
│       ├── dispatch-delivery/
│       ├── delivery-status/
│       ├── notify-push/
│       └── send-agent-email/
│
└── desktop-agent/
    ├── main.js                  # Electron main process
    ├── watcher.js               # Bluetooth file watcher (chokidar)
    ├── package.json             # Electron + build config
    ├── ui/                      # Agent-specific UI overlays
    └── dist/                    # Built portable .exe output
```

---

## 14. Known Limitations & Future Work

### Current Limitations

| Area | Limitation |
|---|---|
| Payments | PayMongo integration is in sandbox mode. Real GCash/Maya checkout requires PayMongo account verification. |
| Delivery | Shipmates API is simulated. Production integration requires a Shipmates business account. |
| Email | OTP email via SMTP requires a configured Gmail App Password or SMTP relay. Not zero-config. |
| Bluetooth | The Desktop Agent's Bluetooth watcher monitors the Windows download folder, not a true Bluetooth OBEX push server. Requires manual Bluetooth pairing by the student. |
| Multi-shop | A single Desktop Agent instance is tied to one `SHOP_ID`. Running multiple shops on one PC requires separate agent installations. |
| Offline PWA | The Service Worker caches the owner dashboard shell, but Supabase queries require internet. True offline write-back (sync queue) is not yet implemented. |

### Planned Enhancements

- [ ] PayMongo live mode activation and PCI-compliant checkout.
- [ ] True Bluetooth OBEX server via native Node.js addon for automatic, pairing-free file receipt.
- [ ] Offline job queue with background sync (IndexedDB + Background Sync API).
- [ ] SMS fallback notification via Semaphore (Philippine SMS gateway).
- [ ] Analytics dashboard with weekly/monthly revenue charts per service category.
- [ ] Subscription billing portal for platform-level SaaS monetization.
- [ ] Android companion app (TWA — Trusted Web Activity) wrapping the PWA.
- [ ] Multi-language support (Filipino / Tagalog localization).

---

*PrintRUSH Lopez — Developed for the Municipality of Lopez, Quezon.*
*© 2025–2026 PrintRUSH Lopez. All rights reserved.*
