# PrintRUSH Lopez - Project Objectives & Context

## Project Overview
PrintRUSH Lopez is a hyper-local, multi-tenant SaaS printing marketplace designed for the Municipality of Lopez, Quezon. It connects local print shops with students and customers, eliminating long queues by allowing users to upload documents, pay online (via GCash/Maya), and track their print jobs in real-time.

## Core Objectives
1. **Queue Elimination:** Allow customers to submit jobs remotely so they only need to walk in for pickup.
2. **Shop Empowerment:** Provide print shop owners with a centralized queue management system, revenue tracking, and a native Windows Desktop Agent for seamless, automated printing.
3. **Zero-Friction Onboarding:** Shop owners should be able to apply and set up their shop without technical hurdles. Customers should not need to download a mobile app (PWA first).
4. **Hyper-Local Discovery:** Use Geolocation to help customers find the nearest shop offering the specific service they need (e.g., Documents, Tarpaulin, Apparel).

## Technical Stack
- **Frontend:** Vanilla HTML, CSS, JavaScript (No heavy frameworks like React/Vue for the main landing page to ensure maximum speed and simplicity).
- **Backend/Database:** Supabase (PostgreSQL, Auth, Storage, Edge Functions).
- **Payments:** PayMongo API (sandbox/live) integrated via Supabase Edge Functions.
- **Desktop Agent:** Electron.js (Windows `.exe` packaged via `electron-builder`), using `electron-store` for configuration and Supabase JS for real-time queue syncing.
- **Hosting:** Vercel (Frontend), GitHub Releases (Desktop Agent distribution).

## Key Workflows
- **Customer Flow:** Landing Page -> Select Shop (via Map or List) -> Upload File (`order.html`) -> Pay -> Track Job (`tracker.html`) -> Pickup.
- **Shop Application Flow:** Apply via `apply.html` -> Admin approves in `/admin/dashboard.html` -> Shop and Auth User created -> Welcome Email sent with Shop ID.
- **Shop Owner Flow:** Receives Email -> Downloads Desktop Agent -> Enters Shop ID to connect -> Manages Queue via Web Portal (`/owner/queue.html`) or Native App.

## Design Aesthetic
- **Color Palette:** CMYK inspired (Cyan `#00C2E0`, Magenta `#E8007D`, Yellow `#FFD700`, Dark/Light themes).
- **Vibe:** Modern, vibrant, glassy (glassmorphism), premium, and responsive.
- **Rules:** 
  - Avoid generic styling. 
  - Never use TailwindCSS unless explicitly requested. 
  - Do not use placeholders for images; generate rich imagery to maintain the premium feel.

## Future Context for AI
When assisting with PrintRUSH, always prioritize the hyper-local context (Lopez, Quezon), the dual-platform nature (Web + Desktop Agent), and the strict adherence to Vanilla web technologies for the frontend UI.
