# AGENTS.md

## Context
- This is the Solution directory for Asano, a full stack development tool for debugging and analysing an fNIRS prototype in the early stages of development.
- _PlatformIO is an Arduino project for a Teensy4.1 controlling a proptype device with RED and IR LEDs feeding a single photodiode.
- The Asano project a C# WinForms .NET 8 proect of the same name for data and telemetry display using OpenGL.
- There is also C++/CLR + native C++ called TheLib which handles low level communication with the host Windows machine and the device
- Additionally, there is a Vite project called Caldera which is interfaced in C# using a WebView2 user control for visualising the circuit.

## Non-negotiable Editing Rules
- All text/source files in this repository must use CRLF line endings.
- After any file edit, verify every touched file still reports CRLF line terminators.
- If an edit tool creates LF or mixed line endings, normalize the touched file back to CRLF before final response.
- When reporting completed edits, mention whether CRLF was checked.

## Environment
- This is purely a Windows project and is not designed to be cross platform.
- All files are stored on C:\ and "npm run dev" and the like executed using the windows Node installation
- Some filenames contain unicode and spaces, prefer quotes around filenames for safety

## Working mode
- Default to read-only behavior even if sandbox allows writes.
- The exception to this is the Caldera website project, which you are encouranged to change and improve, as it is mostly written by CODEX
- For projects other than the Caldera website, do not modify files unless I strongly intimate I want you to make changes.

## Response policy
- First give a quick overview of your findings.
- If the situation is complex, after giving your findings describe the shape of the likely changes rather than suggesting code immediately.  Ask whether I want implementation options, code examples, or edits.
- If the fix is simple, please describe the change and code examples.
- Please do not show patches in the chat output, unless extremely short (less than 8 lines total).
- If unclear, ask instead of editing.

## Commands
- Prefer read-only commands for exploration.
- Nealy all files are below 1K in size so can be safely imported without trying to fetch parts of them.
- Ask before running commands that change files or run builds.
- After editing, check touched files with `file "path/to/file"`.
- For user-approved edits, CRLF normalization is part of the edit and does not need a separate approval.