# Project Documentation: PrintRUSH Lopez

## Title of the Project and Group Members
**Title:** PrintRUSH Lopez Smart Queue Management System  
**Group Members:** [Insert Member Names Here]

## Description of the Project
PrintRUSH is a multi-tenant Progressive Web Application (PWA) and native Windows Desktop Agent designed to eliminate physical queues at campus printing shops. It allows students to upload files, pay instantly, and track jobs in real time, while walk-in customers are handled seamlessly via a smart Bluetooth transfer interception system.

## Introduction and Background of the Study
Campus printing shops in the Municipality of Lopez, Quezon, frequently experience heavy congestion, leading to long physical queues and inefficient operations. Currently, students must wait in line just to submit their files, while shop owners lack digital tracking systems for pending and completed jobs. PrintRUSH was conceptualized to modernize these operations, bringing cloud-synchronized queue management that bridges online accessibility and offline walk-in needs.

## Problem Statement
Campus printing shops in Lopez, Quezon face several recurring operational issues:
1. Students queue physically for 15–20 minutes per job, even for simple document prints.
2. Shop owners have no digital record of pending, in-progress, or completed jobs.
3. Walk-in customers without internet access cannot participate in a digital queue.
4. Spam and abuse (submitting dozens of jobs) disrupt fair queue ordering.
5. Lack of integrated payment options forces cash-only transactions without receipts.

## Objective of the Study
The primary objective is to develop and deploy a comprehensive, multi-tenant SaaS platform that modernizes campus printing shop operations in Lopez, Quezon, by replacing physical queues with an efficient, cloud-synchronized digital queue system.

## Scope and Limitations
**Scope:**
- Development of a Progressive Web App (PWA) for students (ordering) and shop owners (management).
- Implementation of a Supabase backend for database, real-time updates, and serverless Edge Functions.
- Creation of a native Windows Desktop Agent to intercept Bluetooth files and manage offline walk-in prints.
- Integration of a sandbox payment system and Web Push notifications.

**Limitations:**
- Payments and deliveries are currently in sandbox/simulation mode and require actual business accounts for full production deployment.
- The Desktop Agent monitors the Windows download folder rather than functioning as a true Bluetooth OBEX push server, which requires manual device pairing.
- A single Desktop Agent instance is tied to one shop ID per PC.
- True offline database write-back synchronization is not yet fully implemented.

## Significance of the Study
The project provides a modern technological solution to a common daily bottleneck for students and local businesses. For students, it saves significant time and effort. For shop owners, it digitalizes queue management, secures payment processes, and prevents spam abuse, ultimately improving revenue, fairness, and service quality.

## Features of the Study
- **Real-time Digital Queue:** Live job tracking for students and a drag-and-drop Kanban board for shop owners.
- **Multi-Tenant Architecture:** Allows multiple shops to operate independently on the same platform with secure data isolation.
- **Native Desktop Agent:** Features Silent Printing capabilities and Smart Bluetooth file interception.
- **Zero-Account Access:** Allows students to use the platform without signing up, using a unique 3-layer anti-spam security system (hCaptcha, FingerprintJS, Owner Bans).
- **Custom Design System:** CMYK-inspired design tokens with native Light/Dark modes.
- **Offline Capabilities:** PWA functionality using Service Workers to ensure app availability on poor networks.

## Purpose of the Study
To streamline the printing process, reduce waiting times for students, and empower shop owners with robust digital tools for efficient queue tracking, inventory management, and transaction handling.

## User or Clients
1. **Students / Customers:** Individuals who need documents printed efficiently without waiting in long physical queues.
2. **Shop Owners:** Printing business operators who manage incoming print jobs, track inventory, and oversee daily transactions.
3. **Platform Admins:** Super users who manage the multi-tenant platform and oversee shop registrations.

## Technologies and Tools Used
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES Modules), Custom CSS Design Tokens, Service Workers.
- **Backend:** Supabase (PostgreSQL 15, PostGIS, Realtime WebSockets, Storage, Edge Functions via Deno).
- **Desktop Agent:** Electron v34 (Node.js), `pdf-to-printer`, `chokidar`, `electron-builder`.
- **Hosting / Deployment:** Vercel (PWA) and GitHub Releases (Desktop Agent).
- **Integrations & Security:** Web Push API (VAPID), Leaflet.js (Mapping), FingerprintJS, hCaptcha.

## Competitive Advantage of the Project
PrintRUSH distinguishes itself by offering a **hybrid online/offline architecture**. Unlike typical online-only printing platforms, PrintRUSH includes a native Desktop Agent that automatically bridges walk-in Bluetooth transfers into the cloud queue. Additionally, its zero-account model with hardware fingerprinting ensures high accessibility while effectively preventing queue spam, making it perfectly tailored for high-volume, fast-paced campus environments.

## Benefits and Impact of the Project
- **Time Efficiency:** Eliminates the typical 20-minute physical wait time for students.
- **Operational Clarity:** Provides shop owners with a clear, digital overview of all pending and completed jobs, reducing errors and misplaced files.
- **Improved Revenue & Service:** Integrated payments and streamlined operations allow shops to handle a higher volume of jobs.
- **Security & Fairness:** Ensures fair queueing through robust anti-spam measures and hardware fingerprinting.

## Summary of the Project
PrintRUSH Lopez is a specialized, multi-tenant Progressive Web Application and hybrid Desktop Agent ecosystem designed to revolutionize campus printing shops in Lopez, Quezon. By shifting the physical queue to the cloud and intelligently handling offline walk-ins via Bluetooth interception, it solves major operational pain points. Built on a robust stack of Vanilla JS, Supabase, and Electron, PrintRUSH delivers a fast, secure, and highly efficient print queue management system for both students and business owners.
