import { planCodeProject } from './planning-agent';
import { generateCode } from './generation-agent';
import { reviewCode } from './critic-agent';
import { fixCode } from './fixer-agent';
import type { GeneratedCode, CodeCreationState } from './types';

/**
 * MULTI-STAGE CODE CREATOR (V2)
 *
 * This is the orchestrator that coordinates the multi-stage code creation process.
 *
 * Pipeline:
 * 1. **Planning Agent** - Decides what to build and how
 * 2. **Generation Agent** - Creates the actual code
 * 3. **Critic Agent** - Reviews the code for quality
 * 4. **(Future) Fixer Agent** - Auto-fixes issues if found
 *
 * Why this architecture?
 * - **Separation of concerns**: Each agent has one job
 * - **Better quality**: Planning before coding, review after
 * - **Cost-effective**: Use cheap models (Gemini) for review
 * - **Extensible**: Easy to add more stages (fixer, optimizer, etc.)
 *
 * Current vs Future:
 * - **Current**: Linear pipeline (planning → generation → review → done)
 * - **Future**: Can add loops (review → fix → review again)
 * - **Future**: Can add conditional routing (simple ideas skip review)
 * - **Future**: Can run multiple generators in parallel (A/B testing)
 *
 * This simple version doesn't use LangGraph sub-graphs yet,
 * but we can upgrade to that if we need more complex orchestration.
 */

export async function createCodeProjectV2(idea: {
  id: string;
  title: string;
  description: string | null;
}): Promise<{
  content: any; // Will be transformed to match existing format
  tokensUsed: number;
}> {
  console.log('\n🚀 === MULTI-STAGE CODE CREATOR V2 ===');
  console.log(`   Idea: "${idea.title}"\n`);

  let totalTokens = 0;
  const state: CodeCreationState = {
    idea,
    plan: null,
    code: null,
    review: null,
    attempts: 0,
    maxAttempts: 2, // Allow up to 2 fix attempts in future
    errors: [],
  };

  try {
    // STAGE 1: PLANNING
    console.log('📋 STAGE 1: Planning');
    console.log('   Agent: Planning Agent');
    console.log('   Task: Decide output type, language, architecture\n');

    const planResult = await planCodeProject(idea);
    state.plan = planResult.plan;
    totalTokens += planResult.tokensUsed;

    console.log(`   ✅ Plan complete: ${state.plan.outputType} in ${state.plan.language}`);
    console.log(`   💰 Tokens used: ${planResult.tokensUsed}\n`);

    // STAGE 2: GENERATION
    console.log('🛠️  STAGE 2: Code Generation');
    console.log('   Agent: Generation Agent');
    console.log('   Task: Create code files based on plan\n');

    const codeResult = await generateCode(state.plan, idea);
    state.code = codeResult.code;
    totalTokens += codeResult.tokensUsed;

    console.log(`   ✅ Generated ${state.code.files.length} files`);
    console.log(`   📁 Files: ${state.code.files.map((f) => f.path).join(', ')}`);
    console.log(`   💰 Tokens used: ${codeResult.tokensUsed}\n`);

    // STAGE 3: CODE REVIEW
    console.log('🔍 STAGE 3: Code Review');
    console.log('   Agent: Critic Agent');
    console.log('   Task: Review for quality, security, correctness\n');

    const reviewResult = await reviewCode(state.code, state.plan);
    state.review = reviewResult.review;
    totalTokens += reviewResult.tokensUsed;

    console.log(`   📊 Quality Score: ${state.review.overallScore}/100`);
    console.log(`   🐛 Issues: ${state.review.issues.length}`);
    console.log(`   ✅ Recommendation: ${state.review.recommendation}`);
    console.log(`   💰 Tokens used: ${reviewResult.tokensUsed}\n`);

    // Log detailed review results
    if (state.review.issues.length > 0) {
      console.log('   Issues found:');
      state.review.issues.forEach((issue) => {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
        console.log(`   ${icon} [${issue.file}] ${issue.message}`);
      });
      console.log('');
    }

    if (state.review.securityConcerns.length > 0) {
      console.log('   🔒 Security concerns:');
      state.review.securityConcerns.forEach((concern) => {
        console.log(`      - ${concern}`);
      });
      console.log('');
    }

    // STAGE 4: QUALITY GATE & ITERATION LOOP
    const QUALITY_THRESHOLD = 75; // Minimum acceptable score
    const POOR_QUALITY_THRESHOLD = 60; // Below this triggers regeneration
    const MAX_ITERATIONS = 5; // Hard limit

    while (state.attempts < MAX_ITERATIONS) {
      // Quality gate: Check if code meets threshold
      if (
        state.review.overallScore >= QUALITY_THRESHOLD &&
        state.review.recommendation === 'approve'
      ) {
        console.log(`✅ Code quality acceptable (${state.review.overallScore}/100)\n`);
        break;
      }

      // Decide: Regenerate all vs fix specific files
      let shouldRegenerate = false;
      if (state.review.overallScore < POOR_QUALITY_THRESHOLD && state.attempts < 2) {
        shouldRegenerate = true;
        console.log(`🔄 Score too low (${state.review.overallScore}), will regenerate all\n`);
      } else if (state.review.recommendation === 'regenerate' && state.attempts < 2) {
        shouldRegenerate = true;
        console.log(`🔄 Critic recommends full regeneration\n`);
      }

      state.attempts++;

      if (shouldRegenerate) {
        // Full regeneration
        console.log(`🛠️  STAGE 4a: Full Regeneration (Attempt ${state.attempts}/${MAX_ITERATIONS})`);

        const regenResult = await generateCode(state.plan!, idea);
        state.code = regenResult.code;
        totalTokens += regenResult.tokensUsed;

        console.log(`   ✅ Regenerated ${state.code.files.length} files`);
        console.log(`   💰 Tokens: ${regenResult.tokensUsed}\n`);
      } else {
        // Targeted fixes
        console.log(`🔧 STAGE 4b: Targeted Fixes (Attempt ${state.attempts}/${MAX_ITERATIONS})`);

        const fixResult = await fixCode(state.code!, state.review, state.plan!);
        state.code = fixResult.code;
        totalTokens += fixResult.tokensUsed;

        console.log(`   ✅ Fixed files: ${fixResult.filesFixed.join(', ')}`);
        console.log(`   💰 Tokens: ${fixResult.tokensUsed}\n`);
      }

      // Re-review after changes
      console.log(`🔍 STAGE 5: Re-review (Attempt ${state.attempts}/${MAX_ITERATIONS})`);

      const prevScore = state.review.overallScore;
      const reReviewResult = await reviewCode(state.code!, state.plan!);
      state.review = reReviewResult.review;
      totalTokens += reReviewResult.tokensUsed;

      const scoreDiff = state.review.overallScore - prevScore;
      console.log(
        `   📊 Score: ${state.review.overallScore}/100 (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`
      );
      console.log(`   🐛 Issues: ${state.review.issues.length}`);
      console.log(`   💰 Tokens: ${reReviewResult.tokensUsed}\n`);

      // Check for score decline (fixes made it worse)
      if (scoreDiff < -10) {
        console.log(`   ⚠️  Score declined significantly, stopping iterations\n`);
        break;
      }
    }

    // Final quality check
    if (state.attempts >= MAX_ITERATIONS) {
      console.log(`⚠️  Reached max iterations (${MAX_ITERATIONS})`);
      if (state.review.overallScore < QUALITY_THRESHOLD) {
        console.log(`   ⚠️  Final score (${state.review.overallScore}) below threshold\n`);
        state.errors.push(`Code quality below threshold: ${state.review.overallScore}/100`);
      }
    }

    console.log(`\n📊 === ITERATION SUMMARY ===`);
    console.log(`   Attempts: ${state.attempts}`);
    console.log(`   Final Score: ${state.review.overallScore}/100`);
    console.log(`   Total Tokens: ${totalTokens}`);
    console.log(`   Estimated Cost: $${((totalTokens / 1000000) * 3).toFixed(4)}`); // Rough estimate
    console.log('');

    // FINAL: Transform to expected format
    console.log('✅ === PIPELINE COMPLETE ===');
    console.log(`   Total tokens used: ${totalTokens}`);
    console.log(`   Estimated cost: $${((totalTokens / 1_000_000) * 0.15).toFixed(4)}\n`);

    // Transform to match the existing code-creator.ts format
    // This ensures compatibility with the existing system
    return {
      content: {
        repoName: state.code!.repoName,
        description: state.code!.description,
        type: state.code!.type,
        files: state.code!.files,
        setupInstructions: state.code!.setupInstructions,
        runInstructions: state.code!.runInstructions,
        // Add review metadata (useful for debugging/monitoring)
        _reviewScore: state.review.overallScore,
        _reviewIssues: state.review.issues.length,
        _reviewRecommendation: state.review.recommendation,
      },
      tokensUsed: totalTokens,
    };
  } catch (error) {
    console.error('\n❌ === PIPELINE FAILED ===');
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);

    throw new Error(
      `Multi-stage code creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
