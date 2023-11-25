---
title: Installation
has_children: false
nav_order: 10
---

## {{page.title}}

The MDI Desktop is a cross-platform 
{% include external-link.html href="https://www.electronjs.org/" text="Electron" %}
app. The MDI Apps Framework that it launches is an 
{% include external-link.html href="https://shiny.rstudio.com/" text="R Shiny" %}
web interface used to perform data analysis.

### Install the MDI Desktop

Please download the relevant installer for your local operating system:

- {% include external-link.html href="https://github.com/MiDataInt/mdi-desktop-app/releases/latest/download/mdi-desktop-app-Setup.exe" text="Download for Windows" %}
- {% include external-link.html href="https://github.com/MiDataInt/mdi-desktop-app/releases/latest/download/mdi-desktop-app.dmg" text="Download for Mac" %}

You may be prompted to confirm the download, installation, or use of the MDI Desktop. 
Please read the [security notes](security-notes) to understand the risks and benefits 
of using the Desktop, including the measures we take to protect your computer.

Please note that MDI apps, including the Desktop, are cross-platform web tools
that are not intended to look or feel like a native app on your operating system.

The Desktop features an auto-update process, so once installed you should always have the most recent code.

### Install R

The only other software required to use the Desktop is
R itself (the app will help you install R Shiny and other required packages).

If you are working in a 
[remote server mode](server-modes#remote-server-mode), 
your server probably already has R available, 
perhaps by calling "module load R/#.#.#" as on UM Great Lakes. 
Please see your server's documentation for details.

If you are working in 
[local mode](server-modes#local-computer-mode), 
you need to install R on your 
desktop or laptop computer via the link below 
(note that R Studio is not required):

- {% include external-link.html href="https://cran.r-project.org/" text="https://cran.r-project.org/" %}

### Install XQuartz on MacOS

For Mac computers running the MDI in local mode, you will likely need to make X11 available on your system 
for R plots to appear correctly. Obtain it by installing XQuartz:

- <https://www.xquartz.org/>

XQuartz is needed because X11 is no longer included by default since Mac OS X 10.8.
Without it, at least some app plots and images will fail to render as expected.
