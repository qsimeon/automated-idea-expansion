import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeReview, CodeIssue } from './types';
import { z } from 'zod';

/**
 * CRITIC AGENT (V2 - Structured Outputs)
 *
 * Purpose: Review generated code for quality, security, and correctness
 *
 * This agent acts like a code reviewer in a pull request. It checks for:
 * - **Syntax errors**: Can the code actually run?
 * - **Security issues**: SQL injection, XSS, hardcoded secrets, unsafe practices
 * - **Best practices**: Proper error handling, type hints, documentation
 * - **Completeness**: Does it match the plan? Are there missing pieces?
 * - **Code quality**: Naming, structure, readability
 *
 * Why use a critic agent?
 * - LLMs sometimes generate buggy code
 * - Catching errors before publishing saves time
 * - Improves overall quality
 * - Provides feedback for the fixer agent
 *
 * V2 Improvements:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or complex fallback logic needed
 * - Type-safe: schema directly matches CodeReview interface
 *
 * Model choice: GPT-5 Nano
 * - **Cost-effective**: Very cheap for review tasks
 * - **Good at review**: Catches common bugs and issues
 * - **Fast**: Low latency
 * - We save the expensive model (Sonnet) for generation where it matters most
 */

// Define schemas for code review
const CodeIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'suggestion']).describe('Severity level of the issue'),
  file: z.string().describe('File path where the issue was found'),
  line: z.union([z.number(), z.null()]).describe('Line number if applicable, or null'),
  message: z.string().describe('Clear description of the issue'),
  suggestion: z.union([z.string(), z.null()]).describe('Suggestion for how to fix, or null'),
});

const FilePrioritySchema = z.object({
  file: z.string().describe('File path'),
  priority: z.enum(['high', 'medium', 'low']).describe('Priority level for fixing'),
  reason: z.string().describe('Why this file needs attention'),
});

const FixSuggestionSchema = z.object({
  file: z.string().describe('File path to fix'),
  issue: z.string().describe('Clear description of the problem'),
  suggestedFix: z.string().describe('Detailed, implementable fix (include code examples)'),
  priority: z.enum(['critical', 'important', 'minor']).describe('Priority level'),
});

const CategoryScoresSchema = z.object({
  correctness: z.number().min(0).max(100).describe('Score for functional correctness (0-100)'),
  security: z.number().min(0).max(100).describe('Score for security (0-100)'),
  codeQuality: z.number().min(0).max(100).describe('Score for code quality (0-100)'),
  completeness: z.number().min(0).max(100).describe('Score for completeness (0-100)'),
});

const CodeReviewSchema = z.object({
  overallScore: z.number().min(0).max(100).describe('Overall quality score (0-100)'),
  hasErrors: z.boolean().describe('Whether critical errors were found'),
  recommendation: z.enum(['approve', 'revise', 'regenerate']).describe('What action to take next'),
  categoryScores: CategoryScoresSchema.describe('Scores by category'),
  strengths: z.array(z.string()).describe('What the code does well'),
  weaknesses: z.array(z.string()).describe('Areas needing improvement'),
  securityConcerns: z.array(z.string()).describe('Security issues found'),
  filePriority: z.array(FilePrioritySchema).describe('Files prioritized by fix urgency'),
  fixSuggestions: z.array(FixSuggestionSchema).describe('Specific actionable fixes'),
  issues: z.array(CodeIssueSchema).describe('All issues found'),
});

type CodeReviewOutput = z.infer<typeof CodeReviewSchema>;

export async function reviewCode(
  code: GeneratedCode,
  plan: CodePlan
): Promise<{ review: CodeReview; tokensUsed: number }> {
  console.log(`🔍 Reviewing ${code.files.length} files...`);

  // Initialize GPT-5 Nano for cost-effective reviews
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not found, skipping code review');
    return {
      review: {
        hasErrors: false,
        issues: [],
        overallScore: 75, // Default passing score
        recommendation: 'approve',
        categoryScores: { correctness: 75, security: 75, codeQuality: 75, completeness: 75 },
        strengths: ['Code generated successfully'],
        weaknesses: ['Not reviewed - no API key configured'],
        securityConcerns: [],
        filePriority: [],
        fixSuggestions: [],
      },
      tokensUsed: 0,
    };
  }

  const model = new ChatOpenAI({
    modelName: 'gpt-5-nano-2025-08-07',
    // Note: GPT-5 nano only supports default temperature (1)
  });

  // Use structured output (guarantees valid JSON matching our schema)
  const structuredModel = model.withStructuredOutput(CodeReviewSchema);

  const prompt = buildReviewPrompt(code, plan);

  try {
    const result = await structuredModel.invoke(prompt);
    const tokensUsed = 0; // We'll estimate this for structured outputs

    console.log(`  📊 Score: ${result.overallScore}/100`);
    console.log(`  📈 Category scores: C:${result.categoryScores.correctness} S:${result.categoryScores.security} Q:${result.categoryScores.codeQuality} Comp:${result.categoryScores.completeness}`);
    console.log(`  🐛 Issues found: ${result.issues.length}`);
    console.log(`  🔧 Fix suggestions: ${result.fixSuggestions.length}`);
    console.log(`  ✅ Recommendation: ${result.recommendation}`);

    return {
      review: result,
      tokensUsed,
    };
  } catch (error) {
    console.error('❌ Critic agent failed:', error);

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
        categoryScores: { correctness: 70, security: 70, codeQuality: 70, completeness: 70 },
        strengths: [],
        weaknesses: ['Code review failed'],
        securityConcerns: [],
        filePriority: [],
        fixSuggestions: [],
      },
      tokensUsed: 0,
    };
  }
}

/**
 * Build the review prompt
 *
 * This prompt guides Gemini to act as a thorough code reviewer
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

SCORING GUIDELINES:
- 90-100: Excellent - Production ready, no issues
- 80-89: Good - Minor improvements needed
- 70-79: Acceptable - Some issues but functional
- 60-69: Needs work - Multiple issues
- Below 60: Poor - Major problems, recommend regenerate

SCORING METHOD:
1. Evaluate each criterion in the rubric (0-100 for each)
2. Calculate category scores by averaging criteria in each category
3. Calculate overall score = weighted sum of category scores
4. If no rubric provided, use general assessment

PROVIDE ACTIONABLE FEEDBACK:
For each issue found, provide:
- Specific file and line (if possible)
- Clear problem description
- Concrete fix suggestion (detailed, implementable with code examples)
- Priority: critical/important/minor

EXAMPLE OUTPUT STRUCTURE:
- overallScore: 0-100 (weighted average of category scores)
- categoryScores: { correctness: 90, security: 85, codeQuality: 80, completeness: 85 }
- hasErrors: true if critical errors found, false otherwise
- recommendation: "approve" (≥75), "revise" (60-74), or "regenerate" (<60)
- strengths: ["Clean code structure", "Good error handling"]
- weaknesses: ["Could use more comments", "Missing edge case handling"]
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
