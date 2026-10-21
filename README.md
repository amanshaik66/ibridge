# iBridge — IBM i (AS/400) in the browser

A web platform that bridges IBM i to the browser: run SQL and CL against a real
IBM i host, browse libraries and files, watch jobs and spool files — no 5250
emulator, nothing to install.

**Live:** https://ibridge-mauve.vercel.app

## What's inside

- **SQL Studio** — ad-hoc SQL with results as real tables (sortable columns,
  row filter, CSV/JSON export, saved queries), plus a CL command runner
- **Interactive 5250 terminal** in the browser for commands like WRKACTJOB
- **Explorer** — libraries → objects → file fields, members and data preview
- **Jobs dashboard** — live system status + active jobs, auto-refreshing
- **Spools** — output-queue entries viewer
- **IFS browser**
- **REST API console** — key-authenticated demo API with an OpenAPI spec

## Architecture

- **Frontend (this repo):** Next.js 14 + React + TypeScript + Tailwind CSS.
  The server routes proxy runs to the backend with a read-only SQL guard
  (SELECT/VALUES/WITH/EXPLAIN only), a CL denylist, rate limiting and an SSRF
  guard. Sessions are "stay signed in" with a 10-minute idle expiry; passwords
  are used at sign-on and never stored.
- **Backend:** a Java service (TN5250J + IBM Toolbox/JT400) that speaks the
  5250 protocol to the host, runs SQL through the QSH `db2` utility, and
  reassembles the fixed-width output into structured tables.
  Repo: https://github.com/amanshaik66/ibridge-jdbc

Built and tested against PUB400, a public IBM i 7.5 system.

## Author

Aman Shaik — Associate Programmer Analyst at Broadridge (IBM i / RPG ILE).
Portfolio: https://aman-shaik-portfolio.vercel.app
