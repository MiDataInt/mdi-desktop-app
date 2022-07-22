// load dependencies
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const pty = require('node-pty')
const { spawn } = require('child_process')

// activate the in-app node-pty pseudo-terminal that runs the mdi-remote server
// via a blocking ssh connection with a port tunnel
const activateMdiRemoteTerminal = (sshArgs) => {
  const ptyProcess = pty.spawn("ssh", ["-T", "wilsonte@greatlakes.arc-ts.umich.edu"], {
    name: 'mdi-remote-terminal',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  })
  ipcMain.on('xtermToPty', (event, data) => {
    ptyProcess.write(data)
  })
  ptyProcess.onData(data => {
    // TODO: monitor data for the URL of the server to launch in the iframe
    mainWindow.webContents.send('ptyToXterm', data)
  })
}

// launch a host terminal with a separate, interactive ssh session
// this is external to the electron app itself and must be closed separately
const spawnHostSshTerminal = (sshArgs) => {
  let isWindows = process.platform.toLowerCase().startsWith("win")
  if(isWindows){ // required to create a stable external window
    spawn('cmd.exe', ["/c", "start", "ssh"].concat(sshArgs))
  } else {
    // TODO: handle linux/Mac does this work?
    spawn('ssh', sshArgs)
  }
}

// launch the app in the main renderer, i.e., BrowserWindow
let mainWindow = null
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'js/preload.js')
    },
    autoHideMenuBar: true,
    contextIsolation: true // the default, for clarity
  })

  // set the app title bar based on server mode
  ipcMain.on('setTitle', (event, mode) => {
    BrowserWindow.fromWebContents(event.sender).setTitle("MDI " + mode)
  })

  // launch the ssh terminal processes
  ipcMain.on('installServer', (event, sshArgs) => { // sshArgs is a pre-concatented string
    activateMdiRemoteTerminal(sshArgs)
  })
  ipcMain.on('startServer', (event, sshArgs) => { // sshArgs is a pre-concatented string
    activateMdiRemoteTerminal(sshArgs)
  })
  ipcMain.on('spawnTerminal', (event, sshArgs) => {
    spawnHostSshTerminal(sshArgs)
  })

  // load the page that allows users to configure and launch their server
  mainWindow.loadFile('index.html') 
  mainWindow.webContents.openDevTools(); //////////////
}

// app flow control, see:
//  https://www.electronjs.org/docs/latest/tutorial/quick-start
//  https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata
const gotTheLock = app.requestSingleInstanceLock({})
if (!gotTheLock) {
  app.quit() // allow at most a single instance of the app
} else {
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (mainWindow) { // focus an existent window
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(() => { // create a non-existent window
    createMainWindow()
    app.on('activate', () => { // for Mac
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    })
  })
  app.on('window-all-closed', () => { // all except Mac
    if (process.platform !== 'darwin') app.quit()
  })
}
