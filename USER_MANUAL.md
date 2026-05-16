# 🖨️ PrintRUSH Lopez — User Flow Manual

This manual outlines the standard system routes and workflows for the three primary user roles: **Customers (Students)**, **Shop Owners**, and **Platform Admins**. 

---

## 👤 1. Customer (Student) Workflow
The customer flow is designed to be completely frictionless, requiring no account creation or app downloads.

```mermaid
graph TD
    A([Start: Visit Landing Page]) --> B{Discover Shop}
    B -->|Use Map Locator| C[Select nearby shop]
    B -->|Direct Link| C
    C --> D[**order.html**: Upload File]
    D --> E[Configure Print Settings<br/><i>Color, Copies, Paper Size</i>]
    E --> F[Provide Contact Info & Name]
    F --> G{Select Fulfillment Method}
    
    G -->|Walk-in Pickup| H[Select Payment Method]
    G -->|Delivery| I[Enter Delivery Address<br/>& Select Courier]
    
    H -->|Online / E-Wallet| J[**payment.html**: Process Sandbox Payment]
    H -->|Cash on Delivery| K[Skip Payment Step]
    I --> J
    I --> K
    
    J --> L[**tracker.html**: Live Job Queue]
    K --> L
    
    L --> M{Monitor Status Updates}
    M -->|Shop accepts job| N[Status: Printing]
    M -->|Shop dispatches| O[Track Sandbox Delivery]
    N --> P([Status: Ready / Complete!])
    O --> P
```

---

## 🏪 2. Shop Owner Workflow
The shop owner manages the print queue using either the web portal or the native Windows Desktop Agent (which allows for silent printing and Bluetooth interception).

```mermaid
graph TD
    A([Start: Open Desktop Agent]) --> B[**owner/login.html**]
    B --> C[**owner/dashboard.html**<br/>Live Kanban Board]
    
    C --> D{Monitor Incoming Jobs}
    
    D -->|New Online Job| E[Review File & Print Settings]
    D -->|Bluetooth Transfer| F[Agent intercepts file automatically<br/>from walk-in customer]
    
    E --> G{Process Job}
    F --> G
    
    G -->|Accept| H[Click 'Print' Button]
    H -.->|Desktop Agent Magic| I[(Silent Print to Windows Printer)]
    H --> J[Update Status to 'Printing']
    
    J --> K{Order Type}
    
    K -->|Walk-in| L[Mark 'Ready for Pickup']
    K -->|Delivery| M[Click 'Dispatch Delivery']
    
    M -.->|Shipmates Simulation| N[Generate Tracking Number & Timeline]
    
    L --> O([Mark 'Completed'])
    N --> O
```

---

## 👑 3. Platform Admin Workflow
The Platform Admin is responsible for onboarding new shops, assigning owners, and managing the overall platform ecosystem.

```mermaid
graph TD
    A([Start: Admin Portal]) --> B[Enter secret easter-egg URL<br/><i>admin/?code=...</i>]
    B --> C[**admin/index.html**<br/>Admin Dashboard]
    
    C --> D{Platform Management}
    
    D -->|Create Shop| E[Input Shop Details & Location]
    E --> F[Generate unique Shop ID]
    
    D -->|Assign Owner| G[Link Owner Auth Account to Shop ID]
    
    D -->|Monitoring| H[View Platform Analytics]
    
    F --> I([Handover Shop ID & Login to Shop Owner])
    G --> I
```

---

## 💻 4. Desktop Agent Setup (For Shop Owners)
To unlock the full potential of your PrintRUSH shop (like silent printing and Bluetooth integration), you must install the Desktop Agent on your shop's primary Windows PC.

### Installation Steps:
1. **Prerequisites:** Ensure [Node.js](https://nodejs.org/) is installed on your PC.
2. **Download:** Open the `desktop-agent` folder in your terminal.
3. **Install Dependencies:** Run the command `npm install`
4. **Configuration:** Create a `.env` file inside the `desktop-agent` folder and add your shop details:
   ```env
   SUPABASE_URL=https://iovsadqmwnjssrcxvagu.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SHOP_ID=your-shop-uuid-here
   APP_URL=https://print-rush-lopez.vercel.app
   BLUETOOTH_FOLDER=C:\Users\Public\Downloads
   ```
5. **Launch:** Run `npm start`.

### How to use it:
- **Bluetooth Walk-ins:** Once running, any file sent to your PC via Bluetooth will instantly pop up as a notification inside your Kanban board. Click "Create Job" to immediately add the walk-in to your queue.
- **Silent Printing:** Instead of manually opening files, just click **Print** on any PDF job card in your portal to send it directly to your default Windows printer.
- **Important:** These superpowers only work when viewing your shop portal *inside* the Desktop Agent window. If you open it in Google Chrome, it will run as a standard website.
