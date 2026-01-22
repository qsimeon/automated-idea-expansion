import { ChatAnthropic } from '@langchain/anthropic';
import type { CodePlan, GeneratedCode, CodeReview, CodeFile } from './types';

/**
 * FIXER AGENT
 *
 * Purpose: Regenerate specific files based on critic feedback (not all files)
 *
 * This agent acts like a developer responding to code review comments.
 * Instead of regenerating the entire project, it:
 * - Identifies which files need fixes (from fixSuggestions + filePriority)
 * - Regenerates only those specific files with targeted instructions
 * - Preserves files that are already working well
 * - Uses detailed fix suggestions from the critic
 *
 * Why targeted fixing vs full regeneration?
 * - **Cost-effective**: Only regenerate 1-3 files instead of entire project
 * - **Preserves good code**: Don't throw away working files
 * - **Faster**: Less generation time, smaller context
 * - **More focused**: Specific fix instructions lead to better results
 *
 * Model choice: Claude Sonnet 3.5
 * - BEST at code generation and fixing
 * - Same model as generation for consistency
 * - Superior at understanding and fixing complex code
 * - Excellent at following specific fix instructions
 */

export async function fixCode(
  currentCode: GeneratedCode,
  review: CodeReview,
  plan: CodePlan
): Promise<{ code: GeneratedCode;  filesFixed: string[] }> {
  console.log(`🔧 Fixing code based on ${review.fixSuggestions?.length || 0} suggestions...`);

  // Identify files to fix (prioritize critical issues)
  const filesToFix = identifyFilesToFix(review, plan);
  console.log(`   Files to fix: ${filesToFix.join(', ') || 'none - will use critical files'}`);

  if (filesToFix.length === 0) {
    // Fallback: regenerate critical files if no specific suggestions
    const criticalFiles = plan.criticalFiles || [];
    filesToFix.push(...criticalFiles.slice(0, 2)); // Max 2 files
  }

  if (filesToFix.length === 0) {
    console.log(`   ⚠️  No files identified for fixing, returning original code`);
    return {
      code: currentCode,
      
      filesFixed: [],
    };
  }

  const fixedFiles: CodeFile[] = [];

  // Fix each file individually
  for (const filePath of filesToFix.slice(0, 3)) {
    // Limit to 3 files per iteration
    const originalFile = currentCode.files.find((f) => f.path === filePath);
    if (!originalFile) {
      console.log(`   ⚠️  File ${filePath} not found, skipping`);
      continue;
    }

    const fileFeedback = review.fixSuggestions?.filter((f) => f.file === filePath) || [];
    const result = await fixSingleFile(originalFile, fileFeedback, plan, currentCode);

    fixedFiles.push(result.file);
    console.log(`   ✅ Fixed ${filePath}`);
  }

  // Merge fixed files with unchanged files
  const updatedFiles = currentCode.files.map((file) => {
    const fixed = fixedFiles.find((f) => f.path === file.path);
    return fixed || file; // Use fixed version if available, else keep original
  });

  return {
    code: { ...currentCode, files: updatedFiles },
    filesFixed: filesToFix.slice(0, 3),
  };
}

/**
 * Identify which files need fixing based on review feedback
 *
 * Priority:
 * 1. Files with critical issues
 * 2. High-priority files
 * 3. Files with important issues
 */
function identifyFilesToFix(review: CodeReview, plan: CodePlan): string[] {
  const files = new Set<string>();

  // Priority 1: Critical issues
  review.fixSuggestions
    ?.filter((s) => s.priority === 'critical')
    .forEach((s) => files.add(s.file));

  // Priority 2: High-priority files
  review.filePriority
    ?.filter((p) => p.priority === 'high')
    .forEach((p) => files.add(p.file));

  // Priority 3: Important issues (if not too many files yet)
  if (files.size < 2) {
    review.fixSuggestions
      ?.filter((s) => s.priority === 'important')
      .slice(0, 2)
      .forEach((s) => files.add(s.file));
  }

  return Array.from(files).slice(0, 3); // Max 3 files
}

/**
 * Fix a single file based on critic feedback
 *
 * Uses GPT-4o to regenerate the file with specific fix instructions
 */
async function fixSingleFile(
  originalFile: CodeFile,
  feedback: CodeReview['fixSuggestions'],
  plan: CodePlan,
  fullCode: GeneratedCode
): Promise<{ file: CodeFile }> {
  // Use Claude Sonnet 4.5 for best code fixing
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3, // Lower temp for focused, reliable fixes
  });

  const feedbackText =
    feedback && feedback.length > 0
      ? feedback.map((f) => `- ${f.issue}\n  Fix: ${f.suggestedFix}`).join('\n\n')
      : 'General quality improvements needed';

  const qualityContext = plan.qualityRubric
    ? `
QUALITY CRITERIA TO MEET:
${plan.qualityRubric.correctness.criteria.join('\n')}
${plan.qualityRubric.security.criteria.join('\n')}
${plan.qualityRubric.codeQuality.criteria.join('\n')}
${plan.qualityRubric.completeness.criteria.join('\n')}
`
    : '';

  const prompt = `Fix this code file based on review feedback.

ORIGINAL FILE (${originalFile.path}):
\`\`\`${originalFile.language || plan.language}
${originalFile.content}
\`\`\`

ISSUES TO FIX:
${feedbackText}

${qualityContext}

INSTRUCTIONS:
1. Fix ONLY the specific issues mentioned above
2. Preserve working code that doesn't need changes
3. Maintain the same coding style and structure
4. Don't add unnecessary features or refactoring
5. Ensure the fixed code meets the quality criteria

Return the COMPLETE fixed file as JSON (no markdown, just JSON):
{
  "content": "fixed file content here"
}`;

  try {
    const response = await model.invoke(prompt);
    const content = response.content.toString();

    // Parse JSON response
    let parsed;
    try {
      // Remove markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
      }

      // Extract JSON object
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error(`   ❌ Failed to parse fix for ${originalFile.path}, using original`);
      return { file: originalFile }; // Return original if parsing fails
    }

    return {
      file: {
        path: originalFile.path,
        content: parsed.content,
        language: originalFile.language,
      },
    };
  } catch (error) {
    console.error(`   ❌ Failed to fix ${originalFile.path}:`, error);
    return { file: originalFile }; // Return original on error
  }
}
