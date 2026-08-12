# AGENTS.md

## Context
- This is a PlatformIO/Arduino project for a Teensy4.1 controlling a proptype fNIRS device, in the early stages of development.
- The parent solution, Asano, has a C# WinForms .NET 8 proect of the same name for data and telemetry display using OpenGL.
- There is also C++/CLR + native C++ called TheLib which handles low level communication with the host Windows machine and the device
- Additionally, there is a Vite project called Caldera which is interfaced in C# using a WebView2 user control for visualising the circuit.

## Working mode
- Default to read-only behavior even if sandbox allows writes.
- Do not modify files unless I say: "apply" (or strongly intimate I want changes made.)

## Edit policy
- First give a quick overview of the change needed, and formulate a patch, but please do not show patches in the chat output, unless extremely short (less than 8 lines total).
- Wait for my approval before applying any patch.
- If unclear, ask instead of editing.

## Commands
- Prefer read-only commands for exploration.
- Most files are below 1K in size so can be safely imported without trying to fetch parts of them.
- Ask before running commands that change files or run builds.
