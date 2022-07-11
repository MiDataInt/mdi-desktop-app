// load dependencies
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process');

// launch the app in the main renderer, i.e., BrowserWindow
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
  // set the app title bar based on server mode
  ipcMain.on('set-title', (event, mode) => {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    win.setTitle("MDI " + mode)
  })

  // spawn the ssh terminal where the mdi-apps-framework server will run
  ipcMain.on('server-action', (event, sshCommand) => {
    let isWindows = process.platform.toLowerCase().startsWith("win")
    if(isWindows){ // required to create a stable external window
      spawn('cmd.exe', ["/c", "start", "ssh"].concat(sshCommand))
    } else {
      // TODO: handle linux/Mac does this work?
      spawn('ssh', sshCommand)
    }
  })

  // load the page that allows users to configure their server
  mainWindow.loadFile('index.html') 
  mainWindow.webContents.openDevTools(); //////////////
}

// handle app flow control
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { // for Mac
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  })
})
app.on('window-all-closed', () => { // all except Mac
  if (process.platform !== 'darwin') app.quit()
})
