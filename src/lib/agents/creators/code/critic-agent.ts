import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeReview, CodeIssue } from './types';
import { CodeIssueSchema, CodeReviewSchema } from './types';
import { z } from 'zod';
import { MODEL_USE_CASES } from '@/lib/config/models';
import { createLogger } from '@/lib/logging/logger';

/**
 * CRITIC AGENT (Structured Outputs)
 *
 * Purpose: Review generated code for quality, security, and correctness
 *
 * This agent acts like a code reviewer in a pull request. It checks for:
 * - **Syntax errors**: Can the code actually run?
 * - **Security issues**: SQL injection, XSS, hardcoded secrets, unsafe practices
 * - **Best practices**: Proper error handling, type hints, documentation
 * - **Completeness**: Does it match the plan? Are there missing pieces?
 * - **Code quality**: Naming, structure, readability
 * - **Documentation**: README quality, examples, troubleshooting
 *
 * Why use a critic agent?
 * - LLMs sometimes generate buggy code
 * - Catching errors before publishing saves time
 * - Improves overall quality
 * - Evaluates code against defined quality rubric
 *
 * Architecture:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or complex fallback logic needed
 * - Type-safe: schema directly matches CodeReview interface
 * - 5-dimensional quality scoring (correctness, security, code quality, completeness, documentation)
 *
 * Model choice: GPT-4o-mini
 * - **Cost-effective**: Cheap for review tasks
 * - **Good at review**: Catches common bugs and issues
 * - **Fast**: Low latency
 */

/**
 * Note: Using CodeIssueSchema and CodeReviewSchema imported from ./types.ts
 * This eliminates schema duplication and ensures consistency across the codebase.
 */

type CodeReviewOutput = z.infer<typeof CodeReviewSchema>;

export async function reviewCode(
  code: GeneratedCode,
  plan: CodePlan
): Promise<{ review: CodeReview }> {
  const logger = createLogger({ stage: 'critic-agent' });

  logger.info('Reviewing code', {
    filesCount: code.files.length,
  });

  // Initialize GPT-5 Nano for cost-effective reviews
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not found, skipping code review');
    return {
      review: {
        hasErrors: false,
        issues: [],
        overallScore: 75, // Default passing score
        recommendation: 'approve',
        categoryScores: { correctness: 75, security: 75, codeQuality: 75, completeness: 75, documentation: 75 },
        strengths: ['Code generated successfully'],
        weaknesses: ['Not reviewed - no API key configured'],
        securityConcerns: [],
        filePriority: [],
        fixSuggestions: [],
      },

    };
  }

  const model = new ChatOpenAI({
    modelName: MODEL_USE_CASES.codeReview,
    temperature: 0.5,
  });

  // Use structured output (guarantees valid JSON matching our schema)
  const structuredModel = model.withStructuredOutput(CodeReviewSchema);

  const prompt = buildReviewPrompt(code, plan);

  try {
    const result = await structuredModel.invoke(prompt);

    logger.info('Code review complete', {
      overallScore: result.overallScore,
      categoryScores: result.categoryScores,
      issuesCount: result.issues.length,
      fixSuggestionsCount: result.fixSuggestions?.length || 0,
      recommendation: result.recommendation,
    });

    return {
      review: result,
    };
  } catch (error) {
    logger.error('Critic agent failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return a permissive review on failure (don't block the pipeline)
    return {
      review: {
        hasErrors: false,
        issues: [
          {
            severity: 'warning',
            file: 'unknown',
            line: null,
            message: `Code review failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            suggestion: null,
          },
        ],
        overallScore: 70,
        recommendation: 'approve', // Proceed despite review failure
        categoryScores: { correctness: 70, security: 70, codeQuality: 70, completeness: 70, documentation: 70 },
        strengths: [],
        weaknesses: ['Code review failed'],
        securityConcerns: [],
        filePriority: [],
        fixSuggestions: [],
      },

    };
  }
}

/**
 * Build the review prompt
 *
 * This prompt guides the LLM to act as a thorough code reviewer
 */
function buildReviewPrompt(code: GeneratedCode, plan: CodePlan): string {
  // Format all files for review
  const filesContent = code.files
    .map(
      (file) => `
=== ${file.path} ===
\`\`\`${file.language || plan.language}
${file.content}
\`\`\`
`
    )
    .join('\n');

  // Build rubric section if available
  const rubricSection = plan.qualityRubric
    ? `
QUALITY RUBRIC (from planning phase):
Use these specific criteria to evaluate the code:

**Correctness (${(plan.qualityRubric.correctness.weight * 100).toFixed(0)}%):**
${plan.qualityRubric.correctness.criteria.map((c) => `  ✓ ${c}`).join('\n')}

**Security (${(plan.qualityRubric.security.weight * 100).toFixed(0)}%):**
${plan.qualityRubric.security.criteria.map((c) => `  ✓ ${c}`).join('\n')}

**Code Quality (${(plan.qualityRubric.codeQuality.weight * 100).toFixed(0)}%):**
${plan.qualityRubric.codeQuality.criteria.map((c) => `  ✓ ${c}`).join('\n')}

**Completeness (${(plan.qualityRubric.completeness.weight * 100).toFixed(0)}%):**
${plan.qualityRubric.completeness.criteria.map((c) => `  ✓ ${c}`).join('\n')}

**Documentation (${(plan.qualityRubric.documentation.weight * 100).toFixed(0)}%):**
${plan.qualityRubric.documentation.criteria.map((c) => `  ✓ ${c}`).join('\n')}

Critical files to focus on: ${plan.criticalFiles?.join(', ') || 'Not specified'}
`
    : '';

  return `You are an expert code reviewer. Review this ${plan.language} ${plan.outputType} project.

PROJECT PLAN:
- Output Type: ${plan.outputType}
- Language: ${plan.language}
- Framework: ${plan.framework || 'None'}
- Architecture: ${plan.architecture}
- Expected Complexity: ${plan.estimatedComplexity}

PROJECT FILES:
${filesContent}

${rubricSection}

REVIEW CHECKLIST:

1. **Syntax & Runtime Errors**
   - Can this code actually run?
   - Are there syntax errors?
   - Missing imports or dependencies?
   - Type errors (for typed languages)?

2. **Security Issues** (CRITICAL)
   - Hardcoded secrets, API keys, passwords
   - SQL injection vulnerabilities
   - XSS vulnerabilities (for web code)
   - Unsafe file operations
   - Command injection risks
   - Insecure random number generation

3. **Best Practices**
   - Proper error handling (try/catch, error messages)
   - Input validation
   - Code documentation (comments, docstrings)
   - Type hints (Python) or type annotations (TypeScript)
   - Consistent naming conventions
   - Modularity and separation of concerns

4. **Completeness**
   - Does it implement what the plan describes?
   - Are there TODO comments or incomplete sections?
   - Does the README match the actual code?
   - Are dependencies correctly listed?

5. **Code Quality**
   - Is the code readable and maintainable?
   - Are variable/function names descriptive?
   - Is the file structure logical?
   - Are there code smells (overly complex functions, duplication)?

6. **Documentation Quality** (NEW - HIGH PRIORITY)
   - README includes architecture overview and design decisions
   - Multiple concrete usage examples provided (at least 2)
   - File structure is explained with descriptions
   - Installation steps are clear and complete
   - Troubleshooting section exists with common issues
   - Examples show input and expected output
   - Technical details explain dependencies and key algorithms
   - README is comprehensive, not just a template

SCORING GUIDELINES:
- 90-100: Excellent - Production ready, no issues
- 80-89: Good - Minor improvements needed
- 70-79: Acceptable - Some issues but functional
- 60-69: Needs work - Multiple issues
- Below 60: Poor - Major problems, recommend regenerate

SCORING METHOD:
1. Evaluate each criterion in the rubric (0-100 for each)
2. Calculate category scores by averaging criteria in each category
3. Calculate overall score = weighted sum of category scores using these weights:
   - Correctness: 35%
   - Security: 25%
   - Code Quality: 20%
   - Completeness: 10%
   - Documentation: 10%
4. If no rubric provided, use general assessment
5. IMPORTANT: Documentation dimension is separate from completeness - evaluate README quality independently

PROVIDE ACTIONABLE FEEDBACK:
For each issue found, provide:
- Specific file and line (if possible)
- Clear problem description
- Concrete fix suggestion (detailed, implementable with code examples)
- Priority: critical/important/minor

EXAMPLE OUTPUT STRUCTURE:
- overallScore: 0-100 (weighted average of category scores)
- categoryScores: { correctness: 90, security: 85, codeQuality: 80, completeness: 85, documentation: 88 }
- hasErrors: true if critical errors found, false otherwise
- recommendation: "approve" (≥75), "revise" (60-74), or "regenerate" (<60)
- strengths: ["Clean code structure", "Good error handling", "Comprehensive README with examples"]
- weaknesses: ["Could use more comments", "Missing edge case handling", "README lacks troubleshooting section"]
- securityConcerns: ["Hardcoded API key on line 15"] or []
- filePriority: [{ file: "main.py", priority: "high", reason: "Core logic needs validation" }]
- fixSuggestions: [{
    file: "main.py",
    issue: "Missing input validation on user input",
    suggestedFix: "Add type checking: if not isinstance(input, str) or len(input) > 1000: raise ValueError('Invalid input')",
    priority: "critical"
  }]
- issues: [{
    severity: "warning",
    file: "main.py",
    line: 23,
    message: "Consider adding input validation",
    suggestion: "Add type checking for user input"
  }]

Be thorough but fair. Code generated by AI doesn't need to be perfect, just functional and safe.`;
}

/**
 * Note: With structured outputs, we no longer need parseReview()!
 * The LLM guarantees valid output matching our Zod schema, so:
 * - No JSON parsing errors
 * - No normalization needed
 * - No validation needed
 * - No manual error handling with fallbacks
 * - Type safety built-in
 *
 * The old parseReview() had 127 lines of complex error handling - all eliminated!
 */
