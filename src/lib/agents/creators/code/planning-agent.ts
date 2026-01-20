import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan } from './types';

/**
 * PLANNING AGENT
 *
 * Purpose: Analyze an idea and create an implementation plan
 *
 * This agent acts like a software architect, making high-level decisions:
 * - What type of output? (notebook, CLI app, web app, library, demo script)
 * - Which language? (Python for data/ML, JS/TS for web, etc.)
 * - How complex? (simple script vs full application)
 * - Which framework? (if applicable)
 *
 * Why separate planning from generation?
 * - Planning requires different thinking than coding
 * - Makes the generation agent more focused
 * - Allows us to validate the plan before generating
 * - Easier to add human-in-the-loop approval later
 *
 * Model choice: GPT-4o-mini
 * - Cheap ($0.15/1M input tokens, $0.60/1M output tokens)
 * - Good at structured reasoning and decision-making
 * - Fast response time
 */

export async function planCodeProject(idea: {
  id: string;
  title: string;
  description: string | null;
}): Promise<{ plan: CodePlan; tokensUsed: number }> {
  console.log(`🎯 Planning code project for: "${idea.title}"`);

  const model = new ChatOpenAI({
    modelName: 'gpt-5-nano-2025-08-07',
    // Note: GPT-5 nano only supports default temperature (1)
  });

  const prompt = buildPlanningPrompt(idea);

  try {
    const response = await model.invoke(prompt);
    const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens || 0;

    // Parse the JSON response
    const content = response.content as string;
    const parsed = parseCodePlan(content);

    console.log(`  ✅ Plan: ${parsed.outputType} using ${parsed.language}`);
    console.log(`  📊 Complexity: ${parsed.estimatedComplexity}`);
    console.log(`  💡 Reasoning: ${parsed.reasoning.substring(0, 100)}...`);

    return {
      plan: parsed,
      tokensUsed,
    };
  } catch (error) {
    console.error('❌ Planning agent failed:', error);
    throw new Error(`Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build the planning prompt
 *
 * This prompt guides the LLM to think like a software architect
 */
function buildPlanningPrompt(idea: {
  title: string;
  description: string | null;
}): string {
  return `You are a software architect planning a code implementation.

IDEA TO IMPLEMENT:
Title: ${idea.title}
Description: ${idea.description || 'No additional description provided'}

Your task is to create an implementation plan. Think carefully about:

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
   - **simple**: Single file or minimal structure (< 100 lines)
   - **modular**: Multiple files with clear separation (100-500 lines)
   - **full-stack**: Complete application with frontend, backend, database (> 500 lines)

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
- Keep it simple unless complexity is clearly needed

6. **IMPLEMENTATION PLANNING** - Create a detailed roadmap:
   - List 3-7 specific implementation steps in order
   - Identify 2-4 critical files that must work correctly
   - Define test criteria to validate the implementation

7. **QUALITY RUBRIC** - Define evaluation criteria across four dimensions:

   **Correctness (40%)**: What makes the code functionally correct?
   Examples: "All functions handle edge cases", "Input validation implemented"

   **Security (30%)**: What security measures must be in place?
   Examples: "No hardcoded secrets", "Input sanitization for user data"

   **Code Quality (20%)**: What quality standards apply?
   Examples: "Consistent naming conventions", "Functions under 50 lines", "Adequate comments"

   **Completeness (10%)**: What features/documentation must be included?
   Examples: "README with setup instructions", "Example usage included", "Error messages are clear"

   For each dimension, list 2-4 specific, measurable criteria.

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "outputType": "<notebook|cli-app|web-app|library|demo-script>",
  "language": "<python|javascript|typescript|rust>",
  "framework": "<framework name or null>",
  "architecture": "<simple|modular|full-stack>",
  "reasoning": "<2-3 sentences explaining your decisions>",
  "estimatedComplexity": "<low|medium|high>",
  "implementationSteps": [
    "Set up project structure with main file and dependencies",
    "Implement core functionality with input validation",
    "Add error handling and edge case coverage",
    "Create comprehensive README with examples"
  ],
  "qualityRubric": {
    "correctness": {
      "weight": 0.4,
      "criteria": [
        "Code runs without syntax errors",
        "All functions handle edge cases",
        "Input validation implemented"
      ]
    },
    "security": {
      "weight": 0.3,
      "criteria": [
        "No hardcoded secrets or credentials",
        "Input sanitization for user data"
      ]
    },
    "codeQuality": {
      "weight": 0.2,
      "criteria": [
        "Consistent naming conventions",
        "Adequate comments explaining logic"
      ]
    },
    "completeness": {
      "weight": 0.1,
      "criteria": [
        "README with setup and usage instructions",
        "Example usage included"
      ]
    }
  },
  "criticalFiles": ["main.py", "README.md"],
  "testCriteria": ["Run code without errors", "Test with sample inputs", "Verify all features work"]
}`;
}

/**
 * Parse and validate the LLM's response
 */
function parseCodePlan(content: string): CodePlan {
  try {
    // Remove markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.outputType || !parsed.language || !parsed.architecture || !parsed.reasoning || !parsed.estimatedComplexity) {
      throw new Error('Missing required fields in plan');
    }

    // Validate enum values
    const validOutputTypes = ['notebook', 'cli-app', 'web-app', 'library', 'demo-script'];
    const validLanguages = ['python', 'javascript', 'typescript', 'rust'];
    const validArchitectures = ['simple', 'modular', 'full-stack'];
    const validComplexities = ['low', 'medium', 'high'];

    if (!validOutputTypes.includes(parsed.outputType)) {
      throw new Error(`Invalid outputType: ${parsed.outputType}`);
    }
    if (!validLanguages.includes(parsed.language)) {
      throw new Error(`Invalid language: ${parsed.language}`);
    }
    if (!validArchitectures.includes(parsed.architecture)) {
      throw new Error(`Invalid architecture: ${parsed.architecture}`);
    }
    if (!validComplexities.includes(parsed.estimatedComplexity)) {
      throw new Error(`Invalid estimatedComplexity: ${parsed.estimatedComplexity}`);
    }

    // Add defaults for new optional fields (backward compatibility)
    if (!parsed.implementationSteps || !Array.isArray(parsed.implementationSteps)) {
      parsed.implementationSteps = [];
    }
    if (!parsed.criticalFiles || !Array.isArray(parsed.criticalFiles)) {
      parsed.criticalFiles = [];
    }
    if (!parsed.testCriteria || !Array.isArray(parsed.testCriteria)) {
      parsed.testCriteria = [];
    }
    if (!parsed.qualityRubric) {
      // Default rubric if not provided
      parsed.qualityRubric = {
        correctness: { weight: 0.4, criteria: ["Code runs without errors"] },
        security: { weight: 0.3, criteria: ["No security issues"] },
        codeQuality: { weight: 0.2, criteria: ["Code is readable"] },
        completeness: { weight: 0.1, criteria: ["All required files present"] },
      };
    }

    return {
      outputType: parsed.outputType,
      language: parsed.language,
      framework: parsed.framework || undefined,
      architecture: parsed.architecture,
      reasoning: parsed.reasoning,
      estimatedComplexity: parsed.estimatedComplexity,
      // New fields (with defaults applied above)
      implementationSteps: parsed.implementationSteps,
      qualityRubric: parsed.qualityRubric,
      criticalFiles: parsed.criticalFiles,
      testCriteria: parsed.testCriteria,
    };
  } catch (error) {
    console.error('Failed to parse plan:', content);
    throw new Error(`Plan parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
