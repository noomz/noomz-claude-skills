---
description: Build or update the speech-recognition vocab for this project, or for one meeting's agenda
argument-hint: "[meeting name or agenda text — omit for the project vocab]"
---

Invoke the `meeting-secretary` skill and follow its vocab phase (`reference/vocab.md`) exactly.

Target: the project file `.claude/meeting-vocab.txt` when the arguments below are empty; otherwise the named meeting's `vocab-extra.txt`, using any agenda text given.

$ARGUMENTS
