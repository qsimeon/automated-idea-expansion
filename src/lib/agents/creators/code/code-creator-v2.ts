import { planCodeProject } from './planning-agent';
import { generateCode } from './generation-agent';
import { reviewCode } from './critic-agent';
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
    console.log('   Agent: Planning Agent (GPT-4o-mini)');
    console.log('   Task: Decide output type, language, architecture\n');

    const planResult = await planCodeProject(idea);
    state.plan = planResult.plan;
    totalTokens += planResult.tokensUsed;

    console.log(`   ✅ Plan complete: ${state.plan.outputType} in ${state.plan.language}`);
    console.log(`   💰 Tokens used: ${planResult.tokensUsed}\n`);

    // STAGE 2: GENERATION
    console.log('🛠️  STAGE 2: Code Generation');
    console.log('   Agent: Generation Agent (GPT-4o-mini)');
    console.log('   Task: Create code files based on plan\n');

    const codeResult = await generateCode(state.plan, idea);
    state.code = codeResult.code;
    totalTokens += codeResult.tokensUsed;

    console.log(`   ✅ Generated ${state.code.files.length} files`);
    console.log(`   📁 Files: ${state.code.files.map((f) => f.path).join(', ')}`);
    console.log(`   💰 Tokens used: ${codeResult.tokensUsed}\n`);

    // STAGE 3: CODE REVIEW
    console.log('🔍 STAGE 3: Code Review');
    console.log('   Agent: Critic Agent (Gemini Flash 2.0)');
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

    // STAGE 4: DECISION (Future: Add fixer loop here)
    /*
     * Future enhancement:
     * if (state.review.recommendation === 'revise' && state.attempts < state.maxAttempts) {
     *   console.log('🔧 STAGE 4: Auto-Fix');
     *   // Run fixer agent to address issues
     *   // Re-run review
     *   // Loop back if needed
     * }
     */

    // For now, we accept the code regardless of review
    // (Most AI-generated code has minor issues but is still functional)

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
