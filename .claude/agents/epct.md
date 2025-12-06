---
description: Execute a full EPCT workflow (Explore, Plan, Code, Test) for implementing features with thorough research and validation
allowed-tools: [WebSearch, WebFetch, Task, Grep, Glob, Read, Write, Edit, TodoWrite, Bash]
argument-hint: <feature description>
model: sonnet
---

# EPCT Workflow: Explore, Plan, Code, Test

You are executing the EPCT workflow for the following feature request:

**Feature:** $ARGUMENTS

Follow this structured 4-phase workflow. Complete each phase fully before moving to the next.

---

## Phase 1: EXPLORE

<exploration_objectives>
Your goal is to gather all necessary context before planning. This includes:
1. Research external knowledge (best practices, libraries, patterns)
2. Understand the existing codebase structure
3. Identify relevant files, patterns, and conventions
</exploration_objectives>

### Step 1.1: External Research
Use WebSearch or WebFetch to research:
- Best practices for implementing this type of feature
- Relevant libraries, frameworks, or patterns that might help
- Common pitfalls or security considerations
- Modern approaches and standards for this functionality
- Gemini AI API best practices (if relevant)
- Next.js 14 patterns and React 19 features

Document your findings clearly.

### Step 1.2: Codebase Exploration
Use the Task tool with subagent_type=Explore to thoroughly investigate:
- Existing similar features or patterns in the codebase
- Project structure and architecture
- Naming conventions and coding patterns
- Configuration files and project setup
- Related models, services, components, or utilities
- Gemini API integration patterns
- Image processing workflows

**IMPORTANT:** Focus on understanding HOW the application is structured, not just WHAT exists. Look for:
- Where similar features are implemented
- How components interact with each other
- What patterns are consistently used
- What dependencies are already available
- How Gemini API is currently used

### Step 1.3: Context Summary
After exploration, provide a clear summary:
- Key findings from external research
- Relevant existing code patterns discovered
- Technical constraints or dependencies identified
- Any assumptions that need validation

---

## Phase 2: PLAN

<planning_objectives>
Use TodoWrite to create a comprehensive implementation plan based on your exploration findings.
</planning_objectives>

### Step 2.1: Create Todo List
Using the TodoWrite tool, create a structured task list that includes:

1. **Preparation tasks** (if needed):
   - Configuration updates
   - Dependency installations
   - Environment variable setup

2. **Implementation tasks** (be specific):
   - Backend changes (API routes, Gemini integration)
   - Frontend changes (components, pages, hooks)
   - Image processing logic
   - Integration points
   - Each task should be granular and actionable

3. **Testing tasks**:
   - Unit tests to write
   - Integration tests to run
   - Manual validation steps
   - Gemini API testing

### Step 2.2: Plan Review
Present your plan to the user for approval:
- Explain your approach and why you chose it
- Highlight any trade-offs or decisions made
- Ask for confirmation before proceeding to code

**WAIT for user approval before proceeding to Phase 3.**

---

## Phase 3: CODE

<coding_objectives>
Implement the feature following the approved plan. Write clean, maintainable code that follows existing project patterns.
</coding_objectives>

### Step 3.1: Implementation Guidelines
- Follow the todo list strictly, marking tasks as in_progress and completed
- Use Edit for modifying existing files (preferred)
- Use Write only for new files that are absolutely necessary
- Match the coding style and patterns discovered during exploration
- Add clear comments only where complexity requires explanation
- Implement proper error handling and validation
- Consider security implications (XSS, API key exposure, input validation)
- Follow React 19 and Next.js 14 best practices

### Step 3.2: Code Quality
- Avoid backwards-compatibility hacks
- Delete unused code completely (no commented-out code)
- Ensure type safety (TypeScript, proper types)
- Follow DRY principles
- Keep functions focused and single-purpose
- Optimize Gemini API calls (caching, rate limiting)

### Step 3.3: Progress Updates
- Mark each todo as completed immediately after finishing
- Keep the user informed of progress
- If you encounter blockers, update the todo list accordingly

---

## Phase 4: TEST

<testing_objectives>
Validate that the implementation works correctly using available tools and tests.
</testing_objectives>

### Step 4.1: Discover Available Tests
Read the project configuration files to identify what testing tools are available:
- Read package.json to find test scripts (npm test, npm run test:unit, etc.)
- Check for test configuration files (jest.config.js, vitest.config.ts, etc.)
- Look for TypeScript configuration (tsconfig.json) for type checking
- Identify linting tools (eslint, prettier)

### Step 4.2: Execute Available Tests
**ONLY run tests that actually exist in the project.** Do not assume or invent test commands.

For each available test command:
1. Run the command using Bash
2. Review the output for failures
3. If failures occur:
   - Analyze the error messages
   - Fix the issues
   - Re-run the tests
   - Update the relevant todo as needed

Common test commands to check for:
- `npm test` or `npm run test`
- `npm run dev` (verify dev server starts)
- `npm run build` (verify production build)
- `npm run lint`
- `npm run type-check` or `tsc --noEmit`

### Step 4.3: Manual Validation Checklist
If automated tests don't cover everything, create a manual validation checklist:
- Core functionality works as expected
- Gemini API integration works correctly
- Image upload and processing work
- Error cases are handled gracefully
- UI is responsive and accessible (if applicable)
- Security measures are in place (API key not exposed)
- Performance is acceptable

### Step 4.4: Final Summary
Provide a comprehensive summary:
- All todos completed ✓
- All tests passing ✓
- Any manual testing steps the user should perform
- Links to key files changed: [filename.ts:line](path/to/file.ts#Lline)
- Brief description of what was implemented

---

## Workflow Rules

1. **Never skip phases** - Complete Explore before Plan, Plan before Code, Code before Test
2. **Wait for approval** - After Phase 2 (Plan), wait for user confirmation
3. **Use TodoWrite extensively** - Track every task and update status in real-time
4. **Only test what exists** - Never run commands that aren't configured in the project
5. **Be thorough in exploration** - Better to over-research than under-deliver
6. **Follow existing patterns** - Match the codebase style and architecture
7. **Fix all test failures** - Don't mark the workflow complete until tests pass

Begin Phase 1: EXPLORE now.

---

## Project Context: YachtGenius

**YachtGenius** is a Next.js 14 application for redesigning yacht interiors using Gemini AI.

### Tech Stack
- **Frontend**: React 19, Next.js 14 App Router, Vite (current)
- **AI**: Google Gemini 2.5 Flash (Nano Banana)
- **Styling**: CSS3 with glass morphism and holographic effects
- **Language**: TypeScript (strict mode)

### Key Features
- Image upload for yacht interiors
- AI-powered structure analysis via Gemini
- 5 style transformations:
  1. Futuristic Minimalist
  2. Art Deco Luxury
  3. Biophilic Zen
  4. Mediterranean Riviera
  5. Cyberpunk Industrial

### Architecture Patterns
- **API Routes**: `app/api/<resource>/route.ts` (Next.js)
- **Pages**: `app/<page>/page.tsx`
- **Components**: `components/<Component>.tsx`
- **Utilities**: `lib/<utility>.ts`
- **Types**: `lib/types.ts`

### Key Files
- `CLAUDE.md` - Complete project documentation
- `lib/gemini.ts` - Gemini API client (to be created)
- `lib/imageUtils.ts` - Image processing utilities
- `lib/types.ts` - TypeScript types
- `app/api/generate/route.ts` - Main generation API

### Environment Variables
- `GEMINI_API_KEY` - Google Gemini API key
- `GEMINI_MODEL` - Model name (gemini-2.5-flash)
- `GEMINI_TIMEOUT` - API timeout (default: 60s)

### Available MCP Servers
- **gemini-yacht-mcp** - Gemini AI integration
  - `analyze_structure` - Analyze yacht interior structure
  - `generate_style` - Generate style transformation
  - `generate_all` - Generate all 5 styles
  - `list_styles` - List available styles

### Documentation
For detailed information, always refer to:
- `CLAUDE.md` - Project documentation
- `mcp/gemini-yacht-mcp/README.md` - MCP documentation
- `.claude/agents/explore-code.md` - Codebase exploration agent

---

## Gemini AI Integration

When working with Gemini API:
- Always use async/await for API calls
- Implement proper timeout handling (60s default)
- Validate base64 images before sending
- Handle errors gracefully with user-friendly messages
- Never expose API keys in client-side code
- Use environment variables for configuration

### Prompt Engineering
Follow these patterns for Gemini prompts:
1. **Structure Analysis**: Extract architectural details only
2. **Style Generation**: Preserve structure, change decor only
3. **Clear Constraints**: Specify what NOT to change
4. **Quality Requirements**: Request photorealistic, 8k renders

---

## Security Checklist

Before completing any feature:
- [ ] API keys are in environment variables (.env files)
- [ ] .env files are in .gitignore
- [ ] No hardcoded credentials
- [ ] Input validation on all user uploads
- [ ] File size limits enforced (max 10MB)
- [ ] Allowed file types validated (JPEG, PNG, WebP only)
- [ ] Rate limiting considered for API calls
- [ ] Error messages don't leak sensitive info

---

**Ready to build amazing yacht interior transformations! 🚢✨**
