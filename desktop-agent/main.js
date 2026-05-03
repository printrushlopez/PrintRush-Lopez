const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const ptp = require('pdf-to-printer');
const { startWatching } = require('./watcher');

let tray = null;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Don't show immediately
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const appUrl = process.env.APP_URL || 'https://printrush-lopez.vercel.app';
  console.log(`Desktop Agent: Loading ${appUrl}/owner/queue`);
  
  mainWindow.loadURL(`${appUrl}/owner/queue`).catch(() => {
    console.warn('Failed to load remote URL, falling back to local UI');
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  });

  mainWindow.webContents.on('did-fail-load', () => {
    // If it's a localhost failure, don't fallback immediately, but if it's production, show local offline page
    if (!appUrl.includes('localhost')) {
      mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
    }
  });

  mainWindow.on('close', (event) => {
    // Hide instead of close to keep running in tray
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const { nativeImage } = require('electron');
  // Simple 16x16 blue square as a placeholder tray icon (PNG format)
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVR42mNkYGD4z0AAMo4aoHEQZ2BgoP9PBRk1YNSAUQNGAw0AAwBw3g3n23Gf0gAAAABJRU5ErkJggg==';
  const icon = nativeImage.createFromDataURL(iconBase64);
  tray = new Tray(icon);
  tray.setToolTip('PrintRUSH Desktop Agent');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Queue', click: () => mainWindow.show() },
    { label: 'Quit', click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Start watching the Bluetooth folder
  startWatching((fileInfo) => {
    // Send to UI to open modal
    mainWindow.webContents.send('bluetooth-file-received', fileInfo);
    mainWindow.show();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Handle IPC from renderer
ipcMain.handle('get-env', () => {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SHOP_ID: process.env.SHOP_ID
  };
});

ipcMain.handle('print-file', async (event, urlOrPath) => {
  try {
    let filePath = urlOrPath;
    let isTemp = false;

    // Handle remote URLs
    if (urlOrPath.startsWith('http')) {
      console.log('Downloading file for printing:', urlOrPath);
      const response = await axios({
        url: urlOrPath,
        method: 'GET',
        responseType: 'stream'
      });

      const fileName = `printrush_${Date.now()}_${path.basename(urlOrPath)}`;
      filePath = path.join(os.tmpdir(), fileName);
      const writer = fs.createWriteStream(filePath);

      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      isTemp = true;
    } 
    // Handle local file:// paths
    else if (urlOrPath.startsWith('file://')) {
      filePath = urlOrPath.replace('file://', '');
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found at ' + filePath);
    }

    console.log('Sending to printer:', filePath);
    
    // Check if PDF (ptp only supports PDF natively on Windows)
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      await ptp.print(filePath);
    } else {
      // For non-PDFs, we can use the 'print' verb via shell (opens default app)
      // or we could convert it. For now, let's try the Windows 'print' shell command.
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        // Powershell command to print any document using its default application
        const cmd = `Start-Process -FilePath "${filePath}" -Verb Print`;
        exec(`powershell -Command "${cmd}"`, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Clean up temp file if we downloaded it
    if (isTemp) {
      setTimeout(() => {
        try { fs.unlinkSync(filePath); } catch (e) { console.warn('Temp file cleanup failed:', e); }
      }, 5000); // 5s delay to ensure spooler is done
    }

    return { success: true };
  } catch (err) {
    console.error('Print Error:', err);
    return { success: false, error: err.message };
  }
});
