# 🖨️ PrintRUSH Lopez

**The smarter print queue system for every shop in Lopez, Quezon.**

PrintRUSH is a multi-tenant Progressive Web Application (PWA) designed to eliminate the 20-minute physical queues at campus printing shops. Students can upload their files from home, pay instantly via GCash/Maya, and walk in exactly when their job is ready. 

For walk-in customers without an internet connection, a native Windows Desktop Agent automatically intercepts Bluetooth file transfers and seamlessly syncs them with the cloud queue.

---

## 🏗️ Architecture

The ecosystem relies on three core pillars:

1. **The PWA (Frontend)**
   - Built with raw HTML, CSS (Custom Design Tokens), and Vanilla JavaScript.
   - Zero heavy frameworks (no React, no Vue), ensuring instant load times even on slow 3G campus networks.
   - Completely offline-capable using Service Workers.
   
2. **Supabase (Backend)**
   - **PostgreSQL Database:** Handles the multi-tenant architecture safely via Row Level Security (RLS).
   - **Realtime:** Live queue tracking via WebSockets.
   - **Edge Functions (Deno):** Securely handles sandbox payment simulations, simulated delivery tracking, and Web Push notifications.

3. **Desktop Agent (Hybrid Bridge)**
   - A native Electron application that acts as a "Super Shell" for the Owner Portal.
   - **Hybrid Bridge:** When the owner opens the app, it loads the live website but injects native Node.js capabilities.
   - **Silent Printing:** Adds a "Print" button to every job card on the website that triggers a direct print to the Windows default printer.
   - **Smart Bluetooth:** Automatically detects incoming Bluetooth files and displays an interactive notification banner directly inside the website's UI.

---

## 🚀 Deployment Guide

### 1. Deploying the PWA (Vercel)
The frontend is pre-configured for Vercel.
1. Connect this repository to your Vercel account.
2. The `vercel.json` automatically configures the necessary security headers (CSP) and routing rules.
3. No build steps are required. Simply deploy the `main` branch.

### 2. Deploying the Database (Supabase)
1. Create a new project in [Supabase](https://supabase.com).
2. Go to the SQL Editor and execute the contents of `supabase/schema.sql`.
3. Copy your `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `js/config.js`.

### 3. Deploying Edge Functions
To deploy the backend security logic, you need the Supabase CLI installed locally.
1. Link your local project: `supabase link --project-ref your-project-id`
2. Deploy the functions:
   ```bash
   supabase functions deploy payment-webhook
   supabase functions deploy dispatch-delivery
   supabase functions deploy notify-push
   ```

---

## 🔑 Required API Keys & Secrets

For a full production deployment, you must configure the following keys. **Never put these in the frontend Javascript files.** 

### 1. Supabase (Database & Realtime)
**Where to put:** Inside `js/config.js` and `desktop-agent/.env`.
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_ANON_KEY`: Your public anonymous key.
- `APP_URL`: The URL where your PWA is hosted (e.g., `https://your-shop.vercel.app`).
- `SHOP_ID`: The UUID or ID of the shop associated with this specific PC.

### 2. VAPID Keys (Web Push Notifications)
1. Generate your VAPID keys online (e.g., at vapidkeys.com).
2. **Public Key:** Paste the VAPID Public Key into `js/lib/push.js` at line 9 (`VAPID_PUBLIC_KEY`).
3. **Private Key:** Set this as a Supabase Secret:
   ```bash
   supabase secrets set VAPID_PRIVATE_KEY=your_vapid_private_key
   ```

### 3. Vercel (Hosting)
- Connect your GitHub repository to Vercel. Vercel will automatically read the `vercel.json` file. No environment variables are strictly required on Vercel itself, as the frontend securely calls Supabase.

---

## 🎨 Design System

PrintRUSH utilizes a custom **CMYK** (Cyan, Magenta, Yellow, Black) design system mirroring the printing industry. 
- All design tokens are located in `css/tokens.css`.
- The PWA features a native Light/Dark mode toggle that seamlessly swaps the CSS variables without JavaScript reloading.

---

## 🔒 Security & Anti-Spam

PrintRUSH does not force students to create accounts or remember passwords. Instead, it uses a 3-layer security system:
1. **hCaptcha:** Blocks automated bots during the upload process.
2. **FingerprintJS:** Open-source browser fingerprinting assigns a unique hardware hash to every student, ensuring they cannot spam the queue with more than 3 active jobs.
3. **Owner Controls:** Shop owners can permanently ban abusive device fingerprints directly from their Live Kanban board.

---
*Developed for the Municipality of Lopez.*
