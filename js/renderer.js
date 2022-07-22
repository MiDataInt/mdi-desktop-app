// control available options based on server mode
// note: options javascript initialized in upside-down fashion
const mostRecent = "Most Recent"
const modeForms = document.getElementsByClassName('modeOptions')
const universalForm = document.getElementById('universalOptions')
const handleInputChange = function(form, input){
    let mode = form.dataset.mode
    let option = input.name
    let value = input.type === "checkbox" ? input.checked : input.value

    // TODO working here!
    if(presets[mostRecent][mode] === undefined) presets[mostRecent][mode] = nullPreset[mode]
    presets[mostRecent][mode][option] = value
    localStorage.setItem(presetsKey, JSON.stringify(presets))
    
    console.log(mode + " " + option + " " + value)
}
for (const modeForm of modeForms){
    modeForm.addEventListener('change', function(event) {
        handleInputChange(this, event.target)
    });
}
universalForm.addEventListener('change', function(event) {
    handleInputChange(this, event.target)
});
const setServerMode = function(mode){
    window.mdi.setTitle(mode)
    for (const modeForm of modeForms) modeForm.style.display = 'none'
    document.getElementById(mode.toLowerCase() + "Options").style.display = 'block'
    for (const modeRadio of modeRadios) {
        modeRadio.checked = modeRadio.value === mode
    }
}

// server mode, i.e., where the mdi-apps-framework will run
const modeRadios = document.serverMode.mode;
for (const modeRadio of modeRadios) {
    modeRadio.addEventListener('change', function() {
        setServerMode(this.value)
    });
}
const getServerMode = function(){
    for (const modeRadio of modeRadios) {
        if(modeRadio.checked) return modeRadio.value
    }
}

// save/load user-defined configurations, i.e., Presets, from localStorage
const presetSelect = document.getElementById('preset')
const presetsKey = "mdi-launcher-presets"
const nullPreset = {
    mode: "Remote",
    Remote: {
        user: "",
        server: "",
        rLoadCommand: ""
    },
    Node: {
        user: "",
        server: "",
        rLoadCommand: ""
    },
    Local: {
        user: "",
        server: "",
        rLoadCommand: ""
    },
    universal: {
        mdiDir: "xyz",
        shinyPort: 3838,
        developer: false
    }
}
let presets =  localStorage.getItem(presetsKey)
////////////////
if(presets === null || true) { //////////////
    presets = {
        "-": nullPreset,
        "Most Recent": nullPreset
    }
    localStorage.setItem(presetsKey, JSON.stringify(presets))
} else {
    presets = JSON.parse(presets)
}
const changeToPreset = function(presetName){
    let preset = presets[presetName]
    if(preset === undefined) preset = nullPreset
    setServerMode(nullPreset.mode)
    // TODO: update mode inputs
}
presetSelect.addEventListener('change', function() {
    changeToPreset(this.value)
});

// on page load, show the last state of the launcher
// whether saved as a named preset or not
changeToPreset(mostRecent)



// activate the server action buttons
const startServerButton = document.getElementById('start-server')
startServerButton.addEventListener('click', function(event) {
    window.mdi.startServer("XX", {})
})

// initialize the xterm terminal windows and associated events
const xterm = new Terminal();
const fitAddon = new FitAddon.FitAddon();
xterm.loadAddon(fitAddon);
xterm.open(document.getElementById('terminal'));
fitAddon.fit();
xterm.onData((data) => { window.mdi.xtermToPty(data) })
window.mdi.ptyToXterm((event, data) => { xterm.write(data) })

// activate dynamic element sizing
const viewerPanel = document.getElementById("viewer-panel") // sits on top of serverPanel, contains toggleButton and frameworkPanel
const toggleButton = document.getElementById('server-panel-toggle')
const frameworkPanel = document.getElementById('framework-panel')
const toggleButtonWidth = 20
const serverPanelWidth = 500
const serverPanelPadding = 15
const serverPanelPaddedWidth = serverPanelWidth + 2 * serverPanelPadding
let serverPanelWorkingWidth = serverPanelPaddedWidth
const resizePanels = function(){
    viewerPanel.style.marginLeft = serverPanelWorkingWidth + "px"
    frameworkPanel.style.width = (window.innerWidth - serverPanelWorkingWidth - toggleButtonWidth) + "px"
}
resizePanels()
window.addEventListener('resize', (event) => resizePanels());

// activate the button to toggle the server panel visibility
toggleButton.addEventListener('click', function(event) {
    let id = null
    let target = null
    let collapsing = serverPanelWorkingWidth > 0
    clearInterval(id);
    if(collapsing){
        target = 0
        inc = -1
    } else {
        target = serverPanelPaddedWidth
        inc = 1
    }
    const animate = function() {
        if (serverPanelWorkingWidth == target) {
            clearInterval(id)
        } else {
            serverPanelWorkingWidth += inc * serverPanelPaddedWidth / 50, 0
            serverPanelWorkingWidth = Math.min(Math.max(serverPanelWorkingWidth, 0), serverPanelPaddedWidth)
            resizePanels()
        }
    }    
    id = setInterval(animate, 0);
    toggleButton.innerHTML = collapsing ? "&gt;" : "&lt;"
});
