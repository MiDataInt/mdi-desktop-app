---
title: MDI Directories
parent: Configuration Options
has_children: false
nav_order: 10
---

{% include entity-box-style.html %}

## {{page.title}}

You must provide file path(s) that tell the desktop app
where to place and find your MDI installation. In 
[local mode]({{ /server-modes#local-computer-mode | relative_url }})
these directories should be on your desktop or laptop computer. In a
[remote server mode]({{ /server-modes#remote-server-mode | relative_url }})
they should be on the HPC server.

### MDI Directory **

You must always provide the full path where you would 
like to / have already installed the MDI.

If **MDI Directory** ends with 'mdi' it will be used as is, otherwise 
code will be installed into a subfolder named 'mdi'.
The installer will create the 'mdi' subfolder as needed, but 
the parent folder must already exist. 
Thus, the following examples are equivalent.

**Windows**
- C:\path\to\mdi  
- C:\path\to

**Mac or Linux**
- /path/to/mdi  
- /path/to

### Data Directory (advanced)

Most often, all code and data used by the MDI 
resides under the MDI Directory, e.g., /path/to/mdi.

<div class="entityBox outerBox">
    <p class='entityBoxLabel'>Default Configuration</p>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Installation Directory</p>
        <p>/config</p>
        <p>/containers</p>
        <p>/data</p>
        <p>/environments</p>
        <p>/frameworks</p>
        <p>/library</p>
        <p>/resources</p>
        <p>/sessions</p>
        <p>/suites</p>
    </div>
</div>

Alternatively, you may wish
to share the data files produced by Stage 2 apps between multiple users
by providing a value for **Data Directory**, 
i.e., the full path to any valid shared directory that will 
replace the Stage 2 apps **data** folder.

<div class="entityBox outerBox">
    <p class='entityBoxLabel'>Shared Data Folder</p>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Installation Directory</p>
        <p>/config</p>
        <p>/containers</p>
        <p>/environments</p>
        <p>/frameworks</p>
        <p>/library</p>
        <p>/resources</p>
        <p>/sessions</p>
        <p>/suites</p>
    </div>
    <div class="diagramArrow">&harr;</div>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Data Directory</p>
        <p>session data folders populate here</p>
    </div>
</div>

**Example**
- /path/to/shared/mdi/data

### Host Directory (advanced)

Developers may additionally want to pre-install 
pipelines and/or apps suites to make them easier for others to use. 
You can access such hosted installations by providing a value for **Host Directory**, 
i.e., the full path to a different, pre-existing MDI Directory.
Stage 1 pipeline **containers**, **environments** and 
Stage 2 app **library** code folders will be used from that directory 
instead of from MDI Directory.
Additionally, you will have access to the hosted **config** and **resources**
folders.

<div class="entityBox outerBox">
    <p class='entityBoxLabel'>Hosted Installation</p>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Installation Directory</p>
        <p>/data</p>
        <p>/frameworks</p>
        <p>/sessions</p>
        <p>/suites</p>
    </div>
    <div class="diagramArrow">&harr;</div>
    <div class="entityBox inlineBox">
        <p class='entityBoxLabel'>Host Directory</p>
        <p>/config</p>
        <p>/containers</p>
        <p>/environments</p>
        <p>/library</p>
        <p>/resources</p>
    </div>
</div>

**Example**
- /path/to/hosted/mdi
