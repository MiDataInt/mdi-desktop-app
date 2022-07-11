// control available options based on server mode (note: js initialized in upside-down fashion)
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


//     nClicksP.innerText = nClicks

// const sshData = document.getElementById('ssh-data')
// window.electronAPI.sshData((_event, value) => {
//     sshData.innerText = sshData.innerText + value
// })
