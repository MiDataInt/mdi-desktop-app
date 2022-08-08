---
title: Security Notes
has_children: false
nav_order: 60
---

## {{ page.title }}

The MDI takes security very seriously. There are real 
concerns with running any software on your computer,
and you should carefully consider the factors below 
when installing and using the MDI Desktop and associated apps.

Only you can decide whether to trust the software you install
and use, and you bear all responsibility for doing so.

### MDI Desktop

The MDI Desktop is an 
{% include external-link.html href="https://github.com/MiDataInt/mdi-desktop-app/" text="open-source project" %}
maintained by the MDI team to allow you to review its code if desired,
and we abide by our stated
{% include external-link.html href="https://midataint.github.io/docs/registry/00_index/#mdi-developer-code-of-conduct/" text="Code of Conduct" %}.

**PENDING** The Desktop app code is properly signed, and, on macOS, 
notarized, for safe installation and use, so you can trust
that the code is the same as available on GitHub.

You may still be prompted to confirm certain installation actions,
e.g., that the app is not "frequently downloaded".

The Desktop performs the following essential tasks:
- sets configuration parameters and saves them using Local Storage
- uses SSH to securely connect to remote servers
- uses {% include external-link.html href="https://cran.r-project.org/" text="R" %} to install packages from GitHub on your local or remote computer
- uses {% include external-link.html href="https://shiny.rstudio.com/" text="R Shiny" %} to run web applications in the app's browser

The app has one action - opening a new Terminal - 
that loads an external window on your system. You will be prompted
to confirm your agreement the first time you access it. No other actions
are executed by the associated script.

### MDI Apps Framework

Like the Desktop, the MDI Apps Framework is an 
{% include external-link.html href="https://github.com/MiDataInt/mdi-apps-framework/" text="open-source project" %}
that runs an
{% include external-link.html href="https://shiny.rstudio.com/" text="R Shiny" %} app.

The framework has features that access your local file system
and execute actions on your computer to allow you to:
- load and save data files and bookmarks of app states
- run resource intensive data analyses
- if desired, edit code files and execute system commands that you write
- load and execute third-party apps (see below)

### Third-party data analysis apps

The purpose of the MDI Desktop and Apps Framework
is to run data analysis apps. Unlike the
Desktop and Framework, the MDI team is not responsible for developing
those apps and does not take responsibility for their contents.

MDI apps run in 
{% include external-link.html href="https://cran.r-project.org/" text="R" %}, 
which means that the developers of those
apps have access to your computer. They can open files and run
commands on your operating system. _It is therefore imperative that
you carefully consider whether to trust the authors of any apps you use._
We recommend that apps you trust follow all 
{% include external-link.html href="https://midataint.github.io/docs/registry/00_index/" text="MDI security practices" %}, whether or
not they are listed in the MDI suite registry.

**PENDING** You will be prompted the first time you use any app
to indicate that you have considered the potential risks and agree to
accept them and continue using the app.
