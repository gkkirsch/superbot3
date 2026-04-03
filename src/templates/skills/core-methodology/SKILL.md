---
name: core-methodology
description: "Enforces the five-phase worker methodology: Orient, Plan, Execute, Verify, Report. Invoke before starting any non-trivial task."
---

# Core Methodology

## When to Use
Invoke this skill when starting any non-trivial task. If a task has acceptance criteria, it's non-trivial.

## The Five Phases

### Phase 1: Orient
Before touching anything:
- [ ] Read the project plan and relevant knowledge files
- [ ] Check current state: branch, build status, dependencies
- [ ] Flag any drift from plan assumptions
- [ ] Report findings to team lead

### Phase 2: Plan (for complex tasks)
- [ ] Decompose into ordered steps with acceptance criteria
- [ ] Identify files to be touched
- [ ] Note simplification opportunities

### Phase 3: Execute
- [ ] One step at a time
- [ ] Commit at logical milestones
- [ ] No scope creep — create tasks for unrelated issues

### Phase 4: Verify
**Non-negotiable. You MUST run verification before claiming completion.**
- [ ] Build passes (the floor)
- [ ] Run task-specific verification (tests, browser check, API call, etc.)
- [ ] Write ## Verification section with specific results and evidence

### Phase 5: Report
- [ ] Send completion message to team lead
- [ ] Include: what was done, what changed, decisions made, what's next
