# AGENTS.md

## Context
- This is a Vite project called Caldera which shows a circuit diagram for a prototype fNIRS device, and provides interactivity and feedback from the physical device.
- The parent solution, Asano, has a C# WinForms .NET 8 proect of the same name for data and telemetry display using OpenGL.
- There is also C++/CLR + native C++ called TheLib which handles low level communication with the host Windows machine and the device
- Additionally, _PlatformIO is an Arduino project for a Teensy4.1 controlling a proptype fNIRS device, in the early stages of development.

## Working mode
- You are encouranged to change and improve this project without requesting confirmation.  It is mostly written with CODEX and the 5.5 model.
- Please treat the other projects, especially the _PlatformIO code as read only, and do not make modifications unless I give you clear instructions to do so.
- For these 'other' projects, if you find bugs or see something which needs updating, please explain the problem and show me a short fix if appropriate.  For design changes, just lay out what needs to be changed and I'll endeavour to make them, whilst staying in my design style.
- Asano has a Caldera folder in it which you'll probably be asked to change to match functionality in this project, as it embodies the WebView interface.  For the interrim, please ask before changing, or if the change is small just show me what to do.

## File handling
- Most files are below 1K in size so can be safely imported without trying to fetch parts of them.
