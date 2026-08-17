---
description: Pick a session file from ~/.claude/session-data/ (lists the 5 most recent when called without argument) and resume work with full context from where that session ended.
---

# Resume Session Command

Load the last saved session state and orient fully before doing any work.
This command is the counterpart to `/save-session`.

## When to Use

- Starting a new session to continue work from a previous day
- After starting a fresh session due to context limits
- When handing off a session file from another source (just provide the file path)
- Any time you have a session file and want Claude to fully absorb it before proceeding

## Usage

```
/resume-session                                                      # lists the 5 most recent files in ~/.claude/session-data/, you pick one
/resume-session 2024-01-15                                           # loads most recent session for that date
/resume-session ~/.claude/session-data/2024-01-15-abc123de-session.tmp  # loads a current short-id session file
/resume-session ~/.claude/sessions/2024-01-15-session.tmp               # loads a specific legacy-format file
```

## Process

### Step 1: Find the session file

If no argument provided — never auto-load the most recent file, always let the user choose:

1. List the 5 most recently modified `*-session.tmp` files in `~/.claude/session-data/`:
   ```bash
   ls -t ~/.claude/session-data/*-session.tmp 2>/dev/null | head -5
   ```
2. If the folder does not exist or has no matching files, tell the user:
   ```
   No session files found in ~/.claude/session-data/
   Run /save-session at the end of a session to create one.
   ```
   Then stop.
3. Read only the header of each listed file (first ~10 lines: `**Last Updated:**`, `**Project:**`, `**Topic:**`). Do NOT read the full files — that is the point of the menu.
4. Present them as a numbered list, most recent first, in this format:

   ```
   SESSIONS DISPONIBLES (5 plus récentes)
   ════════════════════════════════════════════════

   1. 2026-07-30-arbitrage-audit          (modifié 30/07 15:54)
      Projet : /home/thundder/Documents/Xeko — xeko-backend, xeko-mcp
      Sujet  : Arbitrage du lot de correctifs de l'audit 19-20/07

   2. 2026-07-26-analyste-mailbox         (modifié 26/07 17:52)
      Projet : Tess — Camping OS (pms-ia), branche mailbox
      Sujet  : Session analyste/testeur Boîte mail — 10 boucles S1→S10

   [... 3 de plus ...]

   ════════════════════════════════════════════════
   Laquelle veux-tu reprendre ? (numéro, ou un nom de fichier / une date)
   ```

   Truncate each `Sujet` line to one line — no wrapping paragraphs in the menu.
5. Wait for the answer. Load NOTHING before the user has picked. If the answer is a number, resolve it to that file; if it is a date or a path, follow the "argument provided" rules below.
6. If more than 5 session files exist, note it under the list: `(N autres saves plus anciennes — donne une date ou un chemin pour y accéder)`.

If an argument is provided:

- If it looks like a date (`YYYY-MM-DD`), search `~/.claude/session-data/` first, then the legacy
  `~/.claude/sessions/`, for files matching `YYYY-MM-DD-session.tmp` (legacy format) or
  `YYYY-MM-DD-<shortid>-session.tmp` (current format)
  and load the most recently modified variant for that date
- If it looks like a file path, read that file directly
- If not found, report clearly and stop

### Step 2: Read the entire session file

Read the complete file. Do not summarize yet.

### Step 3: Confirm understanding

Respond with a structured briefing in this exact format:

```
SESSION LOADED: [actual resolved path to the file]
════════════════════════════════════════════════

PROJECT: [project name / topic from file]

WHAT WE'RE BUILDING:
[2-3 sentence summary in your own words]

CURRENT STATE:
PASS: Working: [count] items confirmed
 In Progress: [list files that are in progress]
 Not Started: [list planned but untouched]

WHAT NOT TO RETRY:
[list every failed approach with its reason — this is critical]

OPEN QUESTIONS / BLOCKERS:
[list any blockers or unanswered questions]

NEXT STEP:
[exact next step if defined in the file]
[if not defined: "No next step defined — recommend reviewing 'What Has NOT Been Tried Yet' together before starting"]

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

### Step 4: Wait for the user

Do NOT start working automatically. Do NOT touch any files. Wait for the user to say what to do next.

If the next step is clearly defined in the session file and the user says "continue" or "yes" or similar — proceed with that exact next step.

If no next step is defined — ask the user where to start, and optionally suggest an approach from the "What Has NOT Been Tried Yet" section.

---

## Edge Cases

**Multiple sessions for the same date** (`2024-01-15-session.tmp`, `2024-01-15-abc123de-session.tmp`):
Load the most recently modified matching file for that date, regardless of whether it uses the legacy no-id format or the current short-id format.

**Session file references files that no longer exist:**
Note this during the briefing — "WARNING: `path/to/file.ts` referenced in session but not found on disk."

**Session file is from more than 7 days ago:**
Note the gap — "WARNING: This session is from N days ago (threshold: 7 days). Things may have changed." — then proceed normally.

**User provides a file path directly (e.g., forwarded from a teammate):**
Read it and follow the same briefing process — the format is the same regardless of source.

**Session file is empty or malformed:**
Report: "Session file found but appears empty or unreadable. You may need to create a new one with /save-session."

---

## Example Output

```
SESSION LOADED: /Users/you/.claude/session-data/2024-01-15-abc123de-session.tmp
════════════════════════════════════════════════

PROJECT: my-app — JWT Authentication

WHAT WE'RE BUILDING:
User authentication with JWT tokens stored in httpOnly cookies.
Register and login endpoints are partially done. Route protection
via middleware hasn't been started yet.

CURRENT STATE:
PASS: Working: 3 items (register endpoint, JWT generation, password hashing)
 In Progress: app/api/auth/login/route.ts (token works, cookie not set yet)
 Not Started: middleware.ts, app/login/page.tsx

WHAT NOT TO RETRY:
FAIL: Next-Auth — conflicts with custom Prisma adapter, threw adapter error on every request
FAIL: localStorage for JWT — causes SSR hydration mismatch, incompatible with Next.js

OPEN QUESTIONS / BLOCKERS:
- Does cookies().set() work inside a Route Handler or only Server Actions?

NEXT STEP:
In app/api/auth/login/route.ts — set the JWT as an httpOnly cookie using
cookies().set('token', jwt, { httpOnly: true, secure: true, sameSite: 'strict' })
then test with Postman for a Set-Cookie header in the response.

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

---

## Notes

- Never modify the session file when loading it — it's a read-only historical record
- The store is global (`~/.claude/session-data/`), not per-project: the menu mixes saves from every project, hence the `Projet :` line on each entry
- Bare `/resume-session` always shows the menu — the "load the most recent one" shortcut no longer exists, pass a date or a path to skip the choice
- The briefing format is fixed — do not skip sections even if they are empty
- "What Not To Retry" must always be shown, even if it just says "None" — it's too important to miss
- After resuming, the user may want to run `/save-session` again at the end of the new session to create a new dated file
