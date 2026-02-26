---
name: create-skill
description: Creates new agent skills following the agentskills.io specification. Use when you need to add a new reusable skill to the repository. Ensures proper YAML frontmatter, directory structure, and template organization.
license: ISC
metadata:
  author: briansorahan
  version: "2.0"
  created: "2026-02-15"
  updated: "2025-02-25"
---

# Skill: Create Skill

## Purpose

This skill guides the creation of new agent skills that conform to the [agentskills.io specification](https://agentskills.io/specification). It ensures skills are properly structured, machine-readable, and portable across AI agents and platforms.

## When to Use

Use this skill when:
- Creating a new reusable workflow or procedure for the project
- Documenting a complex multi-step process that should be repeatable
- Building automation that requires structured guidance for AI agents
- Standardizing how certain tasks are performed

**Don't create skills for:**
- One-off tasks that won't be repeated
- Simple commands that don't need documentation
- Project-specific implementation details (those go in specs)

## agentskills.io Specification Requirements

### Required Structure

```
.github/skills/{skill-name}/
├── SKILL.md          # Required: YAML frontmatter + Markdown instructions
└── assets/           # Optional: templates, scripts, reference files
    ├── *.tmpl       # Template files with .tmpl suffix
    └── ...
```

### YAML Frontmatter (Required)

Every `SKILL.md` **must** start with YAML frontmatter:

```yaml
---
name: skill-name
description: Clear description of what this skill does and when it should be used.
license: ISC  # or MIT, Apache-2.0, etc.
metadata:
  author: your-username
  version: "1.0"
  created: "YYYY-MM-DD"
  updated: "YYYY-MM-DD"  # optional
---
```

**Field Requirements:**
- `name` (required): Lowercase, max 64 chars, letters/numbers/hyphens only, **must match directory name**
- `description` (required): 1-1024 chars, describes both **what it does AND when to use it**
- `license` (optional): License name or file reference
- `metadata` (optional): Arbitrary key-value pairs for internal use

### Common Mistakes to Avoid

Based on our experience creating the `create-new-spec` skill, watch out for:

1. **❌ Missing YAML frontmatter**
   - Every SKILL.md must start with `---` delimited YAML
   - This is what makes skills machine-readable

2. **❌ Template files in wrong location**
   - Templates should be in `assets/` subdirectory
   - Templates should have `.tmpl` or `.template` suffix, not just `.md`
   - Example: `assets/RESEARCH.md.tmpl` not `RESEARCH.md`

3. **❌ Vague description field**
   - Bad: "Helps with development"
   - Good: "Creates specification documents for new features. Use when planning non-trivial work."
   - Include WHAT it does and WHEN to use it

4. **❌ Inline templates in SKILL.md**
   - Don't embed full templates in SKILL.md using code blocks
   - Extract to `assets/` and reference them
   - Keeps SKILL.md focused on instructions

5. **❌ Wrong directory structure**
   - Bad: `.github/skills/my-skill.md`
   - Good: `.github/skills/my-skill/SKILL.md`

6. **❌ Name field doesn't match directory**
   - If directory is `create-skill/`, frontmatter name must be `create-skill`

### 2. Structure Template

After the frontmatter, use this structure:

```markdown
---
[frontmatter here]
---

# Skill: [Skill Name]

Brief description of what this skill helps accomplish.

## When to Use This Skill

Bullet list of specific scenarios:
- When you need to...
- When you want to...
- When you're working on...

## Prerequisites

What must be in place before using this skill:
- Required tools/dependencies
- Required knowledge
- Required file structure

## Step-by-Step Guide

### Step 1: [Action]

Clear instructions with code examples.

### Step 2: [Action]

More instructions.

## Critical Patterns

Key patterns that must always be followed:
- Pattern 1
- Pattern 2

## Common Issues

**Issue description**
- Solution 1
- Solution 2

## Reference Examples

- Link to example 1
- Link to example 2

## Next Steps

What to do after completing this skill:
1. Action 1
2. Action 2
```

## Step-by-Step Process

### Step 1: Choose a Name

```bash
# Use kebab-case, max 64 characters, descriptive
SKILL_NAME="deploy-to-production"  # example
```

### Step 2: Create Directory Structure

```bash
mkdir -p .github/skills/$SKILL_NAME
mkdir -p .github/skills/$SKILL_NAME/assets  # if you need templates
```

### Step 3: Create SKILL.md with Frontmatter

```bash
cat > .github/skills/$SKILL_NAME/SKILL.md << 'EOF'
---
name: SKILL_NAME_HERE
description: What this skill does and when to use it (be specific!)
license: ISC
metadata:
  author: your-username
  version: "1.0"
  created: "YYYY-MM-DD"
---

# Skill: SKILL_TITLE_HERE

## Purpose

Brief explanation of what this skill accomplishes.

## When to Use

Specific scenarios when this skill should be invoked.

## Instructions

Step-by-step guide for using this skill...

EOF
```

### Step 4: Add Template Files (if needed)

If your skill requires templates:

```bash
# Create template in assets/ with .tmpl suffix
cat > .github/skills/$SKILL_NAME/assets/example.md.tmpl << 'EOF'
# {PLACEHOLDER_NAME}

Content with {PLACEHOLDERS} that will be replaced...
EOF
```

### Step 5: Document Template Usage

In your SKILL.md, reference templates:

```markdown
## Templates

Template files are located in `.github/skills/{skill-name}/assets/`:

- `example.md.tmpl` - Description of what this template is for

When using this skill, copy templates and fill in placeholders:
- `{PLACEHOLDER}` - Description of what to replace
```

### Step 6: Validate

Check your skill meets the spec:

- [ ] YAML frontmatter present and valid
- [ ] `name` field matches directory name
- [ ] `description` explains what and when
- [ ] Templates in `assets/` with `.tmpl` suffix (if applicable)
- [ ] Clear step-by-step instructions
- [ ] Examples provided where helpful

## Skill Scope Best Practices

### Step 1: Identify the Skill Scope

Define a specific, focused workflow:
- **Good**: "Add FluCoMa Algorithm Binding" (specific deliverable)
- **Good**: "Debug Native Binding Crash" (specific problem)
- **Bad**: "Work on native code" (too vague)
- **Bad**: "Fix everything" (too broad)

## Example: Well-Formed Skill

See `.github/skills/create-new-spec/` for a complete example that follows all these guidelines.

## Benefits of Following the Spec

- **Portability**: Skills work across different AI agents and platforms
- **Discoverability**: Machine-readable metadata enables skill search
- **Maintainability**: Clear structure makes updates easier
- **Reusability**: Well-documented skills can be shared and adapted

## References

- [agentskills.io Specification](https://agentskills.io/specification)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)
- Example: `.github/skills/create-new-spec/` in this repository
