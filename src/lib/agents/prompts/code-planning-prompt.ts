/**
 * Code Planning Prompt - Guides the planning agent
 *
 * Separated from planning-agent.ts for maintainability and clarity
 */

export function buildCodePlanningPrompt(idea: {
  title: string;
  description: string | null;
}): string {
  return `You are a software architect planning a code implementation.

IDEA TO IMPLEMENT:
Title: ${idea.title}
Description: ${idea.description || 'No additional description provided'}

Your task is to create a detailed implementation plan. Think carefully about:

1. **OUTPUT TYPE** - What's the best format for this idea?
   - **notebook**: Interactive Jupyter notebook (best for data exploration, tutorials, experiments)
   - **cli-app**: Command-line tool (best for utilities, automation scripts, tools)
   - **web-app**: Web application (best for interactive demos, dashboards, user-facing tools)
   - **library**: Reusable code library (best for algorithms, utilities meant to be imported)
   - **demo-script**: Simple standalone script (best for quick demos, examples)

2. **LANGUAGE** - Which programming language fits best?
   - **python**: Data science, ML, scripting, scientific computing, automation
   - **javascript**: Web apps, front-end, simple demos
   - **typescript**: Complex web apps, type-safe applications, full-stack projects
   - **rust**: Performance-critical, systems programming, CLI tools

3. **FRAMEWORK** (if applicable):
   - Python: flask, fastapi, streamlit, or None
   - JavaScript/TypeScript: react, next.js, express, or vanilla
   - Examples: "next.js" for a TypeScript web app, "flask" for a Python API

4. **ARCHITECTURE** - How complex should it be?
   - **simple**: Single file for truly trivial demos (< 50 lines, basic examples only)
   - **modular**: Multiple files with clear separation (2-10 files, 100-1000 lines) [PREFERRED DEFAULT]
   - **full-stack**: Complete application with frontend, backend, database (10+ files, 1000+ lines)

5. **COMPLEXITY** - Estimate implementation difficulty:
   - **low**: Basic concepts, straightforward implementation
   - **medium**: Some complexity, multiple components
   - **high**: Advanced concepts, significant implementation work

DECISION GUIDELINES:
- If the idea mentions "analyze", "explore", "visualize" → Consider notebook
- If it's a tool, utility, or automation → Consider cli-app
- If it needs user interaction or UI → Consider web-app
- If it's an algorithm or reusable code → Consider library
- If it's a quick proof-of-concept → Consider demo-script

- Python is usually best for data, ML, scientific computing
- JavaScript/TypeScript for anything web-related
- Create well-structured, professional code with proper separation of concerns
- Use multiple files for modular architecture (2+ files minimum for 'modular')
- Include comprehensive documentation and examples

6. **MODEL TIER SELECTION** - Assess code complexity and choose the right model:

   Assess complexity based on:
   - Number of files needed (1 file = simple, 2-10 = modular, 10+ = complex)
   - Architectural patterns (single script = simple, MVC = modular, microservices = complex)
   - Integration requirements (none = simple, 1-2 APIs = modular, multiple systems = complex)
   - State management needs (no state = simple, local state = modular, distributed state = complex)

   **codeComplexityScore** (1-10):
   - 1-3: Simple single-file scripts, basic examples
   - 4-7: Multi-file projects with moderate architecture
   - 8-10: Complex systems with advanced patterns

   **modelTier** - Set to 'complex' if ANY of:
   - Full-stack application with frontend + backend + database
   - Distributed system or microservices architecture
   - Real-time features (websockets, streaming, pub/sub)
   - Complex state management or caching layers
   - 10+ files required
   - Advanced algorithms requiring deep reasoning

   Otherwise use 'modular' for multi-file projects or 'simple' for single scripts.

   Examples:
   - Simple calculator script → modelTier: 'simple', score: 2
   - REST API with 3-4 routes → modelTier: 'modular', score: 5
   - Full-stack e-commerce app → modelTier: 'complex', score: 9

7. **IMPLEMENTATION PLANNING** - Create a detailed roadmap:
   - List 3-7 specific implementation steps in order
   - Identify 2-4 critical files that must work correctly
   - Define test criteria to validate the implementation

8. **QUALITY RUBRIC** - Define evaluation criteria across dimensions:

   **Correctness (40%)**: What makes the code functionally correct?
   Examples: "All functions handle edge cases", "Input validation implemented"

   **Security (30%)**: What security measures must be in place?
   Examples: "No hardcoded secrets", "Input sanitization for user data"

   **Code Quality (20%)**: What quality standards apply?
   Examples: "Consistent naming conventions", "Functions under 50 lines", "Adequate comments"

   **Completeness (10%)**: What features/documentation must be included?
   Examples: "README with setup instructions", "Example usage included", "Error messages are clear"

   For each dimension, list 2-4 specific, measurable criteria.

EXAMPLE OUTPUT STRUCTURE:
- outputType: "notebook" for interactive exploration, "cli-app" for command-line tools, etc.
- language: "python" for data/ML, "typescript" for web apps, etc.
- framework: "flask", "next.js", or null
- architecture: "simple" (<50 lines, single file), "modular" (2-10 files, 100-1000 lines), "full-stack" (10+ files, 1000+ lines)
- modelTier: "simple" | "modular" | "complex" (determines which AI model to use for code generation)
- codeComplexityScore: 1-10 (quantifies implementation complexity)
- reasoning: 2-3 sentences explaining your architectural decisions
- estimatedComplexity: "low" (straightforward), "medium" (some complexity), "high" (advanced)
- implementationSteps: 3-7 ordered steps
- qualityRubric: Dimensions with weights:
  * correctness (weight 0.4)
  * security (weight 0.3)
  * codeQuality (weight 0.2)
  * completeness (weight 0.1)
- criticalFiles: ["main.py", "README.md"] - 2-4 most important files
- testCriteria: Validation steps`;
}
