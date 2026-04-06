---
name: knowledge-base
description: Build and maintain a personal knowledge base using LLM-compiled markdown wikis. Inspired by Andrej Karpathy's approach to knowledge management.
when-to-use: When the user asks to compile knowledge, query the wiki, ingest sources, lint the knowledge base, or reflect on learnings. Also use proactively after research tasks to file findings.
user-invocable: true
---

# Knowledge Base

A Karpathy-style knowledge management system. Raw sources go in, compiled wiki articles come out. The LLM is the compiler — it reads, summarizes, extracts concepts, and builds cross-references.

## Directory Structure

All files live under `knowledge/` (NEVER `.claude/` — that directory blocks writes).

```
knowledge/
├── raw/              # Source documents — drop files here
│   └── (articles, papers, notes, research, images, data)
├── wiki/             # LLM-compiled articles (the knowledge base)
│   ├── concepts/     # One .md per concept
│   ├── summaries/    # Source document summaries
│   ├── connections/  # Cross-references, relationship maps
│   └── index.md      # Auto-maintained master index
├── logs/             # Daily activity logs (append-only)
│   └── YYYY/MM/YYYY-MM-DD.md
├── queries/          # Filed-back Q&A outputs
│   ├── reflections/  # Self-improvement reflections
│   └── (query results that enhance the wiki)
└── learnings.jsonl   # Structured learning entries
```

## Commands

### `/knowledge-base compile`

Scan `raw/` for new or updated sources and compile into `wiki/`.

**Steps:**
1. List all files in `raw/` (use Glob, not find)
2. For each source file:
   a. Check if a summary already exists in `wiki/summaries/` (match by filename slug)
   b. If missing or source is newer: read the source, write a summary to `wiki/summaries/<slug>.md`
   c. Extract key concepts from the source
   d. For each concept: create or update `wiki/concepts/<concept-slug>.md`
   e. Add cross-references: when a concept article mentions another concept, link them
3. Update `wiki/connections/map.md` — a relationship map showing how concepts connect
4. Rebuild `wiki/index.md` — master index with links to all summaries, concepts, and connections

**Summary format** (`wiki/summaries/<slug>.md`):
```markdown
---
source: raw/<filename>
compiled: 2026-04-05
---

# Summary: <Title>

## Key Points
- ...

## Concepts Extracted
- [[concept-name]] — brief note on relevance

## Source Details
- Type: article/paper/note/research
- Length: ~X words
```

**Concept format** (`wiki/concepts/<slug>.md`):
```markdown
---
concept: <Name>
related: [concept-a, concept-b]
sources: [raw/file1.md, raw/file2.md]
last-updated: 2026-04-05
---

# <Concept Name>

<Definition and explanation>

## Key Details
- ...

## Connections
- Related to [[other-concept]] because...

## Sources
- Summarized from [[summary-slug]]
```

**Index format** (`wiki/index.md`):
```markdown
# Knowledge Base Index

Last compiled: 2026-04-05

## Concepts
- [Concept A](concepts/concept-a.md) — one-line description
- [Concept B](concepts/concept-b.md) — one-line description

## Summaries
- [Source Title](summaries/source-slug.md) — source type, date compiled

## Connections
- [Relationship Map](connections/map.md)
```

### `/knowledge-base query "<question>"`

Research the wiki to answer a question.

**Steps:**
1. Read `wiki/index.md` to understand what's available
2. Identify relevant wiki articles (concepts, summaries, connections)
3. Read those articles
4. Synthesize an answer using wiki knowledge
5. If the wiki doesn't cover the topic, say so and suggest what raw sources might help
6. Save the answer to `wiki/queries/<date>-<slug>.md`:

```markdown
---
question: "<original question>"
date: 2026-04-05
sources-consulted: [concepts/x.md, summaries/y.md]
---

# Q: <question>

<synthesized answer>

## Sources Used
- ...
```

### `/knowledge-base lint`

Health-check the wiki for consistency and completeness.

**Steps:**
1. List all files in `raw/` — check each has a corresponding summary in `wiki/summaries/`
2. List all concept articles — check cross-references point to existing files
3. Check `wiki/index.md` lists all concepts and summaries
4. Look for duplicate or overlapping concept articles
5. Check for concepts mentioned in summaries but without their own article
6. Report findings in a structured format:

```
## Lint Report — <date>

### Missing Summaries (raw sources without wiki summaries)
- raw/file1.md — no summary found

### Broken References
- concepts/x.md references concepts/y.md — file not found

### Missing Concepts (mentioned but no article)
- "machine learning" mentioned in 3 summaries, no concept article

### Index Sync Issues
- concepts/new-thing.md exists but not in index.md

### Auto-fixes Applied
- Added 2 missing entries to index.md
- Fixed 1 broken cross-reference
```

Auto-fix what's safe (index updates, broken links to renamed files). Flag everything else.

### `/knowledge-base ingest <url-or-path>`

Add a new source to the knowledge base.

**Steps:**
1. If argument looks like a URL (starts with http):
   a. Fetch the content using WebFetch
   b. Convert to clean markdown (strip nav, ads, boilerplate)
   c. Save to `raw/<slugified-title>.md` with frontmatter noting the source URL
2. If argument is a file path:
   a. Read the file
   b. Copy content to `raw/<filename>`
3. Run an incremental compile for just the new source (don't recompile everything)
4. Report what was added and what concepts were extracted

**Ingested file frontmatter:**
```markdown
---
source-url: https://example.com/article  # if from URL
ingested: 2026-04-05
type: article
---
```

### `/knowledge-base reflect`

Self-improvement review based on recent activity and learnings.

**Steps:**
1. Read recent daily logs from `knowledge/logs/` (last 7 days)
2. Read `knowledge/learnings.jsonl` — parse all entries
3. Group learnings by type (error, correction, knowledge_gap, better_practice, etc.)
4. Count occurrences — if a pattern appears 3+ times, flag it for promotion
5. Identify:
   - What worked well (better_practice entries)
   - What failed (error, correction entries)
   - Knowledge gaps (knowledge_gap entries)
   - Capability requests (capability_request entries)
6. Write reflection to `knowledge/queries/reflections/<date>-reflection.md`:

```markdown
---
date: 2026-04-05
period: 2026-03-29 to 2026-04-05
learnings-analyzed: 15
---

# Reflection — <date>

## What Worked
- ...

## What Failed
- ...

## Knowledge Gaps
- ...

## Patterns for Promotion (3+ occurrences)
- "<pattern>" appeared X times → suggest adding to CLAUDE.md / creating a skill

## Action Items
- [ ] ...
```

## Learnings Format

Append structured entries to `knowledge/learnings.jsonl` (one JSON object per line):

```jsonl
{"timestamp":"2026-04-05T10:00:00Z","type":"error","summary":"Forgot to check API rate limits","details":"Hit 429 on Stripe API during bulk sync. Should check rate limit headers.","count":1}
{"timestamp":"2026-04-05T11:00:00Z","type":"better_practice","summary":"Always test with curl before building UI","details":"Saved 30 min by verifying API response shape before coding the component.","count":1}
{"timestamp":"2026-04-05T12:00:00Z","type":"knowledge_gap","summary":"Don't know how Claude Code handles hook priorities","details":"Need to research whether hooks run in order or parallel.","count":1}
```

**Types:**
| Type | When to log |
|------|-------------|
| `error` | Something went wrong, a mistake was made |
| `correction` | User corrected your approach or understanding |
| `knowledge_gap` | Discovered something you don't know and need to learn |
| `better_practice` | Found a more effective way to do something |
| `capability_request` | Identified a missing tool or capability |
| `task_review` | Post-mortem notes on a completed task |

**Incrementing count:** Before appending a new entry, grep `learnings.jsonl` for the summary. If a matching entry exists, update its count instead of creating a duplicate.

## The 3-Occurrence Promotion Threshold

When a learning appears 3+ times (count >= 3), it's no longer a one-off — it's a pattern. Promote it:

1. **Better practices** → Add to `knowledge/conventions.md` or create a skill
2. **Errors** → Add a prevention rule to CLAUDE.md or a pre-commit check
3. **Knowledge gaps** → Research and write a wiki article
4. **Corrections** → Add to CLAUDE.md as a behavioral rule

The `/knowledge-base reflect` command surfaces these automatically.

## Integration with Daily Work

- After any research task: file findings into `raw/` and run compile
- After resolving a tricky bug: add a learning entry
- After user corrections: add a correction learning
- Weekly: run reflect to review patterns
- When starting a new topic: query the wiki first to see what you already know

## Important

- ALL writes go to `knowledge/` — never to `.claude/`
- Use wiki-style links `[[concept-name]]` for cross-references within articles
- Keep concept articles focused — one concept per file
- Summaries should be standalone — readable without the original source
- The index is the entry point — keep it accurate and complete
