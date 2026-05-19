const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

function startWatching(watchFolder, onFileReceived) {
  if (!watchFolder) watchFolder = 'C:\\Users\\Public\\Downloads';
  
  if (!fs.existsSync(watchFolder)) {
    try {
      fs.mkdirSync(watchFolder, { recursive: true });
    } catch (e) {
      console.error('Failed to create watch folder:', e);
    }
  }

  console.log(`Watching for Bluetooth files in: ${watchFolder}`);

  // Initialize watcher.
  // Use awaitWriteFinish to ensure file is fully downloaded/received before emitting 'add'
  const watcher = chokidar.watch(watchFolder, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't trigger on existing files
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });

  watcher.on('add', (filePath) => {
    console.log(`New file received via Bluetooth: ${filePath}`);
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    
    onFileReceived({
      path: filePath,
      name: fileName,
      size: stats.size,
      time: Date.now()
    });
  });

  watcher.on('error', error => console.log(`Watcher error: ${error}`));
}

module.exports = { startWatching };
