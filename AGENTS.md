# Agent rules for this repository

Rules learned the hard way, for any coding agent working here (Claude Code, Codex, others).
Process, release and design rules live in their own files: `CONTRIBUTING.md`, `RELEASING.md`,
`DESIGN.md`, `PRODUCT.md`.

## Shell

- Never `pkill -f` or `pgrep -f` with a pattern that also appears in your own command line: the
  shell running the command matches and gets killed with it. Stop a dev server by its port
  (`fuser -k 5199/tcp`) or by a PID you recorded when starting it.
