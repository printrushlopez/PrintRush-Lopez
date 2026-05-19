const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const axios = require('axios');
const ptp   = require('pdf-to-printer');
const { startWatching } = require('./watcher');
const { autoUpdater }   = require('electron-updater');

// ── Persistent config store (replaces .env file) ──────────────────────────────
// electron-store uses a CommonJS-compatible import trick for ESM package
let Store;
try { Store = require('electron-store'); } catch { Store = require('electron-store').default; }

const store = new Store({
  schema: {
    shopId:       { type: 'string', default: '' },
    supabaseUrl:  { type: 'string', default: 'https://iovsadqmwnjssrcxvagu.supabase.co' },
    supabaseKey:  { type: 'string', default: '' },
    appUrl:       { type: 'string', default: 'https://print-rush-lopez.vercel.app' },
    btFolder:     { type: 'string', default: 'C:\\Users\\Public\\Downloads' }
  }
});

let tray      = null;
let mainWindow  = null;
let setupWindow = null;

// ── First-Run check ────────────────────────────────────────────────────────────
function isConfigured() {
  return store.get('shopId', '').length > 0 && store.get('supabaseKey', '').length > 0;
}

// ── Setup Window (shown on first launch) ──────────────────────────────────────
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width:  520,
    height: 600,
    resizable: false,
    center: true,
    title: 'PrintRUSH — Connect Your Shop',
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  setupWindow.loadFile(path.join(__dirname, 'ui', 'setup.html'));
  setupWindow.setMenuBarVisibility(false);

  setupWindow.on('closed', () => { setupWindow = null; });
}

// ── Main Portal Window ─────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:  1200,
    height: 800,
    show: false,
    title: 'PrintRUSH Desktop Agent',
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const appUrl = store.get('appUrl');
  console.log(`[PrintRUSH] Loading portal: ${appUrl}/owner/queue`);

  mainWindow.loadURL(`${appUrl}/owner/queue`).catch(() => {
    mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  });

  mainWindow.webContents.on('did-fail-load', () => {
    if (!appUrl.includes('localhost')) {
      mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // ── Auto-Updater ─────────────────────────────────────────────────────────────
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-status', 'Downloading update…');
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'PrintRUSH Update Ready',
      message: 'A new version of PrintRUSH has been downloaded. The app will restart now to apply the update.',
      buttons: ['Restart Now', 'Later']
    }).then(result => {
      if (result.response === 0) {
        app.isQuiting = true;
        autoUpdater.quitAndInstall();
      }
    });
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────────
function createTray() {
  const { nativeImage } = require('electron');
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVR42mNkYGD4z0AAMo4aoHEQZ2BgoP9PBRk1YNSAUQNGAw0AAwBw3g3n23Gf0gAAAABJRU5ErkJggg==';
  const icon = nativeImage.createFromDataURL(iconBase64);
  tray = new Tray(icon);
  tray.setToolTip('PrintRUSH Desktop Agent — Running');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Queue',  click: () => mainWindow?.show() },
    { label: 'Check for Updates', click: () => autoUpdater.checkForUpdatesAndNotify() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// ── App ready ──────────────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (setupWindow) {
      if (setupWindow.isMinimized()) setupWindow.restore();
      setupWindow.show();
      setupWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createTray();

  if (!isConfigured()) {
    // First run: show setup screen
    createSetupWindow();
  } else {
    // Already configured: load portal directly
    createMainWindow();
    startWatching(store.get('btFolder'), (fileInfo) => {
      mainWindow.webContents.send('bluetooth-file-received', fileInfo);
      mainWindow.show();
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      isConfigured() ? createMainWindow() : createSetupWindow();
    }
  });
});

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Keep alive in tray — do NOT quit
    }
  });
}

// ── IPC: Setup form saves config and launches portal ──────────────────────────
ipcMain.handle('save-config', async (event, config) => {
  try {
    store.set('shopId',      config.shopId.trim());
    store.set('supabaseKey', config.supabaseKey.trim());
    // Optional overrides
    if (config.appUrl)    store.set('appUrl',    config.appUrl.trim());
    if (config.btFolder)  store.set('btFolder',  config.btFolder.trim());

    // Close setup, open main portal
    setupWindow?.close();
    createMainWindow();

    startWatching(store.get('btFolder'), (fileInfo) => {
      mainWindow.webContents.send('bluetooth-file-received', fileInfo);
      mainWindow.show();
    });

    return { success: true };
  } catch (err) {
    console.error('[PrintRUSH] Config save error:', err);
    return { success: false, error: err.message };
  }
});

// ── IPC: Provide config to the web portal (replaces .env) ─────────────────────
ipcMain.handle('get-env', () => ({
  SUPABASE_URL:  store.get('supabaseUrl'),
  SUPABASE_ANON_KEY: store.get('supabaseKey'),
  SHOP_ID:       store.get('shopId')
}));

// ── IPC: Silent print ──────────────────────────────────────────────────────────
ipcMain.handle('print-file', async (event, urlOrPath) => {
  try {
    let filePath = urlOrPath;
    let isTemp   = false;

    if (urlOrPath.startsWith('http')) {
      const response = await axios({ url: urlOrPath, method: 'GET', responseType: 'stream' });
      const fileName = `printrush_${Date.now()}_${path.basename(urlOrPath)}`;
      filePath = path.join(os.tmpdir(), fileName);
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
      isTemp = true;
    } else if (urlOrPath.startsWith('file://')) {
      filePath = urlOrPath.replace('file://', '');
    }

    if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);

    if (path.extname(filePath).toLowerCase() === '.pdf') {
      await ptp.print(filePath);
    } else {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        const cmd = `Start-Process -FilePath "${filePath}" -Verb Print`;
        exec(`powershell -Command "${cmd}"`, (err) => err ? reject(err) : resolve());
      });
    }

    if (isTemp) setTimeout(() => { try { fs.unlinkSync(filePath); } catch {} }, 5000);
    return { success: true };
  } catch (err) {
    console.error('[PrintRUSH] Print error:', err);
    return { success: false, error: err.message };
  }
});
