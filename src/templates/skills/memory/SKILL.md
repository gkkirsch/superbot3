---
name: memory
description: Persistent memory system for spaces. Remember decisions, preferences, learnings, and session context. Memory is internal state — what happened, what was decided, what worked/failed.
when-to-use: When the user asks to remember something, recall past context, reflect on patterns, log session activity, or check memory status. Also use proactively when important decisions or preferences are stated.
user-invocable: true
---

# Memory

A persistent, file-based memory system. Memory is the space's internal state — decisions made, preferences learned, errors encountered, patterns discovered. It complements Knowledge (which holds external information like research, docs, and domain data).

## Directory Structure

All files live under `memory/` (NEVER `.claude/` — that directory blocks writes).

```
memory/
├── MEMORY.md              # Index — always in system prompt (25KB / 200 line cap)
│                          # Format: - [topic-name.md]: one-line description
├── topics/                # Topic files with frontmatter
│   └── {descriptive-name}.md
└── sessions/              # Daily session summaries
    └── YYYY/MM/YYYY-MM-DD.md
```

## Commands

### `/memory remember "<thing>"`

Instantly save something to memory.

**Steps:**
1. Parse the thing to remember — determine its type:
   - `user` — about the user (role, preferences, goals, expertise)
   - `feedback` — guidance on how to work (corrections, confirmed approaches)
   - `project` — ongoing work context (decisions, deadlines, initiatives)
   - `reference` — pointers to external resources (URLs, tools, services)
2. Find the right topic file in `memory/topics/`:
   - Grep existing topic files for related content
   - If a relevant topic file exists, update it (append or merge)
   - If not, create a new one with a descriptive name
3. Write/update the topic file with frontmatter:
   ```markdown
   ---
   name: <topic name>
   description: <one-line description — used to decide relevance later>
   type: <user|feedback|project|reference>
   ---

   <memory content>
   ```
   For `feedback` and `project` types, structure content as:
   - Lead with the rule/fact
   - **Why:** the reason or motivation
   - **How to apply:** when/where this kicks in
4. Update `memory/MEMORY.md` index:
   - Add or update the entry: `- [topic-name.md](topics/topic-name.md) — one-line hook`
   - Keep under 200 lines total
   - Organize semantically by topic, not chronologically
5. Confirm what was saved and where

**Examples:**
- `/memory remember "I prefer short emails"` → creates/updates `topics/user-communication-preferences.md`
- `/memory remember "Don't use mocks in integration tests — we got burned last quarter"` → creates `topics/feedback-testing-approach.md`
- `/memory remember "Merge freeze starts April 10 for mobile release"` → creates `topics/project-merge-freeze.md`

### `/memory recall "<query>"`

Search memory and synthesize an answer.

**Steps:**
1. Read `memory/MEMORY.md` to find relevant topic entries
2. Identify matching topics by scanning descriptions
3. Read the matching topic files from `memory/topics/`
4. If relevant, also check recent session files in `memory/sessions/`
5. Synthesize an answer from the collected memory
6. If nothing relevant found, say so clearly

**Examples:**
- `/memory recall "email preferences"` → reads user preferences topic, reports findings
- `/memory recall "testing guidelines"` → reads feedback topics about testing

### `/memory reflect`

Self-improvement review based on recent sessions and topic files.

**Steps:**
1. Read recent session files from `memory/sessions/` (last 7 days)
2. Read all topic files from `memory/topics/`
3. Look for recurring patterns across topics and sessions:
   - Similar errors or corrections mentioned in multiple topics
   - Repeated knowledge gaps
   - Successful practices that appear consistently
4. If a pattern appears 3+ times across topics/sessions, flag it for promotion:
   - Better practices → suggest adding to `knowledge/conventions.md` or creating a new skill
   - Errors → suggest adding a prevention note to a topic file or CLAUDE.md
   - Knowledge gaps → suggest creating a research task
   - Corrections → suggest adding a behavioral rule
5. Write reflection to `memory/sessions/` as today's entry (or append to existing):
   ```markdown
   ---
   date: YYYY-MM-DD
   period: <start> to <end>
   topics-analyzed: <count>
   ---

   # Reflection — YYYY-MM-DD

   ## What Worked
   - ...

   ## What Failed
   - ...

   ## Knowledge Gaps
   - ...

   ## Patterns for Promotion (3+ occurrences)
   - "<pattern>" appeared X times → suggest: <action>

   ## Action Items
   - [ ] ...
   ```

### `/memory log "<entry>"`

Quick append to today's session log.

**Steps:**
1. Get or create `memory/sessions/YYYY/MM/YYYY-MM-DD.md`
   - Create parent directories if needed
   - If file doesn't exist, create with header:
     ```markdown
     ---
     date: YYYY-MM-DD
     ---

     # Session Log — YYYY-MM-DD
     ```
2. Append: `- HH:MM — <entry>`
3. Confirm the entry was logged

### `/memory status`

Show memory system statistics.

**Steps:**
1. Count topic files in `memory/topics/`
2. Count session files in `memory/sessions/` (recursively)
3. Measure `memory/MEMORY.md` size (bytes and line count)
4. List the 5 most recently modified topic files
5. Display:
   ```
   Memory Status
   ─────────────
   Topics:     12 files
   Sessions:   30 files
   MEMORY.md:  8.2KB / 25KB (142 / 200 lines)

   Recent topics:
   - user-preferences.md (2 min ago)
   - project-auth-rewrite.md (1 hour ago)
   - feedback-testing.md (3 hours ago)
   ```

## Pattern Detection

The consolidator and `/memory reflect` detect patterns by reading topic files directly. When a theme (e.g., a type of error, a repeated correction) appears across 3+ topic files, it's flagged for promotion. No separate tracking file needed — topic files ARE the learnings.

## Important

- ALL writes go to `memory/` (peer to `knowledge/` at the space root) — NEVER to `.claude/` or `.claude/projects/*/memory/`
- Do NOT use the built-in Claude Code auto-memory system — use this skill's `memory/` directory instead
- MEMORY.md must stay under 200 lines / 25KB — it's always loaded into the system prompt
- Keep topic files focused — one topic per file
- Update existing topics rather than creating duplicates
- Convert relative dates to absolute dates when saving (e.g., "Thursday" → "2026-04-10")
- Memory is internal state; external information belongs in `knowledge/`
