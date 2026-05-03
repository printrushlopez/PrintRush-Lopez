# 🖥️ PrintRUSH Desktop Agent (Shop Bridge)

The Desktop Agent is a native Windows bridge that gives the PrintRUSH Owner Portal superpowers. It handles Bluetooth walk-ins and direct-to-printer commands.

## 🚀 Setup Instructions

### 1. Installation
Ensure you have [Node.js](https://nodejs.org/) installed on the shop PC.
1. Download this repository to the PC.
2. Open a terminal in the `desktop-agent` folder.
3. Run: `npm install`

### 2. Configuration (`.env`)
Create a file named `.env` in the `desktop-agent` folder and fill in your shop details:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SHOP_ID=your-shop-uuid-here
APP_URL=https://printrush-lopez.vercel.app
BLUETOOTH_FOLDER=C:\Users\Public\Downloads
```

### 3. Launching
Run the following command to start the agent:
```bash
npm start
```
*Tip: You can minimize the app to the System Tray. It will continue watching for files in the background.*

---

## 💎 Features

### 📡 Automatic Bluetooth Detection
When a customer sends a file via Bluetooth to the PC:
1. Windows saves it to the `BLUETOOTH_FOLDER`.
2. A banner appears **inside the web UI** instantly.
3. Click "Create Job" to add the walk-in to the queue without typing a single file name.

### 🖨️ Silent Printing
Each job card in the Kanban board will now have a **Print** button.
- **PDFs:** Printed instantly to the Windows default printer.
- **Other Files:** Automatically opens the file and triggers the Windows Print command.

### 🛡️ Secure Bridge
The agent uses an **IPC Bridge**. This means your website only gets these extra features when running inside the app. If you open the site in a normal Chrome browser, it remains a standard PWA for security.

---

## 🛠️ Troubleshooting

- **Print Button Missing:** Ensure you are viewing the shop portal *inside* the Desktop Agent window, not a regular browser.
- **Bluetooth Not Detected:** 
  1. Ensure the customer's device is paired with the PC.
  2. Ensure the `BLUETOOTH_FOLDER` in `.env` matches where Windows is saving the files.
- **Print Error:** Ensure the PC has a "Default Printer" set in Windows Settings.
