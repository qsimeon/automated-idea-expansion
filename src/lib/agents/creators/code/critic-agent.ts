import { ChatOpenAI } from '@langchain/openai';
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
 * Model choice: GPT-4o-mini
 * - **Cost-effective**: Much cheaper than Sonnet (~$0.002 vs $0.03)
 * - **Good at review**: Catches common bugs and issues
 * - **Fast**: Lower latency than larger models
 * - **Sufficient**: For code quality checks, mini is adequate
 * - We save the expensive model (Sonnet) for generation where it matters most
 */

export async function reviewCode(
  code: GeneratedCode,
  plan: CodePlan
): Promise<{ review: CodeReview; tokensUsed: number }> {
  console.log(`🔍 Reviewing ${code.files.length} files...`);

  // Initialize GPT-4o-mini for cost-effective reviews
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY not found, skipping code review');
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

  const model = new ChatOpenAI({
    modelName: 'gpt-5-nano-2025-08-07',
    // Note: GPT-5 nano only supports default temperature (1)
  });

  const prompt = buildReviewPrompt(code, plan);

  try {
    const result = await model.invoke(prompt);
    const text = result.content.toString();

    // Parse the review
    const review = parseReview(text);

    console.log(`  📊 Score: ${review.overallScore}/100`);
    console.log(`  🐛 Issues found: ${review.issues.length}`);
    console.log(`  ✅ Recommendation: ${review.recommendation}`);

    // Get actual token usage from OpenAI
    const tokensUsed = result.response_metadata?.tokenUsage
      ? result.response_metadata.tokenUsage.promptTokens + result.response_metadata.tokenUsage.completionTokens
      : Math.ceil((prompt.length + text.length) / 4); // Fallback estimate

    return {
      review,
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
- Concrete fix suggestion (detailed, implementable)
- Priority: critical/important/minor

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any other text, explanations, or markdown formatting.

REQUIRED JSON FORMAT (copy this structure exactly):
{
  "overallScore": 85,
  "hasErrors": false,
  "recommendation": "approve",
  "categoryScores": {
    "correctness": 90,
    "security": 85,
    "codeQuality": 80,
    "completeness": 85
  },
  "strengths": ["Clean code structure", "Good error handling"],
  "weaknesses": ["Could use more comments"],
  "securityConcerns": [],
  "filePriority": [
    {
      "file": "main.py",
      "priority": "high",
      "reason": "Core logic needs input validation"
    }
  ],
  "fixSuggestions": [
    {
      "file": "main.py",
      "issue": "Missing input validation on user input",
      "suggestedFix": "Add type checking and range validation before processing. Example: if not isinstance(input, str) or len(input) > 1000: raise ValueError('Invalid input')",
      "priority": "critical"
    }
  ],
  "issues": [
    {
      "severity": "warning",
      "file": "main.py",
      "line": 23,
      "message": "Consider adding input validation",
      "suggestion": "Add type checking for user input"
    }
  ]
}

IMPORTANT RULES:
- Return ONLY the JSON object above
- No markdown code blocks (no \`\`\`json)
- No explanatory text before or after
- No emojis or special characters
- Just pure JSON that can be parsed directly

Be thorough but fair. Code generated by AI doesn't need to be perfect, just functional and safe.`;
}

/**
 * Parse and validate the review response
 *
 * Handles multiple formats:
 * - Pure JSON
 * - JSON wrapped in markdown code blocks
 * - JSON with extra text before/after
 */
function parseReview(text: string): CodeReview {
  try {
    let cleaned = text.trim();

    // Strategy 1: Remove markdown code blocks
    if (cleaned.includes('```')) {
      // Extract content between code blocks
      const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleaned = match[1].trim();
      } else {
        // If no closing block, just remove opening markers
        cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
    }

    // Strategy 2: Try to extract JSON object from text
    // Look for first { and last } to isolate JSON
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    // Strategy 3: Parse the JSON
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

    // Normalize recommendation (handle variations from Gemini)
    let normalizedRecommendation: 'approve' | 'revise' | 'regenerate';
    const rec = parsed.recommendation?.toLowerCase() || '';

    if (rec.includes('approve')) {
      // "approve", "approve_with_fixes", "approved" → all become "approve"
      normalizedRecommendation = 'approve';
    } else if (rec.includes('revise') || rec.includes('fix')) {
      normalizedRecommendation = 'revise';
    } else if (rec.includes('regenerate') || rec.includes('rewrite')) {
      normalizedRecommendation = 'regenerate';
    } else {
      // Default to approve if unrecognized
      console.warn(`Unrecognized recommendation: ${parsed.recommendation}, defaulting to 'approve'`);
      normalizedRecommendation = 'approve';
    }

    // Add defaults for new optional fields (backward compatibility)
    if (!parsed.categoryScores) {
      // Default to overall score for all categories if not provided
      parsed.categoryScores = {
        correctness: parsed.overallScore || 70,
        security: parsed.overallScore || 70,
        codeQuality: parsed.overallScore || 70,
        completeness: parsed.overallScore || 70,
      };
    }
    if (!parsed.filePriority || !Array.isArray(parsed.filePriority)) {
      parsed.filePriority = [];
    }
    if (!parsed.fixSuggestions || !Array.isArray(parsed.fixSuggestions)) {
      parsed.fixSuggestions = [];
    }

    return {
      overallScore: parsed.overallScore,
      hasErrors: parsed.hasErrors,
      recommendation: normalizedRecommendation,
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
      // New fields (with defaults applied above)
      categoryScores: parsed.categoryScores,
      filePriority: parsed.filePriority,
      fixSuggestions: parsed.fixSuggestions,
    };
  } catch (error) {
    console.error('❌ Failed to parse review from Gemini');
    console.error('   Error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('   Raw response (first 500 chars):', text.substring(0, 500));
    console.error('   Response length:', text.length);

    // Try to extract any useful information from the text
    const scoreMatch = text.match(/score[:\s]+(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 70;

    const hasApprove = /approve/i.test(text);
    const hasRevise = /revise/i.test(text);
    const hasRegenerate = /regenerate/i.test(text);

    const recommendation = hasRegenerate ? 'regenerate' : hasRevise ? 'revise' : 'approve';

    console.log(`   Extracted from text: score=${score}, recommendation=${recommendation}`);

    // Return a permissive default review with extracted info
    return {
      overallScore: score,
      hasErrors: false,
      recommendation: recommendation as 'approve' | 'revise' | 'regenerate',
      strengths: [],
      weaknesses: [`Review parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      securityConcerns: [],
      issues: [
        {
          severity: 'warning',
          file: 'unknown',
          message: 'Gemini returned non-JSON response. Using fallback parsing.',
        },
      ],
    };
  }
}
