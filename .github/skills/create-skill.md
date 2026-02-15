---
name: create-skill
description: Guide for creating new skill documentation files with proper structure and frontmatter
version: 1.0.0
created: 2026-02-15
updated: 2026-02-15
tags: [meta, documentation, skills]
---

# Skill: Create Skill

This meta-skill guides you through creating new skill documentation files for this project.

## When to Use This Skill

Use this skill when you need to:
- Document a new workflow or capability as a skill
- Create reusable guides for AI coding assistants
- Standardize how tasks are performed in this codebase

## Skill File Requirements

Every skill file MUST include:

### 1. YAML Frontmatter

All skill files must start with YAML frontmatter containing metadata:

```yaml
---
name: skill-name-in-kebab-case
description: Brief one-line description of what this skill does
version: 1.0.0
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2, tag3]
---
```

**Required fields:**
- `name`: Kebab-case identifier matching the filename
- `description`: One-sentence summary (max 120 characters)
- `version`: Semantic version starting at 1.0.0
- `created`: ISO date when skill was created
- `updated`: ISO date of last modification
- `tags`: Array of relevant tags for categorization

**Common tags:**
- `native` - C++ native bindings work
- `typescript` - TypeScript/JavaScript work
- `electron` - Electron desktop app
- `testing` - Test-related workflows
- `build` - Build system tasks
- `debugging` - Debugging workflows
- `meta` - Meta-skills about skills
- `documentation` - Documentation tasks

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

## Creating a New Skill

### Step 1: Identify the Skill Scope

Define a specific, focused workflow:
- **Good**: "Add FluCoMa Algorithm Binding" (specific deliverable)
- **Good**: "Debug Native Binding Crash" (specific problem)
- **Bad**: "Work on native code" (too vague)
- **Bad**: "Fix everything" (too broad)

### Step 2: Create the File

Create file in `.github/skills/` with kebab-case name:

```bash
touch .github/skills/your-skill-name.md
```

### Step 3: Add Frontmatter

Start with complete YAML frontmatter:

```yaml
---
name: your-skill-name
description: Clear one-line description of the skill
version: 1.0.0
created: 2026-02-15
updated: 2026-02-15
tags: [relevant, tags, here]
---
```

### Step 4: Write Content

Follow the structure template above. Include:
- Clear "When to Use" criteria
- Step-by-step instructions
- Code examples from the actual codebase
- Links to reference implementations
- Common pitfalls and solutions

### Step 5: Test the Skill

Validate the skill works by:
1. Following the instructions yourself
2. Checking that code examples are accurate
3. Verifying all links resolve correctly
4. Ensuring prerequisites are complete

### Step 6: Update Frontmatter Version

When updating an existing skill:
- Increment version (1.0.0 → 1.0.1 for fixes, 1.1.0 for additions, 2.0.0 for breaking changes)
- Update the `updated` date to current date

## Skill Naming Conventions

**File naming:**
- Use kebab-case: `add-flucoma-algorithm.md`
- Be specific: `test-native-binding.md` not `test.md`
- Use verbs: `create-`, `add-`, `debug-`, `fix-`

**Frontmatter name field:**
- Must match filename without `.md`
- Examples: `add-flucoma-algorithm`, `create-skill`

## Critical Patterns

### Always Include Frontmatter
Every skill file MUST start with valid YAML frontmatter. No exceptions.

### One Skill, One Task
Each skill should focus on a single, well-defined task. Break complex workflows into multiple skills.

### Use Concrete Examples
Always reference actual code from the repository. Don't use generic placeholders.

### Keep Updated
When the codebase changes, update affected skills and increment the version.

## Common Issues

**Missing frontmatter**
- Always start with `---` on line 1
- End frontmatter with `---` before content

**Invalid YAML**
- Check for proper indentation (2 spaces)
- Ensure arrays use `[item1, item2]` format
- Validate dates are ISO format (YYYY-MM-DD)

**Too broad or too narrow**
- Aim for 15-30 minute workflows
- If longer, break into multiple skills
- If shorter, combine with related tasks

## Reference Examples

- `.github/skills/add-flucoma-algorithm.md` - Complete skill for native bindings
- `.github/skills/create-skill.md` - This meta-skill

## Next Steps

After creating a skill:
1. Test it by following the instructions
2. Get feedback from others who use it
3. Update based on real usage patterns
4. Consider creating complementary skills for related workflows
