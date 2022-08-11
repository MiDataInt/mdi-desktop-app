/* -----------------------------------------------------------
Overall Electron app logic:
  main.js          launches app and handles interactions with user OS via ipcMain and dialog
  preload-main.js  handles events raised by renderer.js, preprocesses them, and sends to ipcMain
  renderer.js      runs the restricted client-side web page in the BrowserWindow chromium process
This recommended use of inter-process communication (IPC) isolates any third party
web content from node.js and other potential security exosures by maintaining
contextIsolation:true, sandbox:true, and nodeIntegration:false in the client browser.
----------------------------------------------------------- */
// dependencies required to load the main page
const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell } = require('electron');
const path = require('path');
app.commandLine.appendSwitch('disable-http-cache');
// deferred dependencies loaded on demand for faster app loading
let mods = {};
const mod = function(module){
  if(!mods[module]) mods[module] = require(module);
  return mods[module];
}

/* -----------------------------------------------------------
app constants and working variables
----------------------------------------------------------- */
const isDev = process.argv.includes("MDI_DEV_TOOLS");
let mdiRemoteKey_ = null; // for authorizing http requests in remote and server modes
const mdiRemoteKey = function(){ // key set once on every app instance, i.e., user encounter
  if(!mdiRemoteKey_) mdiRemoteKey_ = mod('crypto').randomBytes(16).toString('hex');
  return mdiRemoteKey_;
}
const desktopAppHelpUrl = 'https://midataint.github.io/mdi-desktop-app/';
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
let tabContents = {
  Docs: {
    url: desktopAppHelpUrl,
    proxyRules: "direct://"
  },
  framework: {  // the same for all active framework tabs
    url: desktopAppHelpUrl,
    proxyRules: "direct://"
  }
};
let externalTabIndex = {}; // for external sites
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
    // icon: path.join(__dirname, 'assets/logo/mdi-logo_256x256px.png'), // electron-builder handles the icon
    width: startWidth,
    height: startHeight,
    useContentSize: true, // thus, number above are the viewport dimensions
    webPreferences: {
      preload: path.join(__dirname, 'preload-main.js'),
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
  mainWindow.loadFile('main.html').then(() => { // then load/activate additional contents into the app
    addContentView(tabContents.Docs, false, startHeight, startWidth, contentsStartX); // the MDI documentation tab (index = 0)
    activateAppSshTerminal();
    activateServerTerminal();
    if(isDev) mainWindow.webContents.openDevTools({ mode: "detach" });   
    activateAutoUpdater();
  });
};

/* -----------------------------------------------------------
attach and fill BrowserViews with app contents, one or more tabs
----------------------------------------------------------- */
const addContentView = function(contents, external, viewportHeight, viewportWidth, x) {
  let bounds = viewportHeight ? {
    x: x,
    width: viewportWidth - x,        
    y: bodyBorderWidth + tabControlsHeight, 
    height: viewportHeight - bodyBorderWidth - tabControlsHeight    
  } : mainWindow.getBrowserViews()[0].getBounds(); // framework tabs inherit size from the permanent docs tab
  const contentView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-content.js'),
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true
    }
  });
  mainWindow.addBrowserView(contentView); // not setBrowserView since we will support multiple tabs
  // LEFT FOR REFERENCE: not preferred since demands target="_blank"; see externalLink action below
  // contentView.webContents.setWindowOpenHandler(({ url }) => { 
  //   shell.openExternal(url);   // redirect external web links to the user's default browser in the OS
  //   return { action: 'deny' }; // requires that link have target="_blank", all others do not hit here
  // });
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
    retryShowContents(activeTabIndex, contents, external);
  }).catch(console.error);
};
const retryShowContents = (tabIndex, contents, external) => new Promise((resolve, reject) => { 
  retryCount++;
  if(isDev) console.log("attempt #" + retryCount + " to load " + contents.url + " via proxy " + contents.proxyRules);
  const webContents = mainWindow.getBrowserViews()[tabIndex].webContents;
  if(external){
    webContents
      .loadFile("redirect.html", {query: {url: contents.url }})
      .then(resolve)
      .catch(console.error);
  } else {
    webContents
      .loadURL(contents.url + "?mdiRemoteKey=" + mdiRemoteKey()) // send our access key/nonce
      .then(resolve)
      .catch((e) => {
        setTimeout(() => {
          if(retryCount >= maxRetries) return reject(e);
          retryShowContents(tabIndex, contents, external).then(resolve);
        }, showDelay);
      });    
  }
});

/* -----------------------------------------------------------
manage potentially mutiple BrowserView tabs
----------------------------------------------------------- */
const getActiveTab = function(){
  return mainWindow.getBrowserViews()[activeTabIndex]
}
const showActiveTab = function(){
  setTimeout(() => mainWindow.setTopBrowserView(getActiveTab()), 0);
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
  tabContents.framework = { // set the content metadata for this and all sister tabs
    url: url,
    proxyRules: proxyRules
  };  
  activeTabIndex = 1;  
  addContentView(tabContents.framework);
});
ipcMain.on("clearFrameworkContents", (event) => {
  const tabs = mainWindow.getBrowserViews(); // remove all framework tabs
  if(tabs.length > 1) for(let i = tabs.length - 1; i > 0; i--) mainWindow.removeBrowserView(tabs[i])
  showDocumentation(desktopAppHelpUrl);
});
ipcMain.on("refreshContents", (event) => {
  getActiveTab().webContents.reload();
});
ipcMain.on("contentsBack", (event, listening) => {
  if(activeTabIndex === 0 || // don't support back button on apps-framework tabs
     !listening ||
     Object.values(externalTabIndex).includes(activeTabIndex)
  ) getActiveTab().webContents.goBack();
});
ipcMain.on("launchExternalTab", (event, listening) => {
  const url = activeTabIndex == 0 || !listening ? tabContents.Docs.url : tabContents.framework.url;
  if(confirmExternalUrl(url)) shell.openExternal(url + (
    listening && activeTabIndex > 0 ? 
    "?mdiRemoteKey=" + mdiRemoteKey() :
    ""
  ));
});
ipcMain.on("addTab", (event, viewportHeight, viewportWidth) => {
  activeTabIndex = mainWindow.getBrowserViews().length;
  addContentView(tabContents.framework);
});
ipcMain.on("selectTab", (event, tabIndex) => {
  activeTabIndex = tabIndex;
  showActiveTab();
});
ipcMain.on("closeTab", (event, tabIndex) => {
  if(activeTabIndex >= tabIndex) activeTabIndex = tabIndex - 1;
  mainWindow.removeBrowserView(mainWindow.getBrowserViews()[tabIndex])
  showActiveTab();
  for(tab of Object.keys(externalTabIndex)){
    if(externalTabIndex[tab] == tabIndex){
      delete externalTabIndex[tab];
      break;
    } else if(externalTabIndex[tab] > tabIndex){
      externalTabIndex[tab]--;
    }
  }
});

/* -----------------------------------------------------------
enable local file system search for an identity file, R executable, MDI directory, etc.
----------------------------------------------------------- */
ipcMain.handle('getLocalFile', (event, options) => {
  let defaultPath = options.defaultPath;
  if(defaultPath === "rscriptPathDefault") defaultPath = getRscriptPathDefault();
  if(defaultPath === "sshDir") defaultPath = app.getPath('home') + fsDelimiter + ".ssh";
  if(!defaultPath || !mod('fs').existsSync(defaultPath)) defaultPath = app.getPath('home');
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
  mod("electron-prompt")(options).then((result) => {
    if(result) mainWindow.webContents.send(options.mdiEvent, result); 
  }).catch(console.error);
});

/* -----------------------------------------------------------
activate the in-app node-pty pseudo-terminal that runs the mdi-remote server
----------------------------------------------------------- */
let terminalInitSize = null; // capture early xterm resize before pty is active
const setInitPtySize = (event, size) => terminalInitSize = size;
ipcMain.on('ptyResize', setInitPtySize);
const activateAppSshTerminal = function(){

  // open a pseudo-terminal to the local computer's command shell
  // this terminal will receive appropriate subsequent connect/install/run commands
  let ptyProcess = mod("node-pty").spawn(shellCommand, [], {
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
  ipcMain.on('ptyResize', (event, size) => ptyProcess.resize(size.cols, size.rows));
  ipcMain.removeListener('ptyResize', setInitPtySize);
  if(terminalInitSize) ptyProcess.resize(terminalInitSize.cols, terminalInitSize.rows);

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
      parseMdiPath(mdi).then((mdi) => {
        const rScript = getRScript(mdi);
        const commands = [
          [
            rScript.target, "-e", // make sure remotes is installed
            "\"" + rScript.libPaths + "; if(require('remotes', character.only = TRUE) == FALSE) install.packages('remotes', repos = 'https://cloud.r-project.org', Ncpus = 4)\""
          ].join(" "),
          [
            rScript.target, "-e", // make sure mdi-manager is installed
            "\"" + rScript.libPaths + "; remotes::install_github('MiDataInt/mdi-manager')\""
          ].join(" "),
          [
            rScript.target, "-e", // install the mdi
            ["\"" + rScript.libPaths + "; mdi::install('", mdi.opt.mdiDir, "', hostDir = '", mdi.opt.hostDir, "', confirm = FALSE)\""].join("")
          ].join(" ")
        ];
        ptyProcess.write(commands.join("\r") + "\r");
      }).catch(() => {});
    } else { // remote modes sent as a mdi command sequence set by preload-main.js
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
      parseMdiPath(mdi).then((mdi) => {
        ptyProcess.write(isWindows ? "$env:MDI_IS_ELECTRON='TRUE'\r" : "export MDI_IS_ELECTRON=TRUE\r"); 
        const rScript = getRScript(mdi);
        const command = [
          rScript.target, "-e",
          [
            "\"" + rScript.libPaths + "; mdi::run('", mdi.opt.mdiDir, 
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
      }).catch(() => {});
    } else { // remote modes sent as a mdi command sequence set by preload-main.js
      ptyProcess.write("export MDI_IS_ELECTRON=TRUE\r"); // let mdi-apps-framework known they are running in Electron
      ptyProcess.write("export MDI_REMOTE_KEY=" + mdiRemoteKey() + "\r");
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

/* -----------------------------------------------------------
launch a host terminal external to the electron app with an interactive [ssh] session 
to give users an additional way to explore a server machine while the MDI is running
----------------------------------------------------------- */
const activateServerTerminal = function(){
  const { spawn } = require('child_process');
  ipcMain.on('spawnTerminal', (event, sshCommand) => {
    try {
      if(isWindows){ // 'start' required to create a stable external window
        const shellCommand = "cmd.exe"; // not powershell
        if(!sshCommand) sshCommand = shellCommand; // for Local mode
        spawn(shellCommand, ["/c", "start"].concat(sshCommand));
      } else {
        let osaScript = ['-e', 'tell application "Terminal" to activate'];
        const terminalCommand = sshCommand ?
          ['-e', 'tell application "Terminal" to do script "' + sshCommand.join(" ") + '"'] : 
          ['-e', 'tell application "Terminal" to do script ""'];
        spawn('osascript', osaScript.concat(terminalCommand));
      }
    } catch(error) { console.error(error) }
  })  
}

/* -----------------------------------------------------------
MDI local file path utility functions
----------------------------------------------------------- */
const parseMdiPath = (mdi) => new Promise((resolve, reject) => { 
  // if missing, add '/mdi' to MDI Directory
  const tail ='/mdi';
  if(!mdi.opt.mdiDir.endsWith(tail)) mdi.opt.mdiDir = mdi.opt.mdiDir + tail;  
  // resolve if either MDI Directory or its parent exists  
  if(mod('fs').existsSync(mdi.opt.mdiDir)) return resolve(mdi);
  if(mod('fs').existsSync(path.dirname(mdi.opt.mdiDir))) {
    mod('fs').mkdirSync(mdi.opt.mdiDir);
    return resolve(mdi);
  };
  dialog.showMessageBoxSync(mainWindow, {
    title: "Bad MDI Directory",
    message: "MDI Directory is not a valid local path for MDI installation.",
    type: "warning"
  });
  reject();
});
const getRScript = function(mdi){ // for local MDI calls
  const rScript = mdi.opt.regular.rscriptPath;
  const hash = mod('crypto').createHash('md5').update(rScript).digest("hex");
  const rLibsPath = mdi.opt.mdiDir + '/library/';
  if(!mod('fs').existsSync(rLibsPath)) mod('fs').mkdirSync(rLibsPath);
  const rLibPath = rLibsPath + hash;
  if(!mod('fs').existsSync(rLibPath)) mod('fs').mkdirSync(rLibPath);
  const libPaths = isWindows ? 
    ".libPaths(gsub('\\\\', '/', '" + rLibPath + "', fixed = TRUE))":
    ".libPaths('" + rLibPath + "')"
  return {
    target: rScript.replace(/ /g, "' '"), // deal with spaces in names on Windows,
    libPaths: libPaths
  };
}
const getRscriptPathDefault = function(){
  const parsePath_ = function(rootFolder, delimiter, suffix){
    let path = "";
    if(mod('fs').existsSync(rootFolder)){
      const versions = mod('fs').readdirSync(rootFolder);
      if(versions.length >= 1) path = rootFolder + delimiter + versions[versions.length - 1] + suffix;
    }
    return path;
  }
  if(isWindows) return(parsePath_('C:\\Program Files\\R', '\\', '\\bin\\Rscript.exe'));
  return(parsePath_('/Library/Frameworks/R.framework/Versions', '/', '/Resources/bin/Rscript'));
}

/* -----------------------------------------------------------
handle IPC from mdi-apps-framework to Electron
----------------------------------------------------------- */
const allowedExternalUrls = { // exert explicit control over the external sites we support
  Docs:     /^http[s]*:\/\/[a-zA-Z0-9-_.]*github\.io\//, // all other urls/targets are ignored  
  GitHub:   /^http[s]*:\/\/[a-zA-Z0-9-_.]*github\.com\//,
  // Globus:   /^http[s]*:\/\/[a-zA-Z0-9-_.]*globus\.org\//,
  // CRAN:     /^http[s]*:\/\/[a-zA-Z0-9-_.]*cran\.r-project\.org\//,
  // RStudio:  /^http[s]*:\/\/[a-zA-Z0-9-_.]*rstudio\.com\//,
  // Electron: /^http[s]*:\/\/[a-zA-Z0-9-_.]*electronjs\.org\//,
  // Google:   /^http[s]*:\/\/[a-zA-Z0-9-_.]*google\.com\//,
  // UMich:    /^http[s]*:\/\/[a-zA-Z0-9-_.]*umich\.edu\//
};
const showDocumentation = function(url){
  if(url.match(allowedExternalUrls.Docs)) {
    tabContents.Docs = {
      url: url,
      proxyRules: "direct://"
    };
    activeTabIndex = 0; // i.e., the permanent docs tab
    retryCount = 0;
    retryShowContents(activeTabIndex, tabContents.Docs).then(() => {
      showActiveTab();
      mainWindow.webContents.send('showDocumentation', url);
    }).catch(console.error);
  } else {
    if(isDev) console.log("bad documentation url: " + url);
  }
};
ipcMain.on("showDocumentation", (event, url) => showDocumentation(url));
ipcMain.on("externalLink", (event, data) => {
  if(!data.url || !data.target) return;
  if(data.target == "Docs") return showDocumentation(data.url);
  for(tab of Object.keys(allowedExternalUrls)){
    if(data.url.match(allowedExternalUrls[tab])){
      tabContents[tab] = {
        url: data.url,
        proxyRules: "direct://"
      };
      if(externalTabIndex[tab]){ // allow exactly one tab per external site
        activeTabIndex = externalTabIndex[tab];
        retryCount = 0;
        retryShowContents(activeTabIndex, tabContents[tab], true).then(() => {
          showActiveTab();
          mainWindow.webContents.send('showExternalLink', tab, activeTabIndex, false);
        }).catch(console.error);
      } else { // first instance of a new external target
        activeTabIndex = mainWindow.getBrowserViews().length;
        addContentView(tabContents[tab], true);
        externalTabIndex[tab] = activeTabIndex;
        mainWindow.webContents.send('showExternalLink', tab, activeTabIndex, true);
      }
      return;
    }
  }
  if(confirmExternalUrl(data.url)) shell.openExternal(data.url);
});
const confirmExternalUrl = function(url){
  return dialog.showMessageBoxSync(
    mainWindow, 
    {
      message: "Do you wish to launch the following site " + 
               "in your default browser, e.g., Chrome or Safari.\n\n" + url,
      type: "question",
      title: "  Launch External Browser",
      buttons: ["Cancel", "Confirm"],
      noLink: true
    }
  );
}

/* -----------------------------------------------------------
support automatic update via electron-builder and electron-updater
----------------------------------------------------------- */
const sendAutoUpdate = (message) => mainWindow.webContents.send("autoUpdateStatus", message);
const activateAutoUpdater = function(){
  const { autoUpdater } = require("electron-updater"); 
  // autoUpdater.on('checking-for-update', () => {
  //   sendAutoUpdate('Checking for update...');
  // });
  // autoUpdater.on('update-available', (info) => {
  //   sendAutoUpdate('Update available.');
  // })
  // autoUpdater.on('update-not-available', (info) => {
  //   sendAutoUpdate('Update not available.');
  // });
  // autoUpdater.on('error', (err) => {
  //   sendAutoUpdate('Error in auto-updater. ' + err);
  // });
  // autoUpdater.on('download-progress', (progressObj) => {
  //   let log_message = "Download speed: " + progressObj.bytesPerSecond;
  //   log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  //   log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  //   sendAutoUpdate(log_message);
  // });
  // autoUpdater.on('update-downloaded', (info) => {
  //   sendAutoUpdate('Update downloaded');
  //   sendAutoUpdate(info);
  // });
  autoUpdater.checkForUpdatesAndNotify(); // immediately download an update, install when app quits
};
