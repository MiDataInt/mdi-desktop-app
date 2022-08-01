/* -----------------------------------------------------------
Overall Electron app logic:
  main.js -  launches app and handles interactions with user OS via ipcMain and dialog
  preload.js - handles events raised by renderer.js, preprocesses them, and sends to ipcMain
  renderer.js - runs the restricted client-side web page in the BrowserWindow Chromium process
This recommended use of inter-process communication (IPC) isolates any third party
web content from node.js and other potential security exosures by maintaining
contextIsolation:true, sandbox:true, and nodeIntegration:false in the client browser.
----------------------------------------------------------- */
const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const pty = require('node-pty');
const { spawn } = require('child_process');
const prompt = require('electron-prompt');
const crypto = require('crypto');
app.commandLine.appendSwitch('disable-http-cache');
// app.commandLine.appendSwitch('ignore-gpu-blacklist');

/* -----------------------------------------------------------
developer tools
----------------------------------------------------------- */
const devToolsMode = "detach"; // "left", "undocked", "detach", null

/* -----------------------------------------------------------
app constants and working variables
----------------------------------------------------------- */
const mdiRemoteKey = crypto.randomBytes(16).toString('hex'); // for authorizing http requests in remote and server modes
const desktopAppHelpUrl = 'https://midataint.github.io/mdi-apps-launcher/';
/* -------------------------------------------------------- */
const startWidth = 1400;
const startHeight = 900;
const terminalWidth = 581 + 1 * 3; // determined empirically, plus css border
const serverPanelWidth = terminalWidth + 2 * 10;
const toggleButtonWidth = 20 + 2 * 1; // set in css
const tabControlsHeight = 31; // set in css, including height, padding, bottom border
const contentsStartX = serverPanelWidth + toggleButtonWidth - 2; 
const bodyBorderWidth = 1;
/* ----------------------------------------------------------- */
let mainWindow = null;
let docContents = {
  url: desktopAppHelpUrl,
  proxyRules: "direct://"
};
let frameworkContents = {  // the same for all active framework tabs
  url: desktopAppHelpUrl,
  proxyRules: "direct://"
};
let activeTabIndex = 0; // where 0 = docs, 1 = first framework tab
const showDelay = 1000;
const maxRetries = 10;
let retryCount = 0;
/* ----------------------------------------------------------- */
const isWindows = process.platform.toLowerCase().startsWith("win");
const shellCommand = isWindows ? 'powershell.exe' : 'bash';
let fsDelimiter = isWindows ? "\\" : "/";
let watch = { // for watching node-pty data streams for triggering events
  buffer: "",
  for: "",
  event: null,
  data: undefined
};

/* -----------------------------------------------------------
Electron app windows and flow control, see:
  https://www.electronjs.org/docs/latest/tutorial/quick-start
  https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata
----------------------------------------------------------- */
// if (require('electron-squirrel-startup')) { // to prevent multiple app loads when running Setup.exe
//   return app.quit();
// } else 
if (app.requestSingleInstanceLock({})) { // allow at most a single instance of the app
  app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
    if (mainWindow) { // focus an existing window
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => { // create a non-existent window
    createMainWindow();
    app.on('activate', () => { // for Mac
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
  app.on('window-all-closed', () => { // all except Mac
    if (process.platform !== 'darwin') app.quit();
  });
} else {
  app.quit();
}

/* -----------------------------------------------------------
launch the Electron app in the main renderer, i.e., BrowserWindow
----------------------------------------------------------- */
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, 'assets/logo/portal_blur.ico'),
    width: startWidth,
    height: startHeight,
    useContentSize: true, // thus, number above are the viewport dimensions
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // security settings (defaults repeated here for clarity)
      contextIsolation: true
    },
    autoHideMenuBar: true // we don't need a top menu (File, Edit, etc.)
  });

  // set the app title bar based on server mode
  ipcMain.on('setTitle', (event, mode, connection) => {
    const connectedTo = connection ? (" - " + connection.server) : ""; 
    BrowserWindow.fromWebContents(event.sender).setTitle("MDI " + mode + connectedTo);
  });

  // load the app page that allows users to configure and launch their server
  mainWindow.loadFile('main.html').then(() => {
    addContentView(docContents, startHeight, startWidth, contentsStartX); // the MDI documentation tab (index = 0)
    if(devToolsMode) mainWindow.webContents.openDevTools({ mode: devToolsMode });    
  });

   // asynchronously activate the MDI server connections
   setTimeout(activateAppSshTerminal, 100);
   setTimeout(activateServerTerminal, 200);
};

/* -----------------------------------------------------------
attach and fill BrowserViews with app contents, one or more tabs
----------------------------------------------------------- */
const addContentView = function(contents, viewportHeight, viewportWidth, x) {
  let bounds = viewportHeight ? {
    x: x,
    width: viewportWidth - x,        
    y: bodyBorderWidth + tabControlsHeight, 
    height: viewportHeight - bodyBorderWidth - tabControlsHeight    
  } : mainWindow.getBrowserViews()[0].getBounds(); // framework tabs inherit size from the permanent docs tab
  const contentView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'framework.js'),
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true
    }
  });
  mainWindow.addBrowserView(contentView); // not setBrowserView since we will support multiple tabs
  contentView.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);   // redirect external web links to the user's default browser in the OS
    return { action: 'deny' }; // requires that link have target="_blank", all others do not hit here
  });
  contentView.setAutoResize({
      width: true,
      height: true
  });
  contentView.setBounds(bounds);
  const ses = contentView.webContents.session;
  ses.setProxy({
    proxyRules: contents.proxyRules,
    proxyBypassRules: "127.0.0.1,[::1],localhost"
  }).then(() => {
    retryCount = 0;
    retryShowContents(activeTabIndex, contents);
  }).catch(console.error);
};
const retryShowContents = (tabIndex, contents) => new Promise((resolve, reject) => { 
  retryCount++;
  console.log("attempt #" + retryCount + " to load " + contents.url + " via proxy " + contents.proxyRules);
  mainWindow.getBrowserViews()[tabIndex].webContents.loadURL(contents.url + "?mdiRemoteKey=" + mdiRemoteKey) // send our access key/nonce
    .then(resolve)
    .catch((e) => {
      setTimeout(() => {
        if(retryCount >= maxRetries) return reject(e);
        retryShowContents(tabIndex, contents).then(resolve);
      }, showDelay);
    });
});

/* -----------------------------------------------------------
manage potentially mutiple BrowserView tabs
----------------------------------------------------------- */
const getActiveTab = function(){
  return mainWindow.getBrowserViews()[activeTabIndex]
}
const showActiveTab = function(){
  mainWindow.setTopBrowserView(getActiveTab());
}
ipcMain.on("resizePanelWidths", (event, viewportHeight, viewportWidth, serverPanelWidth) => {
  const x = serverPanelWidth + toggleButtonWidth - 2; // as above, don't know why the -2 is needed
  for(const tab of mainWindow.getBrowserViews()){
    tab.setBounds({ 
      x: x, 
      width: viewportWidth - x,         
      y: bodyBorderWidth + tabControlsHeight, 
      height: viewportHeight - bodyBorderWidth - tabControlsHeight
    });
  }
});
ipcMain.on("showFrameworkContents", (event, url, proxyRules) => { // initialize a new framework contents state
  if(!proxyRules) proxyRules = "direct://";
  frameworkContents = { // set the content metadata for this and all sister tabs
    url: url,
    proxyRules: proxyRules
  };  
  activeTabIndex = 1;  
  addContentView(frameworkContents);
});
ipcMain.on("clearFrameworkContents", (event) => {
  const tabs = mainWindow.getBrowserViews(); // remove all framework tabs
  if(tabs.length > 1) for(let i = tabs.length - 1; i > 0; i--) mainWindow.removeBrowserView(tabs[i])
  showDocumentation(desktopAppHelpUrl);
});
ipcMain.on("refreshContents", (event) => {
  getActiveTab().webContents.reload();
});
ipcMain.on("addTab", (event, viewportHeight, viewportWidth) => {
  activeTabIndex = mainWindow.getBrowserViews().length + 1;
  addContentView(frameworkContents);
});
ipcMain.on("selectTab", (event, tabIndex) => {
  activeTabIndex = tabIndex;
  showActiveTab();
});
ipcMain.on("closeTab", (event, tabIndex) => {
  if(activeTabIndex >= tabIndex) activeTabIndex = tabIndex - 1;
  mainWindow.removeBrowserView(mainWindow.getBrowserViews()[tabIndex])
  showActiveTab();
});

/* -----------------------------------------------------------
enable local file system search for an identity file, R executable, MDI directory, etc.
----------------------------------------------------------- */
const getRBinPathDefault = function(){
  let path = "";
  if(isWindows){
    const rootFolder = 'C:\\Program Files\\R';
    if(fs.existsSync(rootFolder)){
      const versions = fs.readdirSync(rootFolder);
      if(versions.length >= 1) path = rootFolder +  '\\' + versions[versions.length - 1] + '\\bin';
    }
  }
  return path; 
}
ipcMain.handle('getLocalFile', (event, options) => {
  let defaultPath = options.defaultPath;
  if(defaultPath === "rBinPathDefault") defaultPath = getRBinPathDefault();
  if(defaultPath === "sshDir") defaultPath = app.getPath('home') + fsDelimiter + ".ssh";
  if(!defaultPath || !fs.existsSync(defaultPath)) defaultPath = app.getPath('home');
  const files = dialog.showOpenDialogSync(mainWindow, {
    defaultPath: defaultPath,
    properties: [
      options.type === "file" ? "openFile" : "openDirectory",
      "showHiddenFiles"
    ]
  });  
  return files ? files[0] : undefined;
});

/* -----------------------------------------------------------
enable system error and message dialogs via Electron dialog API and electron-prompt
----------------------------------------------------------- */
ipcMain.on('showMessageBoxSync', (event, options) => {
  const result = dialog.showMessageBoxSync(BrowserWindow.fromWebContents(event.sender), options);
  if(options.mdiEvent) mainWindow.webContents.send(options.mdiEvent, result); 
});
ipcMain.on('showPrompt', (event, options) => {
  prompt(options).then((result) => {
    if(result) mainWindow.webContents.send(options.mdiEvent, result); 
  }).catch(console.error);
});

/* -----------------------------------------------------------
activate the in-app node-pty pseudo-terminal that runs the mdi-remote server
----------------------------------------------------------- */
const activateAppSshTerminal = function(){

  // open a pseudo-terminal to the local computer's command shell
  // this terminal will receive appropriate subsequent connect/install/run commands
  let ptyProcess = pty.spawn(shellCommand, [], {
    name: 'mdi-remote-terminal',
    cols: 80,
    rows: 24,
    cwd: app.getPath('home'),
    env: process.env
  });
  ptyProcess.onExit(() => { // handle rare condition where pty exits while app is running
    activateAppSshTerminal();
  });

  // support dynamic terminal resizing
  ipcMain.on('xtermResize', (event, size) => ptyProcess.resize(size.cols, size.rows));

  // establish data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  ipcMain.on('xtermToPty',  (event, data) => ptyProcess.write(data));
  const lineClearRegex = /\x1b\[K\s+/; // https://notes.burke.libbey.me/ansi-escape-codes/
  ptyProcess.onData(data => {
    if(watch.for && // monitor the stream for signals of interest
      !data.match(lineClearRegex)) { // ignoring lines with the ANSI escape code that says to clear a line from the buffer
      watch.buffer += data;
      const match = watch.buffer.match(watch.for);
      if(match){
        mainWindow.webContents.send(watch.event, match[0], watch.data);        
        watch = { // stop watching after the signal hits
          buffer: "",
          for: "",
          event: null,
          data: undefined
        };
      }
    }
    mainWindow.webContents.send('ptyToXterm', data);
  });

  // establish/terminate an ssh connection to the remote server on user request
  // these actions are only used in remote, not local, server modes
  ipcMain.on('sshConnect', (event, sshCommand) => {
    ptyProcess.write(sshCommand.join(" ") + "\r");
    mainWindow.webContents.send("connectedState", {connected: true}); // TODO: smarter way to know whether connection was successful?
  });
  ipcMain.on('sshDisconnect', (event) => {
    ptyProcess.write("\r" + "exit" + "\r\r"); // sometimes need to subsequently type Ctrl-C in terminal window (but not here)
    mainWindow.webContents.send("connectedState", {connected: false});
  });

  // install and run MDI commands on the local or remote server on user request
  // these actions are always required to launch the mdi-apps-framework
  ipcMain.on('installServer', (event, mdi) => {
    if(mdi.mode == "Local"){ // parse local command here due to OS dependency
      const rScript = getRScript(mdi);
      const commands = [
        [
          rScript, "-e", // make sure remotes is installed
          "\"if(require('remotes', character.only = TRUE) == FALSE) install.packages('remotes', repos = 'https://cloud.r-project.org', Ncpus = 4)\""
        ].join(" "),
        [
          rScript, "-e", // make sure mdi-manager is installed
          "\"remotes::install_github('MiDataInt/mdi-manager')\""
        ].join(" "),
        [
          rScript, "-e", // install the mdi
          ["\"mdi::install('", mdi.opt.mdiDir, "', hostDir = '", mdi.opt.hostDir, "')\""].join("")
        ].join(" ")
      ];
      ptyProcess.write(commands.join("\r") + "\r");
    } else { // remote modes sent an mdi command sequence set by preload.js
      ptyProcess.write(mdi.commands.join("; ") + "\r");
    }
  });  
  ipcMain.on('startServer', (event, mdi, mdiPort) => {
    watch = {
      buffer: "",
      for: mdi.mode == "Node" ?
        /\nMDI server running on host port .+:\d+/ :
        /\nListening on http:\/\/.+:\d+/,
      event: "listeningState",
      data: { // passed for use by renderer.js
        listening: true,
        developer: mdi.opt.regular.developer, // logical
        mode: mdi.mode,
        mdiPort: mdiPort
      }
    };
    if(mdi.mode == "Local"){ // parse local command here due to OS dependency
      ptyProcess.write(isWindows ? "$env:MDI_IS_ELECTRON='TRUE'\r" : "export MDI_IS_ELECTRON=TRUE\r"); 
      const rScript = getRScript(mdi);
      const command = [
        rScript, "-e",
        [
          "\"mdi::run('", mdi.opt.mdiDir, 
          "', hostDir = '", mdi.opt.hostDir, 
          "', dataDir = '", mdi.opt.dataDir, 
          "', port = ", "NULL", // R Shiny auto-selects local ports
          ", install = ", mdi.opt.install, 
          ", debug = ", "TRUE", // mdi.opt.developer,
          ", developer = ", mdi.opt.developer, // as string
          ", browser = ", "FALSE", // if TRUE, an external Chrome window is spawned
          ")\"" // install = TRUE
        ].join("")
      ];
      ptyProcess.write(command.join(" ") + "\r");
    } else { // remote modes sent an mdi command sequence set by preload.js
      ptyProcess.write("export MDI_IS_ELECTRON=TRUE\r"); // let mdi-apps-framework known they are running in Electron
      ptyProcess.write("export MDI_REMOTE_KEY=" + mdiRemoteKey + "\r");
      ptyProcess.write(mdi.command.join(" ") + "\r");
    }
  });  
  ipcMain.on('stopServer', (event, mode) => {
    getActiveTab().webContents.session.closeAllConnections().then(() => {
      ptyProcess.write(
        mode === "Local" ? 
        '\x03' :  // SIGNIT, Ctrl-C, ^C, ASCII 3
        "\rquit\r" // key sequence to kill a server in mdi-remote-<server|node>.sh
      );
      mainWindow.webContents.send("listeningState", null, {listening: false});      
    });
  });  
}
const getRScript = function(mdi){ // for local MDI calls
  const delimiter = isWindows ? '\\' : '/';
  let rScript = mdi.opt.regular.rDirectory ? (mdi.opt.regular.rDirectory + delimiter + "Rscript") : "Rscript";
  if(isWindows) rScript = rScript.replace(/ /g, "' '"); // deal with spaces in names
  return rScript;
}

/* -----------------------------------------------------------
launch a host terminal external to the electron app with an interactive [ssh] session 
to give users an additional way to explore a server machine while the MDI is running
----------------------------------------------------------- */
const activateServerTerminal = function(){
  ipcMain.on('spawnTerminal', (event, sshCommand) => {
    if(isWindows){ // 'start' required to create a stable external window
      const shellCommand = "cmd.exe"; // not powershell
      if(!sshCommand) sshCommand = shellCommand; // for Local mode
      spawn(shellCommand, ["/c", "start"].concat(sshCommand));
    } else {
      // TODO: handle linux/Mac does this work?
      // or maybe spawn(shellCommand, ["open", "ssh"].concat(sshArgs));
      spawn('ssh', sshCommand);
    }
  })  
}

/* -----------------------------------------------------------
handle IPC from mdi-apps-framework to Electron
----------------------------------------------------------- */
const showDocumentation = function(url){
  docContents = {
    url: url,
    proxyRules: "direct://"
  };
  activeTabIndex = 0; // i.e., the permanent docs tab
  retryCount = 0;
  retryShowContents(activeTabIndex, docContents).then(() => {
    showActiveTab();
    mainWindow.webContents.send('showDocumentation', url);
  }).catch(console.error);
};
ipcMain.on("showDocumentation", (event, url) => {
  // TODO: further sanitize incoming URL against nefarious requests?
  if(url.match(/https:\/\/.+\.github\.io\//)) showDocumentation(url)
  else console.log("bad documentation url: " + url);
});
