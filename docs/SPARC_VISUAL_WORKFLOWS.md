# SPARC Visual Workflows and Diagrams

**Visual representations of the SPARC methodology**

---

## Table of Contents

1. [SPARC Overview Diagram](#sparc-overview-diagram)
2. [Phase Flow Diagrams](#phase-flow-diagrams)
3. [Workflow Patterns](#workflow-patterns)
4. [Decision Trees](#decision-trees)
5. [Integration Patterns](#integration-patterns)
6. [Time Distribution](#time-distribution)

---

## SPARC Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SPARC METHODOLOGY                            │
│                  From Requirements to Production                     │
└─────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │  PROBLEM     │
                              │  STATEMENT   │
                              └──────┬───────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │  S - SPECIFICATION                                 │
        │  ┌──────────────────────────────────────────────┐ │
        │  │ • Define requirements (FR/NFR)               │ │
        │  │ • Establish scope (in/out)                   │ │
        │  │ • Set success criteria                       │ │
        │  │ • Identify dependencies                      │ │
        │  └──────────────────────────────────────────────┘ │
        │  Output: Requirements Document                     │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────────┐
        │  P - PSEUDOCODE                                    │
        │  ┌──────────────────────────────────────────────┐ │
        │  │ • Design algorithms (language-agnostic)      │ │
        │  │ • Define workflows                           │ │
        │  │ • Map data flows                             │ │
        │  │ • Specify error handling                     │ │
        │  └──────────────────────────────────────────────┘ │
        │  Output: Pseudocode & Workflow Diagrams            │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────────┐
        │  A - ARCHITECTURE                                  │
        │  ┌──────────────────────────────────────────────┐ │
        │  │ • Choose technology stack                    │ │
        │  │ • Design system structure                    │ │
        │  │ • Plan data models                           │ │
        │  │ • Define security & scalability              │ │
        │  └──────────────────────────────────────────────┘ │
        │  Output: Architecture Diagrams & Tech Specs        │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────────┐
        │  R - REFINEMENT                                    │
        │  ┌──────────────────────────────────────────────┐ │
        │  │ • Build prototypes                           │ │
        │  │ • Run tests (unit, integration, perf)        │ │
        │  │ • Optimize bottlenecks                       │ │
        │  │ • Gather feedback & iterate                  │ │
        │  └──────────────────────────────────────────────┘ │
        │  Output: Test Results & Optimization Plans         │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────────┐
        │  C - COMPLETION                                    │
        │  ┌──────────────────────────────────────────────┐ │
        │  │ • Implement production code                  │ │
        │  │ • Deploy to production                       │ │
        │  │ • Create comprehensive docs                  │ │
        │  │ • Train team & handoff                       │ │
        │  └──────────────────────────────────────────────┘ │
        │  Output: Production System & Documentation         │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │  PRODUCTION  │
                      │    SYSTEM    │
                      └──────────────┘
```

---

## Phase Flow Diagrams

### Specification Phase Flow

```
START
  │
  ▼
┌─────────────────────────┐
│ Gather Requirements     │ ← Stakeholder interviews
│ • Functional (FR)       │   User research
│ • Non-functional (NFR)  │   Market analysis
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Define Scope            │
│ • What's IN scope       │
│ • What's OUT scope      │
│ • Assumptions           │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Establish Criteria      │
│ • Success metrics       │
│ • Acceptance criteria   │
│ • Quality gates         │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Identify Dependencies   │
│ • External systems      │
│ • Third-party services  │
│ • Team dependencies     │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Stakeholder Review      │ ─→ Approved? ─→ NO ──┐
│ • Validate requirements │              │        │
│ • Get sign-off          │              │        │
└──────────┬──────────────┘              │        │
           │ YES                          │        │
           ▼                              │        │
  ┌─────────────────┐                    │        │
  │ Spec Complete   │                    │        │
  └─────────────────┘                    │        │
                                         │        │
                                         ▼        │
                          ┌──────────────────────────┐
                          │ Refine Requirements      │
                          └──────────────┬───────────┘
                                         │
                                         └─────────────┘
```

### Pseudocode Phase Flow

```
START (from Specification)
  │
  ▼
┌──────────────────────────┐
│ Break Down Requirements  │
│ • Identify core features │
│ • List workflows         │
│ • Note integrations      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Design Algorithms        │
│ • Main logic flows       │
│ • Data transformations   │
│ • Business rules         │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Define Error Handling    │
│ • Validation logic       │
│ • Exception handling     │
│ • Retry strategies       │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Map Edge Cases           │
│ • Boundary conditions    │
│ • Null/empty handling    │
│ • Concurrent access      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Create Diagrams          │
│ • Sequence diagrams      │
│ • State machines         │
│ • Decision trees         │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Peer Review              │ ─→ Approved? ─→ NO ──┐
│ • Logic validation       │              │        │
│ • Completeness check     │              │        │
└──────────┬───────────────┘              │        │
           │ YES                           │        │
           ▼                               │        │
  ┌──────────────────┐                    │        │
  │ Pseudocode Done  │                    │        │
  └──────────────────┘                    │        │
                                          │        │
                                          ▼        │
                           ┌──────────────────────────┐
                           │ Revise Pseudocode        │
                           └──────────────┬───────────┘
                                          │
                                          └──────────────┘
```

### Architecture Phase Flow

```
START (from Pseudocode)
  │
  ▼
┌───────────────────────────┐
│ Choose Technology Stack   │
│ • Languages & frameworks  │
│ • Databases               │
│ • Infrastructure          │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ Design System Components  │
│ • Services/modules        │
│ • APIs & interfaces       │
│ • Communication patterns  │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ Design Data Layer         │
│ • Database schemas        │
│ • Data models (ERD)       │
│ • Caching strategy        │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ Plan Security             │
│ • Authentication          │
│ • Authorization           │
│ • Encryption              │
│ • Compliance              │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ Design Scalability        │
│ • Load balancing          │
│ • Horizontal scaling      │
│ • Performance targets     │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ Plan Observability        │
│ • Logging strategy        │
│ • Metrics & monitoring    │
│ • Alerting & on-call      │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│ Architecture Review       │ ─→ Approved? ─→ NO ──┐
│ • Technical validation    │              │        │
│ • Security review         │              │        │
│ • Scalability assessment  │              │        │
└──────────┬────────────────┘              │        │
           │ YES                            │        │
           ▼                                │        │
  ┌───────────────────┐                    │        │
  │ Architecture Done │                    │        │
  └───────────────────┘                    │        │
                                           │        │
                                           ▼        │
                            ┌──────────────────────────┐
                            │ Refine Architecture      │
                            └──────────────┬───────────┘
                                           │
                                           └─────────────┘
```

---

## Workflow Patterns

### Linear Workflow (Waterfall)

```
Traditional sequential development

Timeline: ────────────────────────────────────────────────────►

Phase:    S ──► P ──► A ──► R ──► C

Week:     1-2   3-4   5-7   8-10  11-15

Effort:   ███   ████  █████ ████  █████

Output:   Req   Logic Arch  Valid Prod
          Doc   Flow  Design Tests  Code

Best for:
• Stable requirements
• Regulatory projects
• Fixed-price contracts
• Waterfall methodology
```

### Iterative Workflow (Agile)

```
Agile/Scrum with SPARC per feature

Sprint Timeline: ──────────────►──────────────►──────────────►
                   Sprint 1       Sprint 2       Sprint 3

Sprint 1:
Feature A:    S → P → A
Feature B:    S → P
              ↓
              R (continuous testing)
              ↓
              C (deploy when ready)

Sprint 2:
Feature A:                        C (deploy)
Feature B:              → A → R → C
Feature C:    S → P → A

Best for:
• Evolving requirements
• Agile/Scrum teams
• Continuous delivery
• Fast iteration
```

### Parallel Workflow (Distributed Teams)

```
Multiple teams working simultaneously

Team A:   S → P → A ────────────────┐
                                    │
Team B:   S → P → A ────────────────┼──► Integration R
                                    │
Team C:   S → P → A ────────────────┘         │
                                               ▼
                                         Combined C
                                               │
                                               ▼
                                          Production

Coordination Points:
• Architecture review (sync interfaces)
• Integration testing (validate contracts)
• Combined deployment

Best for:
• Microservices
• Large teams
• Independent features
• Parallel development
```

### Hybrid Workflow (Most Common)

```
Initial comprehensive SPARC + iterative enhancements

Phase 1: MVP Development (Full SPARC)
┌────────────────────────────────────────────┐
│  S → P → A → R → C                         │
│  (8-12 weeks)                              │
└────────────────┬───────────────────────────┘
                 │
                 ▼
           MVP Released
                 │
                 ▼
Phase 2+: Ongoing Development (Iterative)
┌────────────────────────────────────────────┐
│  Feature 1: S → P → A ┐                    │
│  Feature 2: S → P → A ├──► R ──► C         │
│  Feature 3: S → P → A ┘                    │
│  (Continuous)                              │
└────────────────────────────────────────────┘

Best for:
• Most production projects
• Startup to enterprise
• Balance planning with agility
• Long-term products
```

---

## Decision Trees

### Should I Use SPARC?

```
                    ┌─────────────────┐
                    │  New Project?   │
                    └────────┬────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
              Trivial?              Complex?
             (<100 LOC)           (Multiple
                   │              components)
                   │                   │
               ┌───┴───┐           ┌───┴───┐
               │       │           │       │
              YES     NO          YES     NO
               │       │           │       │
          Skip SPARC  │      Full SPARC   │
                       │                   │
                 Throwaway?          High Stakes?
                 Prototype?        (Security/
                       │           Compliance)
                   ┌───┴───┐           │
                   │       │       ┌───┴───┐
                  YES     NO      YES     NO
                   │       │       │       │
            Lightweight    │  Full SPARC  │
            or Skip        │              │
                           │        Long-term
                   One-time?        Maintenance?
                           │              │
                       ┌───┴───┐      ┌───┴───┐
                       │       │      │       │
                      YES     NO     YES     NO
                       │       │      │       │
                  Skip SPARC   │  Lightweight │
                               │    SPARC     │
                        Using AI?             │
                               │         Use Judgment
                           ┌───┴───┐
                           │       │
                          YES     NO
                           │       │
                      Recommended  │
                        SPARC      │
                                Consider
                              Alternatives
```

### Which SPARC Variant?

```
                    ┌──────────────┐
                    │ SPARC Chosen │
                    └──────┬───────┘
                           │
                   Project Size?
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
     Small              Medium             Large
   (< 1 month)         (1-6 mo)          (> 6 mo)
   (1-2 devs)         (3-10 devs)       (10+ devs)
        │                  │                  │
        ▼                  ▼                  ▼
  Lightweight         Standard          Heavyweight
    SPARC              SPARC               SPARC
        │                  │                  │
    Combined S+P       Full 5 phases      Detailed
    Quick A            Standard docs      artifacts
    Basic R            Thorough R         Multiple
    Fast C             Standard C         reviews
        │                  │                  │
    1-4 weeks          1-6 months         6+ months

Development Methodology?
        │
    ┌───┴────┐
    │        │
Waterfall  Agile
    │        │
  Linear   Iterative
  Workflow Workflow
```

---

## Integration Patterns

### SPARC with Agile/Scrum

```
Sprint Planning
      │
      ▼
┌──────────────────────────────────────┐
│ Sprint N (2 weeks)                   │
│                                      │
│  Day 1-2: SPARC Planning             │
│  ┌────────────────────────────────┐  │
│  │ S: Define user story           │  │
│  │ P: Design approach             │  │
│  │ A: Tech decisions              │  │
│  └────────────────────────────────┘  │
│                                      │
│  Day 3-8: Implementation             │
│  ┌────────────────────────────────┐  │
│  │ R: Continuous testing          │  │
│  │    • TDD                        │  │
│  │    • Code review               │  │
│  │    • Integration tests         │  │
│  └────────────────────────────────┘  │
│                                      │
│  Day 9-10: Completion                │
│  ┌────────────────────────────────┐  │
│  │ C: Deploy to staging           │  │
│  │    • Update docs               │  │
│  │    • Demo                      │  │
│  └────────────────────────────────┘  │
│                                      │
│  Sprint Review & Retrospective       │
└──────────────────────────────────────┘
```

### SPARC with DevOps/CI/CD

```
Developer Workflow:

┌─────────────┐
│ Feature     │
│ Branch      │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ S: Write spec in    │
│    feature doc      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ P: Add pseudocode   │
│    comments in code │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ A: Update arch docs │
│    if needed        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Implement Code      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ R: Run CI pipeline  │
│  • Lint             │
│  • Unit tests       │
│  • Integration      │
│  • Security scan    │
└──────┬──────────────┘
       │
       ▼
   ┌───────┐
   │ Pass? │──NO──► Fix & Retry
   └───┬───┘
       │ YES
       ▼
┌─────────────────────┐
│ Code Review         │
│ • Check docs        │
│ • Validate design   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Merge to main       │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ C: Auto deploy      │
│  • Staging          │
│  • (Canary)         │
│  • Production       │
└─────────────────────┘
```

---

## Time Distribution

### Waterfall Project (12 months)

```
Month:  1    2    3    4    5    6    7    8    9    10   11   12
        │    │    │    │    │    │    │    │    │    │    │    │
S       ████████
P            ████████
A                 ████████████
R                           ████████████
C                                      ████████████████████████

Legend:
S = Specification  (15%)  ~1.8 months
P = Pseudocode     (15%)  ~1.8 months
A = Architecture   (25%)  ~3   months
R = Refinement     (20%)  ~2.4 months
C = Completion     (25%)  ~3   months
```

### Agile Sprint (2 weeks)

```
Day:    1    2    3    4    5    6    7    8    9    10
        │    │    │    │    │    │    │    │    │    │
S+P+A   ████████
R            ████████████████████████
C                                ████████

Legend:
S+P+A = Planning   (20%)  ~2 days
R     = Refinement (60%)  ~6 days
C     = Completion (20%)  ~2 days

Continuous integration and testing throughout
```

### Feature Development (2 months)

```
Week:   1    2    3    4    5    6    7    8
        │    │    │    │    │    │    │    │
S       ████
P       ████████
A            ████████
R                 ████████████████
C                           ████████████

Legend:
S = Specification  (12.5%)  ~1   week
P = Pseudocode     (12.5%)  ~1   week
A = Architecture   (12.5%)  ~1   week
R = Refinement     (37.5%)  ~3   weeks
C = Completion     (25%)    ~2   weeks
```

---

## Phase Interdependencies

```
┌───────────────────────────────────────────────────────┐
│                  SPARC Dependencies                    │
└───────────────────────────────────────────────────────┘

          ┌─────────────┐
          │      S      │
          │Specification│
          └──────┬──────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
Requirements  Scope      Success
  List      Boundary    Criteria
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
          ┌─────────────┐
          │      P      │
          │ Pseudocode  │
          └──────┬──────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
 Workflows   Algorithms   Data Flow
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
          ┌─────────────┐
          │      A      │
          │Architecture │
          └──────┬──────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
Tech Stack  Components   Data Model
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
          ┌─────────────┐
          │      R      │◄──┐ Feedback Loop
          │ Refinement  │   │
          └──────┬──────┘   │
                 │          │
     ┌───────────┼──────────┤
     │           │          │
     ▼           ▼          │
  Testing    Optimization   │
     │           │          │
     └───────────┼──────────┘
                 │
                 ▼
          ┌─────────────┐
          │      C      │
          │ Completion  │
          └──────┬──────┘
                 │
                 ▼
            Production
```

---

## Success Metrics Dashboard

```
┌─────────────────────────────────────────────────────────┐
│              SPARC Health Dashboard                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Phase Completion:                                       │
│  S: ████████████████████ 100%                          │
│  P: ████████████████████ 100%                          │
│  A: ████████████████░░░░  80%   ← In Progress          │
│  R: ░░░░░░░░░░░░░░░░░░░░   0%                          │
│  C: ░░░░░░░░░░░░░░░░░░░░   0%                          │
│                                                          │
│  Quality Gates:                                          │
│  ✓ Requirements reviewed                                 │
│  ✓ Stakeholder sign-off                                  │
│  ✓ Pseudocode peer reviewed                              │
│  ✗ Architecture review pending                           │
│  ✗ Performance benchmarks not run                        │
│                                                          │
│  Risk Indicators:                                        │
│  ⚠️  Architecture review overdue (3 days)                │
│  ✓ Requirements stable (no changes in 2 weeks)          │
│  ⚠️  Team member out (impact on timeline)                │
│                                                          │
│  Timeline:                                               │
│  Planned:   ████████████████░░░░  80 days               │
│  Actual:    ████████████████      64 days (on track)    │
│  Remaining: ████                  16 days                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## SPARC Adaptation Matrix

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Project     │  Lightweight │   Standard   │ Heavyweight  │
│  Type        │    SPARC     │    SPARC     │    SPARC     │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│ Small        │  Combined    │              │              │
│ Utility      │  S+P doc     │      N/A     │      N/A     │
│ (<1 month)   │  Quick A     │              │              │
│              │  Basic R/C   │              │              │
│              │              │              │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│ Feature      │  S: 1 page   │  Full phases │              │
│ Development  │  P: Outline  │  Standard    │      N/A     │
│ (1-3 months) │  A: Diagram  │  docs        │              │
│              │  R/C: Agile  │  Thorough    │              │
│              │              │              │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│ Microservice │              │  Full SPARC  │  Detailed    │
│ Platform     │      N/A     │  Per service │  Cross-      │
│ (3-6 months) │              │  Integration │  service     │
│              │              │  focus       │  coordination│
│              │              │              │              │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│ Enterprise   │              │              │  Formal      │
│ System       │      N/A     │      N/A     │  Reviews     │
│ (6+ months)  │              │              │  Traceability│
│              │              │              │  Compliance  │
│              │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

**Version:** 1.0
**Date:** 2025-11-18
**Purpose:** Visual companion to SPARC Methodology documentation
