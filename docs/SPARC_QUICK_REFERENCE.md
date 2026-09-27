# SPARC Quick Reference Guide

**One-page reference for the SPARC methodology**

---

## The Five Phases

```
S → Specification   Define WHAT and WHY
P → Pseudocode      Design HOW (logic)
A → Architecture    Plan STRUCTURE
R → Refinement      Validate and optimize
C → Completion      Deliver to production
```

---

## Phase Cheat Sheet

### Specification (S)
**Purpose:** Define requirements and scope

**Key Questions:**
- What problem are we solving?
- Who are the stakeholders?
- What are the functional requirements?
- What are the non-functional requirements (performance, security)?
- What's in scope vs out of scope?

**Deliverables:**
- Requirements document (FR/NFR)
- Scope statement
- Success criteria
- Dependencies list

**Time Investment:** 10-20% of project

---

### Pseudocode (P)
**Purpose:** Design logic without implementation details

**Key Questions:**
- How will the system work?
- What are the main workflows?
- How do we handle errors?
- What are the edge cases?

**Deliverables:**
- Pseudocode for core algorithms
- Workflow diagrams
- Decision trees
- Sequence diagrams

**Time Investment:** 15-25% of project

---

### Architecture (A)
**Purpose:** Define system structure and technology

**Key Questions:**
- What technologies will we use?
- How do components interact?
- How will it scale?
- How do we ensure security?
- How will we monitor it?

**Deliverables:**
- Architecture diagrams (C4 model)
- Technology stack with justifications
- Data models and schemas
- API specifications
- Security architecture

**Time Investment:** 20-30% of project

---

### Refinement (R)
**Purpose:** Validate and optimize the design

**Key Questions:**
- Does it meet performance requirements?
- Are there security vulnerabilities?
- Does it handle edge cases?
- Can we optimize further?

**Deliverables:**
- Test results (unit, integration, performance)
- Benchmark reports
- Security audit results
- Optimization plan
- Updated documentation

**Time Investment:** 15-25% of project

---

### Completion (C)
**Purpose:** Deploy to production

**Key Questions:**
- Is the code production-ready?
- Are tests comprehensive?
- Is documentation complete?
- Is the team trained?
- Are monitoring and alerts configured?

**Deliverables:**
- Production code with tests
- CI/CD pipelines
- Complete documentation
- Runbooks and training materials
- Monitoring dashboards

**Time Investment:** 20-30% of project

---

## Decision Tree: Should I Use SPARC?

```
Is it a trivial script (<100 lines)?
  └─ YES → Skip SPARC
  └─ NO ↓

Is it a throwaway prototype?
  └─ YES → Consider lightweight or skip
  └─ NO ↓

Is the system complex?
  └─ YES → USE FULL SPARC
  └─ NO ↓

High stakes (compliance, security, mission-critical)?
  └─ YES → USE FULL SPARC
  └─ NO ↓

Long-term maintenance expected?
  └─ YES → USE LIGHTWEIGHT SPARC
  └─ NO → Use judgment
```

---

## SPARC Variants

### Lightweight SPARC (Small Projects)
- Combined Spec + Pseudocode (1 doc)
- Simplified Architecture (diagram + tech choices)
- Quick Refinement (basic testing)
- **Timeline:** 1-4 weeks

### Standard SPARC (Medium Projects)
- Full five phases
- Comprehensive documentation
- Thorough testing
- **Timeline:** 1-6 months

### Heavyweight SPARC (Enterprise)
- Detailed artifacts at each phase
- Multiple review cycles
- Formal validation
- **Timeline:** 6+ months

---

## Common Mistakes to Avoid

### Specification
- ❌ Vague requirements ("should be fast")
- ✅ Measurable requirements ("p95 < 200ms")

### Pseudocode
- ❌ Too language-specific
- ✅ Language-agnostic logic

### Architecture
- ❌ Over-engineering for hypothetical scale
- ✅ Design for current scale + 1 order of magnitude

### Refinement
- ❌ Skipping performance testing
- ✅ Test with production-like data and load

### Completion
- ❌ Manual deployments
- ✅ Fully automated CI/CD

---

## Quality Gates

### Specification Exit Criteria
- [ ] All requirements documented and reviewed
- [ ] Stakeholder sign-off obtained
- [ ] Scope clearly defined
- [ ] Success criteria established

### Pseudocode Exit Criteria
- [ ] Core workflows documented
- [ ] Edge cases identified
- [ ] Peer review completed
- [ ] References requirements

### Architecture Exit Criteria
- [ ] Technology choices justified
- [ ] Security considered
- [ ] Scalability planned
- [ ] Architecture review completed

### Refinement Exit Criteria
- [ ] Performance benchmarks met
- [ ] Security testing passed
- [ ] Integration tests passing
- [ ] Optimizations completed

### Completion Exit Criteria
- [ ] Code coverage > 80%
- [ ] Documentation complete
- [ ] CI/CD configured
- [ ] Production deployment successful
- [ ] Monitoring configured

---

## Time Distribution Guide

**Total Project Time:** 100%

```
Specification:  15% ████████
Pseudocode:     20% ██████████
Architecture:   25% ████████████
Refinement:     20% ██████████
Completion:     20% ██████████
```

**Note:** Percentages vary by project type

---

## Key Principles (Remember These!)

1. **Clarity Before Code**
   - Understand the problem before solving it

2. **Fail Fast**
   - Catch issues early when they're cheap to fix

3. **Document Everything**
   - Future you (and your team) will thank you

4. **Iterate and Refine**
   - No plan survives first contact; adapt

5. **Separate Concerns**
   - Keep requirements, design, and implementation distinct

6. **Measure Progress**
   - Track completion through phase gates

---

## Workflows

### Linear (Waterfall)
```
S → P → A → R → C
```
Best for: Clear requirements, regulatory projects

### Iterative (Agile)
```
Per Sprint: S → P → A
Continuous: R → C
```
Best for: Evolving requirements, rapid iteration

### Parallel (Distributed Teams)
```
Team A: S → P → A ──┐
Team B: S → P → A ──┼─→ R → C
Team C: S → P → A ──┘
```
Best for: Multiple teams, microservices

---

## Templates

### Quick Specification
```markdown
## Purpose
[One sentence: why does this exist?]

## Requirements
Must Have:
- [Requirement 1]
- [Requirement 2]

Should Have:
- [Requirement 3]

## Out of Scope
- [What we're not doing]

## Success Criteria
- [Measurable outcome 1]
- [Measurable outcome 2]
```

### Quick Pseudocode
```pseudocode
FUNCTION name(params):
    // Validate
    IF invalid:
        RETURN error

    // Process
    result = process(params)

    // Return
    RETURN result
END FUNCTION
```

### Quick Architecture
```markdown
## Tech Stack
- Frontend: [Technology + Why]
- Backend: [Technology + Why]
- Database: [Technology + Why]
- Cache: [Technology + Why]

## Key Design Decisions
1. [Decision + Rationale]
2. [Decision + Rationale]

## Diagram
[Simple box-and-arrow diagram]
```

---

## When NOT to Use SPARC

- Trivial scripts or utilities
- One-time throwaway prototypes
- Extremely time-constrained hotfixes
- Well-defined problems with standard solutions
- Learning/experimentation projects

**In these cases:** Use simpler approaches (Agile with minimal docs, rapid prototyping)

---

## SPARC with AI Code Assistants

SPARC is highly effective with AI tools like Claude, GitHub Copilot:

1. **Specification** → Clear context for AI
2. **Pseudocode** → Direct translation to prompts
3. **Architecture** → Framework for AI implementation
4. **Refinement** → AI-assisted testing and optimization
5. **Completion** → AI-generated documentation

**Pro Tip:** Use pseudocode directly as prompts for code generation

---

## Resources

- **Full Guide:** `/docs/SPARC_METHODOLOGY.md`
- **Templates:** `/docs/SPARC_METHODOLOGY.md#appendix-a`
- **Case Studies:** `/docs/SPARC_METHODOLOGY.md#11-case-studies`

---

## Quick Start

1. **Read the Specification section** of the full guide
2. **Create a simple spec** for your next feature
3. **Draft pseudocode** before writing code
4. **Review and iterate** based on feedback
5. **Gradually adopt** more phases as you see value

---

**Remember:** SPARC is a tool, not a religion. Adapt it to your needs!

**Version:** 1.0 | **Date:** 2025-11-18
