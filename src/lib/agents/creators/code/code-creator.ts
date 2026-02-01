import { planCodeProject } from './planning-agent';
import { generateCode } from './generation-agent';
import { reviewCode } from './critic-agent';
import { fixCode } from './fixer-agent';
import type { GeneratedCode, CodeCreationState } from './types';
import { createLogger } from '@/lib/logging/logger';

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
 * - **Cost-effective**: Use cheap models (GPT-4o-mini) for review
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

export async function createCodeProject(idea: {
  id: string;
  title: string;
  description: string | null;
}): Promise<{
  content: any; // Will be transformed to match existing format

}> {
  const logger = createLogger({
    ideaId: idea.id,
    stage: 'code-creator',
  });

  logger.info('Code creator started', {
    ideaTitle: idea.title,
  });

  const state: CodeCreationState = {
    idea,
    plan: null,
    code: null,
    review: null,
    attempts: 0,
    maxAttempts: 3, // Allow up to 3 fix attempts
    errors: [],
  };

  try {
    // STAGE 1: PLANNING
    logger.info('STAGE 1: Planning started', {
      agent: 'Planning Agent',
      task: 'Decide output type, language, architecture',
    });

    const planResult = await planCodeProject(idea);
    state.plan = planResult.plan;

    logger.info('STAGE 1: Planning complete', {
      outputType: state.plan.outputType,
      language: state.plan.language,
    });

    // STAGE 2: GENERATION
    logger.info('STAGE 2: Code generation started', {
      agent: 'Generation Agent',
      task: 'Create code files based on plan',
    });

    const codeResult = await generateCode(state.plan, idea);
    state.code = codeResult.code;

    logger.info('STAGE 2: Code generation complete', {
      filesGenerated: state.code.files.length,
      files: state.code.files.map((f) => f.path),
    });

    // STAGE 3: CODE REVIEW
    logger.info('STAGE 3: Code review started', {
      agent: 'Critic Agent',
      task: 'Review for quality, security, correctness',
    });

    const reviewResult = await reviewCode(state.code, state.plan);
    state.review = reviewResult.review;

    logger.info('STAGE 3: Code review complete', {
      overallScore: state.review.overallScore,
      categoryScores: state.review.categoryScores,
      issuesCount: state.review.issues.length,
      recommendation: state.review.recommendation,
    });

    // Log detailed review results
    if (state.review.issues.length > 0) {
      logger.info('Issues found in code review', {
        issues: state.review.issues.map((issue) => ({
          severity: issue.severity,
          file: issue.file,
          message: issue.message,
        })),
      });
    }

    if (state.review.securityConcerns.length > 0) {
      logger.warn('Security concerns identified', {
        securityConcerns: state.review.securityConcerns,
      });
    }

    // STAGE 4: QUALITY GATE & ITERATION LOOP
    const QUALITY_THRESHOLD = 75; // Minimum acceptable score
    const POOR_QUALITY_THRESHOLD = 60; // Below this triggers regeneration
    const MAX_ITERATIONS = 3; // Hard limit

    while (state.attempts < MAX_ITERATIONS) {
      // Quality gate: Check if code meets threshold
      if (
        state.review.overallScore >= QUALITY_THRESHOLD &&
        state.review.recommendation === 'approve'
      ) {
        logger.info('Code quality acceptable', {
          overallScore: state.review.overallScore,
        });
        break;
      }

      // Decide: Regenerate all vs fix specific files
      let shouldRegenerate = false;
      if (state.review.overallScore < POOR_QUALITY_THRESHOLD && state.attempts < 2) {
        shouldRegenerate = true;
        logger.info('Score too low, will regenerate all', {
          currentScore: state.review.overallScore,
          threshold: POOR_QUALITY_THRESHOLD,
        });
      } else if (state.review.recommendation === 'regenerate' && state.attempts < 2) {
        shouldRegenerate = true;
        logger.info('Critic recommends full regeneration');
      }

      state.attempts++;

      if (shouldRegenerate) {
        // Full regeneration
        logger.info('STAGE 4a: Full regeneration started', {
          attempt: state.attempts,
          maxAttempts: MAX_ITERATIONS,
        });

        const regenResult = await generateCode(state.plan!, idea);
        state.code = regenResult.code;

        logger.info('Full regeneration complete', {
          filesRegenerated: state.code.files.length,
        });
      } else {
        // Targeted fixes
        logger.info('STAGE 4b: Targeted fixes started', {
          attempt: state.attempts,
          maxAttempts: MAX_ITERATIONS,
        });

        const fixResult = await fixCode(state.code!, state.review, state.plan!);
        state.code = fixResult.code;

        logger.info('Targeted fixes complete', {
          filesFixed: fixResult.filesFixed,
        });
      }

      // Re-review after changes
      logger.info('STAGE 5: Re-review started', {
        attempt: state.attempts,
        maxAttempts: MAX_ITERATIONS,
      });

      const prevScore = state.review.overallScore;
      const reReviewResult = await reviewCode(state.code!, state.plan!);
      state.review = reReviewResult.review;

      const scoreDiff = state.review.overallScore - prevScore;
      logger.info('Re-review complete', {
        currentScore: state.review.overallScore,
        previousScore: prevScore,
        scoreDiff,
        issuesCount: state.review.issues.length,
      });

      // Check for score decline (fixes made it worse)
      if (scoreDiff < -10) {
        logger.warn('Score declined significantly, stopping iterations', {
          scoreDiff,
        });
        break;
      }
    }

    // Final quality check
    if (state.attempts >= MAX_ITERATIONS) {
      logger.warn('Reached max iterations', {
        maxAttempts: MAX_ITERATIONS,
      });
      if (state.review.overallScore < QUALITY_THRESHOLD) {
        logger.warn('Final score below threshold', {
          finalScore: state.review.overallScore,
          threshold: QUALITY_THRESHOLD,
        });
        state.errors.push(`Code quality below threshold: ${state.review.overallScore}/100`);
      }
    }

    logger.info('Iteration summary', {
      attempts: state.attempts,
      finalScore: state.review.overallScore,
    });

    // FINAL: Transform to expected format
    logger.info('Pipeline complete');

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
    };
  } catch (error) {
    logger.error('Pipeline failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new Error(
      `Multi-stage code creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
