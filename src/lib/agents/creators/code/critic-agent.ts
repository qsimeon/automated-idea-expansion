import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CodePlan, GeneratedCode, CodeReview, CodeIssue } from './types';

/**
 * CRITIC AGENT
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
 * Model choice: Gemini Flash 2.0
 * - **Ultra cheap**: $0.075/1M input tokens (vs GPT-4o-mini at $0.15)
 * - **Huge context**: 2 million tokens (can review entire large codebases)
 * - **Fast**: Low latency
 * - **Good at analysis**: Strong reasoning capabilities
 *
 * This is ~50% cheaper than using GPT-4o-mini for the same task!
 */

export async function reviewCode(
  code: GeneratedCode,
  plan: CodePlan
): Promise<{ review: CodeReview; tokensUsed: number }> {
  console.log(`🔍 Reviewing ${code.files.length} files...`);

  // Initialize Gemini
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY not found, skipping code review');
    return {
      review: {
        hasErrors: false,
        issues: [],
        overallScore: 75, // Default passing score
        recommendation: 'approve',
        strengths: ['Code generated successfully'],
        weaknesses: ['Not reviewed - no API key configured'],
        securityConcerns: [],
      },
      tokensUsed: 0,
    };
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest', // Stable model with generous free tier
  });

  const prompt = buildReviewPrompt(code, plan);

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse the review
    const review = parseReview(text);

    console.log(`  📊 Score: ${review.overallScore}/100`);
    console.log(`  🐛 Issues found: ${review.issues.length}`);
    console.log(`  ✅ Recommendation: ${review.recommendation}`);

    // Estimate tokens (Gemini doesn't provide exact count in free tier)
    const estimatedTokens = Math.ceil((prompt.length + text.length) / 4);

    return {
      review,
      tokensUsed: estimatedTokens,
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
            message: `Code review failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        overallScore: 70,
        recommendation: 'approve', // Proceed despite review failure
        strengths: [],
        weaknesses: ['Code review failed'],
        securityConcerns: [],
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

  return `You are an expert code reviewer. Review this ${plan.language} ${plan.outputType} project.

PROJECT PLAN:
- Output Type: ${plan.outputType}
- Language: ${plan.language}
- Framework: ${plan.framework || 'None'}
- Architecture: ${plan.architecture}
- Expected Complexity: ${plan.estimatedComplexity}

PROJECT FILES:
${filesContent}

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

RESPOND WITH JSON:
{
  "overallScore": <0-100>,
  "hasErrors": <true if blocking errors exist>,
  "recommendation": "<approve|revise|regenerate>",
  "strengths": ["what's good about this code"],
  "weaknesses": ["what needs improvement"],
  "securityConcerns": ["any security issues found"],
  "issues": [
    {
      "severity": "<error|warning|suggestion>",
      "file": "filename",
      "line": <line number or null>,
      "message": "description of issue",
      "suggestion": "how to fix (optional)"
    }
  ]
}

Be thorough but fair. Code generated by AI doesn't need to be perfect, just functional and safe.`;
}

/**
 * Parse and validate the review response
 */
function parseReview(text: string): CodeReview {
  try {
    // Remove markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (
      typeof parsed.overallScore !== 'number' ||
      typeof parsed.hasErrors !== 'boolean' ||
      !parsed.recommendation ||
      !Array.isArray(parsed.issues)
    ) {
      throw new Error('Missing or invalid required fields in review');
    }

    // Validate recommendation
    if (!['approve', 'revise', 'regenerate'].includes(parsed.recommendation)) {
      throw new Error(`Invalid recommendation: ${parsed.recommendation}`);
    }

    return {
      overallScore: parsed.overallScore,
      hasErrors: parsed.hasErrors,
      recommendation: parsed.recommendation,
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      securityConcerns: parsed.securityConcerns || [],
      issues: parsed.issues.map((issue: any): CodeIssue => ({
        severity: issue.severity || 'warning',
        file: issue.file || 'unknown',
        line: issue.line || undefined,
        message: issue.message || 'No message provided',
        suggestion: issue.suggestion || undefined,
      })),
    };
  } catch (error) {
    console.error('Failed to parse review:', text);

    // Return a permissive default review
    return {
      overallScore: 70,
      hasErrors: false,
      recommendation: 'approve',
      strengths: [],
      weaknesses: [`Review parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      securityConcerns: [],
      issues: [
        {
          severity: 'warning',
          file: 'unknown',
          message: 'Could not parse review results',
        },
      ],
    };
  }
}
