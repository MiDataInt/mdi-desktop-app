const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process');

app.commandLine.appendSwitch('force_high_performance_gpu')

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  })

  // IPC, renderer-to-main
  ipcMain.on('set-title', (event, mode) => {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    win.setTitle("MDI " + mode)
  })
  ipcMain.on('start-server', (event) => {
    const cmd = spawn('cmd.exe', ["/c", "start", "ssh", "-T", "wilsonte@greatlakes.arc-ts.umich.edu"]);
  })
  ipcMain.on('show-log', (event, message) => {
    console.log(message);
  })

  ipcMain.on('errorInWindow', function(event, data){
    console.log(data)
  });

  mainWindow.loadFile('index.html')
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { // for Mac
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  })
})

app.on('window-all-closed', () => { // all except Mac
  if (process.platform !== 'darwin') app.quit()
})
