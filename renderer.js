/* -----------------------------------------------------------
renderer.js has no access to Node or local system except through preload.js contextBridge
----------------------------------------------------------- */

/* -----------------------------------------------------------
initialize the xterm terminal window and associated events and data flow
----------------------------------------------------------- */
const terminalDiv = document.getElementById("terminal");
const xtermCols = 80; // fixed
let xtermRows = 24;   // dynamically resized
const xtermCharHeight = 280 / 20; // determined empirically
const xterm = new Terminal({
    cols: xtermCols,
    rows: xtermRows,
    fontFamily: "monospace",
    fontSize: 12,
    cursorStyle: "bar",
    cursorBlink: true,
    cursorWidth: 2
});
xterm.open(terminalDiv);
xterm.onResize((size) => mdi.xtermResize(size));
xterm.onData((data) => mdi.xtermToPty(data));
mdi.ptyToXterm((event, data) => { xterm.write(data) });

/* -----------------------------------------------------------
activate dynamic element resizing
----------------------------------------------------------- */
const serverConfigPanel = document.getElementById("server-config");
const toggleButton = document.getElementById('server-panel-toggle');
const terminalWidth = 581 + 1 * 3; // determined empirically, plus css border
const serverPanelPadding = 10;
const serverPanelWidth = terminalWidth + 2 * serverPanelPadding;
const toggleButtonWidth = 20 + 2 * 1; // set in css
let serverPanelWorkingWidth = serverPanelWidth;
const resizePanelWidths = function(){ // control the horizontal display, for hiding serverPanel under contentView 
    mdi.resizePanelWidths(window.innerWidth, serverPanelWorkingWidth);
    toggleButton.style.left = serverPanelWorkingWidth + "px";
}
const resizePanelHeights = function(){ // control xterm terminal height based on viewport and options displays
    const xtermHeight = window.innerHeight - serverConfigPanel.clientHeight - 2 * serverPanelPadding;
    const xtermRows = Math.max(1, Math.floor(xtermHeight / xtermCharHeight));
    xterm.resize(xtermCols, xtermRows);    
}
const resizePanels = function(){
    resizePanelWidths();
    resizePanelHeights();
}
resizePanels();
window.addEventListener('resize', (event) => resizePanelHeights()); // resizePanelWidths not needed, handled by BrowserView

/* -----------------------------------------------------------
activate the button to toggle server-panel visibility, with a bit of animation
----------------------------------------------------------- */
const toggleServerPanel = function(){
    const collapsing = serverPanelWorkingWidth > 0;
    let id = null;
    let target = null;
    let inc = null;
    if(collapsing){
        target = 0;
        inc = -1;
    } else {
        target = serverPanelWidth;
        inc = 1;
    }
    clearInterval(id);
    const animate = function() {
        if (serverPanelWorkingWidth == target) {
            clearInterval(id);
            toggleButton.innerHTML = collapsing ? "&gt;" : "&lt;";
        } else {
            serverPanelWorkingWidth += Math.floor(inc * serverPanelWidth / 50); // animation speed set here
            serverPanelWorkingWidth = Math.min(Math.max(serverPanelWorkingWidth, 0), serverPanelWidth);
            resizePanelWidths();
        }
    }    
    id = setInterval(animate, 0);
}
toggleButton.addEventListener('click', function(event) {
    toggleServerPanel();
});

/* -----------------------------------------------------------
activate the MDI apps server action buttons
----------------------------------------------------------- */
const sshConnectButton    = document.getElementById('ssh-connect');
const sshDisconnectButton = document.getElementById('ssh-disconnect');
const installServerButton = document.getElementById('install-server');
const startServerButton   = document.getElementById('start-server');
const stopServerButton    = document.getElementById('stop-server');
const spawnTerminalButton = document.getElementById('spawn-terminal');
const buttonsHr = document.getElementById('buttons-hr');
let serverState = {
    connected: false, // whether an ssh connection has been established
    listening: false, // whether the mdi-apps-framework is running
    nButtons: 0
};
const setButtonVisibility = function(button, isVisible){
    button.style.display = isVisible ? "inline-block" : "none";
    if(isVisible) serverState.nButtons++;
}
const setButtonsVisibility = function(){
    const config = presets[presetSelect.value];
    const isLocal = config.mode == "Local";
    const isConnected = isLocal || serverState.connected;
    const sshIsReady = checkActionReadiness("ssh", true).success;
    const installIsReady = checkActionReadiness("mdi", "install").success;
    const runIsReady = checkActionReadiness("ssh", "run").success;
    const terminalIsReady = checkActionReadiness("ssh", false).success;
    serverState.nButtons = 0;
    setButtonVisibility(sshConnectButton,    !isLocal && sshIsReady && !serverState.connected);
    setButtonVisibility(sshDisconnectButton, !isLocal && sshIsReady &&  serverState.connected && !serverState.listening);
    setButtonVisibility(installServerButton, isConnected && installIsReady && !serverState.listening);
    setButtonVisibility(startServerButton,   isConnected && runIsReady && !serverState.listening);
    setButtonVisibility(stopServerButton,    isConnected && serverState.listening);
    setButtonVisibility(spawnTerminalButton, terminalIsReady);
    buttonsHr.style.display = serverState.nButtons > 0 ? "block" : "none";
    resizePanelHeights();
}
const sshRequiredOptions = function(config, createTunnel){
    const isLocal = config.mode === "Local";
    const isNode = config.mode === "Node";
    return {
        regular:{
            user: !isLocal,
            serverDomain: !isLocal,
            shinyPort: createTunnel && !isNode
        },
        advanced:{        
            proxyPort: createTunnel && isNode
        }
    }    
};
const mdiRequiredOptions = function(config, action){
    const isInstall = action === "install";    
    const isLocal = config.mode === "Local";
    const isNode  = config.mode === "Node";
    const isNodeRun = !isInstall && isNode
    return {
        regular: {
            serverDomain: !isInstall && !isLocal,
            clusterAccount: isNodeRun,
            jobTimeMinutes: isNodeRun,
            mdiDirectoryRemote: !isLocal,
            mdiDirectoryLocal: isLocal,
            shinyPort: true 
        },
        advanced: {                 
            proxyPort: isNodeRun,
            cpusPerTask: isNodeRun,
            memPerCpu: isNodeRun
        }
    }   
}
checkActionReadiness = function(commandType, extra){
    const config = presets[presetSelect.value];
    const requiredOptions = commandType == "ssh" ? sshRequiredOptions(config, extra) : mdiRequiredOptions(config, extra);
    for(optionType of ["regular", "advanced"]){
        for(option of Object.keys(requiredOptions[optionType])){
            if(!requiredOptions[optionType][option]) continue;
            if(!config.options[optionType][option]) return {success: false, option: option};
        }
    }
    return {success: true, config: config};
}
const getConfig = function(commandType, extra){
    const check = checkActionReadiness(commandType, extra);
    if(check.success) return check.config;
    mdi.showMessageBoxSync({
        message: "Option '" + check.option + "' is required for " + commandType + " actions.",
        type: "warning",
        title: "Missing option value"
    });
};
sshConnectButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', true);
    if(!config) return;
    mdi.sshConnect(config);
    xterm.focus();
});
sshDisconnectButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', false);
    if(!config) return;
    mdi.sshDisconnect();
    xterm.focus();
});
installServerButton.addEventListener('click', function(event) {
    const config = getConfig('mdi', 'install');
    if(!config) return;
    mdi.installServer(config);
    xterm.focus();
});
startServerButton.addEventListener('click', function(event) {
    const config = getConfig('mdi', 'run');
    if(!config) return;
    mdi.startServer(config);
});
stopServerButton.addEventListener('click', function(event) {
    const config = getConfig('mdi', 'run');
    if(!config) return;
    mdi.stopServer(config);
    xterm.focus();
});
spawnTerminalButton.addEventListener('click', function(event) {
    const config = getConfig('ssh', false);
    if(!config) return;
    mdi.spawnTerminal(config);
});

/* -----------------------------------------------------------
activate dynamic server configuration inputs (initialized in upside-down fashion)
----------------------------------------------------------- */

// use IPC to access the local file system
const fileOptionInputs = document.getElementsByClassName('fileOptionInput');
for (const fileOptionInput of fileOptionInputs) {
    const elements = fileOptionInput.children;
    elements[1].addEventListener('click', async () => {
        const filePath = await mdi.getLocalFile(elements[1].dataset.type);
        if(filePath) elements[0].value = filePath;
        elements[0].dispatchEvent(new Event('change', {bubbles: true}));
    });
}

// act on option value changes
// edits are always accumulated in the "Working" configuration
const optionForms   = document.getElementsByClassName('optionsForm');
const configOptions = document.getElementsByClassName('config-option');
const commitWorkingChanges = function(){
    savePresets();
    presetSelect.value = "working";
    setButtonsVisibility();    
}
const handleInputChange = function(form, input){
    const type = form.dataset.type; 
    const option = input.name;
    const value = input.type === "checkbox" ? input.checked : input.value.trim();
    if(presets.working.options       === undefined) presets.working.options       = structuredClone(defaultPreset.options);
    if(presets.working.options[type] === undefined) presets.working.options[type] = structuredClone(defaultPreset.options[type]);
    presets.working.options[type][option] = value;
    commitWorkingChanges();
}
for (const optionForm of optionForms){ // listen to the form to catch input change events by propagation
    optionForm.addEventListener('change', function(event){
        handleInputChange(this, event.target);
    });
}

// control the available options based on server mode
const setServerMode = function(mode, suppressWorking){
    mdi.setTitle(mode)
    for (const configOption of configOptions) {
        configOption.style.display = configOption.classList.contains(mode) ? "block" : "none";
    }
    for (const modeRadio of modeRadios) {
        modeRadio.checked = modeRadio.value === mode;
    }
    const config = presets[presetSelect.value].options;
    for (const optionForm of optionForms){ // update input values from the preset + mode
        const optionType = optionForm.dataset.type;
        for(const input of optionForm.elements){
            const option = input.name;
            const value = config[optionType][option];
            if(input.type === "checkbox"){
                input.checked = value;
            } else {
                input.value = value;
            }
        }
    }
    resizePanelHeights();
    presets.working.mode = mode;
    suppressWorking ? setButtonsVisibility() : commitWorkingChanges();
}

// control available options based on show/hide advanced link
const toggleAdvanced  = document.getElementById('toggleAdvanced');
const advancedOptions = document.getElementById('advancedOptions');
let advancedAreVisible = false;
toggleAdvanced.addEventListener('click', function(){
    advancedAreVisible = !advancedAreVisible;
    advancedOptions.style.display = advancedAreVisible ? "block" : "none";
    resizePanelHeights();
});

// server mode, i.e., where the mdi-apps-framework will run
const modeRadios = document.serverMode.mode;
for (const modeRadio of modeRadios) {
    modeRadio.addEventListener('change', function(){
        setServerMode(this.value);
    });
}

// save/load user-defined configurations, i.e., Presets, from localStorage
const presetSelect = document.getElementById('preset');
const presetsKey = "mdi-launcher-presets";
const restrictedPresets = ["defaults", "mostRecent", "working"];
const defaultPreset = { // for quickest creation of a config for UM Great Lakes remote mode
    mode: "Remote",
    options: {
        regular:{
            user: "",
            serverDomain: "greatlakes.arc-ts.umich.edu",
            clusterAccount: "",
            jobTimeMinutes: 120,
            mdiDirectoryRemote: "~/mdi",
            mdiDirectoryLocal: "~/mdi",
            rLoadCommand: "",
            rDirectory: "",
            shinyPort: 3838,
            developer: false   
        },
        advanced:{
            identityFile: "",            
            dataDirectoryRemote: "",
            dataDirectoryLocal: "",
            hostDirectoryRemote: "",
            hostDirectoryLocal: "",
            proxyPort: 1080,
            cpusPerTask: 2,
            memPerCpu: "4g"
        }
    }
};
let presets = localStorage.getItem(presetsKey);
const savePresets = function(setMostRecent) {
    if(setMostRecent){ // save the current preset as last known good config state for next app load
        const config = presets[presetSelect.value];
        presets.mostRecent = structuredClone(config);
    }
    localStorage.setItem(presetsKey, JSON.stringify(presets));
}
if(!presets) {
    presets = {
        defaults:   structuredClone(defaultPreset),
        mostRecent: structuredClone(defaultPreset),
        working:    structuredClone(defaultPreset)
    };
    savePresets();
} else {
    presets = JSON.parse(presets);
}
const updatePresets = function(){
    let current = [];
    for(option of presetSelect.options) current.push(option.value);
    let new_ = Object.keys(presets);
    for(let i = current.length - 1; i >= 0; i--){ // delete action
        const x = current[i];
        if(!new_.includes(x) && !restrictedPresets.includes(x)) presetSelect.remove(i);
    }
    for(const x of new_.sort()){ // initialize and add actions; order user configs alphabetically
        if(!current.includes(x)) {
            const option = document.createElement("option");
            option.value = x;
            option.text = x;
            presetSelect.add(option);            
        }
    }  
}
const changeToPreset = function(presetName){
    let preset = presets[presetName];
    if(!preset) preset = structuredClone(defaultPreset);
    setServerMode(preset.mode, true);
};
presetSelect.addEventListener('change', function(){ 
    changeToPreset(this.value);
});

// on page load, show the last state of the launcher, whether saved as a named preset or not
updatePresets();
changeToPreset("mostRecent");

/* -----------------------------------------------------------
enable user to save/delete named preset configurations
----------------------------------------------------------- */
const savePresetAs = document.getElementById("savePresetAs");
const deletePreset = document.getElementById("deletePreset");
savePresetAs.addEventListener("click", function(){
    const current = presetSelect.value;
    mdi.showPrompt({
        title: 'Enter Configuration Name',
        label: 'Please enter the desired configuration name:',
        value: restrictedPresets.includes(current) ? "" : current,
        buttonLabels: {
            ok: "Save",
            cancel: "Cancel"
        },
        inputAttrs: {
            type: 'text'
        },
        height: 200,
        width: 400,
        alwaysOnTop: true,
        mdiEvent: "configurationName"
    });
});
mdi.configurationName((event, result) => {
    presets[result] = presets[presetSelect.value];
    savePresets();
    updatePresets();
    changeToPreset(result);
});
deletePreset.addEventListener("click", function(){
    const current = presetSelect.value;
    if(restrictedPresets.includes(current)) return;    
    mdi.showMessageBoxSync({
        message: "Please confirm deletion of configuration '" + current + "'. This cannot be undone.",
        type: "warning",
        title: "Confirm Deletion",
        buttons: ["Cancel", "Delete"],
        noLink: true,
        mdiEvent: "confirmDelete"
    });
});
mdi.confirmDelete((event, result) => {
    if(!result) return; // user clicked cancel  
    delete presets[presetSelect.value];
    savePresets();
    updatePresets();
    changeToPreset("mostRecent");
});

/* -----------------------------------------------------------
respond to data stream watches and other pty state events
----------------------------------------------------------- */
const iframe = document.getElementById("embedded-apps-framework");
mdi.connectedState((event, data) => { 
    serverState.connected = data.connected;
    setButtonsVisibility();
    if(serverState.connected) savePresets(true);
});
mdi.listeningState((event, match, data) => { 
    serverState.listening = data.listening;
    setButtonsVisibility();
    if(serverState.listening){
        savePresets(true);
        const url = match.match(/http:\/\/.+:\d+/)[0];
        const proxyRules = data.mode == "Node" ? "socks5://127.0.0.1:" + data.proxyPort : null;
        mdi.showContent(url, proxyRules);
        if(serverPanelWorkingWidth > 0 && // auto-hide server panel unless developing
           !data.developer) toggleServerPanel();
    } else {
        mdi.showContent("https://midataint.github.io/docs/overview/"); // TODO: update URL
        if(serverPanelWorkingWidth == 0) toggleServerPanel();
    }
});

// TODO: 
//       option for fast start of server
//       security of remote server by user matching
//       disable certain inputs when connected or listening
//       node mode, hopefully can set Chromium proxy
//       need better ways to refresh the framework page (add a link to the electron header?)
//       copy paste from terminal
//       publish and distribute
//       documentation
