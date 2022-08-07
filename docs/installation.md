---
title: Installation
has_children: false
nav_order: 10
---

## {{page.title}}

The MDI Desktop App is a cross-platform 
{% include external-link.html href="https://www.electronjs.org/" text="Electron" %}
app. The MDI Apps Framework that it launches is an 
{% include external-link.html href="https://shiny.rstudio.com/" text="R Shiny" %}
interface used to perform data analysis.

### Install the Desktop App

Please download the relevant installer for your local operating system:
- [Download for Windows](https://github.com/MiDataInt/mdi-desktop-app/releases/latest/download/mdi-desktop-app-Setup.exe)
- [Download for Mac](https://github.com/MiDataInt/mdi-desktop-app/releases/latest/download/mdi-desktop-app.dmg)

You may be prompted to confirm the download, installation, or use of the MDI Desktop. Only you can decide whether to proceed. The MDI project is open source and we abide by our stated
[MDI Code of Conduct](https://midataint.github.io/docs/registry/00_index/#mdi-developer-code-of-conduct).

The app features an auto-update process, so once installed you should always have the most recent code.

### Install R

The only other software required to use the Desktop App is
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
