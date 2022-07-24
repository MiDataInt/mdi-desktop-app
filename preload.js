// load dependencies
const { contextBridge, ipcRenderer } = require('electron');

// parse the server config options into proper SSH commands
const assembleSshCommand = (config, tunnel) => {
  // ssh -t $IDENTITY_FILE -o "StrictHostKeyChecking no" -L $SHINY_PORT:127.0.0.1:$SHINY_PORT $USER@$SERVER_URL \
  // ssh -t $IDENTITY_FILE -o "StrictHostKeyChecking no" -D $PROXY_PORT $USER@$SERVER_URL \
  const opt = structuredClone(config.options);
  return ["ssh", "-t"].
    concat(
      opt.advanced.identityFile ? 
      ["-i", opt.advanced.identityFile] : 
      []
    ).
    concat(
      tunnel ? (
        config.mode === "Remote" ? 
        ["-L", [opt.regular.shinyPort, "127.0.0.1", opt.regular.shinyPort].join(":")] : 
        ["-D", opt.advanced.proxyPort]
      ) :
      []
    ).
    concat([opt.regular.user + "@" + opt.regular.serverDomain]);
}

// parse the server config options into proper MDI commands
const parseLocalOptions = function(opt){
  opt.mdiDir = opt.regular.mdiDirectoryLocal;
  return opt;
}
const parseRemoteOptions = function(opt){
  opt.mdiDir = opt.regular.mdiDirectoryRemote;
  opt.remoteTarget = opt.mdiDir + "/remote/" + (opt.isNode ? "mdi-remote-node" : "mdi-remote-server") + ".sh";
  opt.advanced.dataDirectory = opt.advanced.dataDirectoryRemote || "NULL";
  opt.advanced.hostDirectory = opt.advanced.hostDirectoryRemote || "NULL";
  opt.regular.developer = opt.regular.developer.toString().toUpperCase();
  opt.regular.rLoadCommand = opt.regular.rLoadCommand ? opt.regular.rLoadCommand.replace(/ /g, "~~") : "echo";
  return opt;
}
const assembleLocalInstall = function(opt){
    // install(
    //   mdiDir = "~",
    //   hostDir = NULL
    // )
  // $R_LOAD_COMMAND; \
  // export SUPPRESS_MDI_BASHRC=TRUE; \
  // if [ ! -d $MDI_DIRECTORY ]; then mkdir -p $MDI_DIRECTORY; fi; \
  // cd $MDI_DIRECTORY; \
  // if [ ! -e install.sh ]; then git clone https://github.com/MiDataInt/mdi.git .; fi; \
  // if [ ! -e mdi ]; then ./install.sh 1; fi; \
  // ./mdi install $IP_FLAG $FORKS_FLAG --n-cpu $INSTALL_N_CPU; \
}
const assembleRemoteInstall = function(opt){

}
const assembleLocalRun = function(opt){

}
const assembleRemoteRun = function(opt){
  opt = parseRemoteOptions(opt);
  return [
    "bash",
    opt.remoteTarget,
    opt.regular.shinyPort,
    opt.mdiDir,
    opt.advanced.dataDirectory,
    opt.advanced.hostDirectory,
    opt.regular.developer,
    opt.regular.rLoadCommand,
    opt.regular.serverDomain
  ]
}
const assembleNodeRun = function(opt){
  opt = parseRemoteOptions(opt);
  return [
    "bash",
    opt.remoteTarget,
    opt.advanced.proxyPort,
    opt.regular.rLoadCommand,
    opt.regular.shinyPort,
    opt.mdiDir,
    opt.advanced.dataDirectory,
    opt.advanced.hostDirectory,
    opt.regular.developer,
    opt.regular.clusterAccount,
    opt.regular.jobTimeMinutes,
    opt.advanced.cpusPerTask,
    opt.advanced.memPerCpu,
    opt.regular.serverDomain
  ]
}
const assembleMdiCommand = (action, config) => {
  const opt = structuredClone(config.options);
  opt.isLocal = config.mode === "Local";
  opt.isNode  = config.mode === "Node";
  return action === "install" ? (
    opt.isLocal ? assembleLocalInstall(opt) : assembleRemoteInstall(opt)
  ) : (
    opt.isLocal ? assembleLocalRun(opt) : (opt.isNode ? assembleNodeRun(opt) : assembleRemoteRun(opt))
  );
}
// const nullPreset = {
//   mode: "Remote",
//   options: {
//       regular:{
//           user: "",
//           serverDomain: "greatlakes.arc-ts.umich.edu",
//           clusterAccount: "",
//           jobTimeMinutes: 120,
//           mdiDirectoryRemote: "~/mdi",
//           mdiDirectoryLocal: "~/mdi",
//           rLoadCommand: "",
//           rDirectory: "",
//           shinyPort: 3838,
//           developer: false   
//       },
//       advanced:{
//           identityFile: "",            
//           dataDirectoryRemote: "",
//           dataDirectoryLocal: "",
//           hostDirectoryRemote: "",
//           hostDirectoryLocal: "",
//           proxyPort: 1080,
//           cpusPerTask: 2,
//           memPerCpu: "4g"
//       }
//   }
// };

// use contextBridge for inter-process communication (IPC) since contextIsolation:true
contextBridge.exposeInMainWorld('mdi', {

  // dynamically set the app window title
  setTitle: (mode) => ipcRenderer.send('setTitle', mode),

  // enable error and message dialogs
  showMessageBoxSync: (options) => ipcRenderer.send('showMessageBoxSync', options),

  // support dynamic terminal resizing
  xtermResize: (size) => ipcRenderer.send('xtermResize', size),

  // enable local file system search for an identity file
  getLocalFile: (type) => ipcRenderer.invoke('getLocalFile', type),
  
  // data flow between the back-end node-pty pseudo-terminal and the front-end xterm terminal window
  // using IPC obviates the need for setting nodeIntegration:true
  xtermToPty: (data) => ipcRenderer.send('xtermToPty', data),
  ptyToXterm: (data) => ipcRenderer.on('ptyToXterm', data),

  // establish/terminate an ssh connection to the remote server on user request
  sshConnect: (config) => {
    let sshCommand = assembleSshCommand(config, true);
    ipcRenderer.send('sshConnect', sshCommand);
  },
  sshDisconnect: (config) => {
    console.log(config)
    ipcRenderer.send('sshDisconnect', config.mode);
  },

  // install the MDI frameworks on the remote server
  installServer: (config) => {
    let mdiCommand = assembleMdiCommand('install', config);
    ipcRenderer.send('installServer', mdiCommand);
  },
  runServer: (config) => {
    let mdiCommand = assembleMdiCommand('run', config);
    ipcRenderer.send('runServer', mdiCommand);
  },

  // launch a host terminal external to the electron app with an interactive ssh session 
  spawnTerminal: (config) => {
    let sshCommand = assembleSshCommand(config, false);
    ipcRenderer.send('spawnTerminal', sshCommand)
  },
  // launchFramework: (shinyPort) => {
  //   // TODO: handle window switch to loadURL("http://127.0.0.1:shinyPort")
  //   // or, just do this in main window using iframe?
  // },  
});
