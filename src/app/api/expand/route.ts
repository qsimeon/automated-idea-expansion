import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { runAgentPipeline } from '@/lib/agents/graph';
import { getIdeaById } from '@/lib/db/queries';
import { supabaseAdmin } from '@/lib/db/supabase';
import { createLogger } from '@/lib/logging/logger';
import { checkUsageLimit, consumeExpansion } from '@/lib/usage/check-usage';
import crypto from 'crypto';

/**
 * POST /api/expand
 *
 * Trigger the AI agent pipeline to expand an idea
 *
 * REQUIRES AUTHENTICATION
 * REQUIRES AVAILABLE CREDITS (5 free + any purchased)
 *
 * Body:
 * - ideaId (required): The idea to expand (user-selected)
 *
 * Returns:
 * - 401: Not authenticated
 * - 402: No credits remaining (payment required)
 * - 404: Idea not found
 * - 200: Expansion successful
 */
export async function POST(request: Request) {
  try {
    // 1. CHECK AUTHENTICATION
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
          message: 'You must be signed in to expand ideas',
        },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 2. PARSE REQUEST
    const body = await request.json();
    const { ideaId } = body;

    if (!ideaId) {
      return NextResponse.json(
        {
          success: false,
          error: 'ideaId is required',
        },
        { status: 400 }
      );
    }

    // 3. CHECK USAGE LIMIT (BEFORE running expensive pipeline!)
    const usageStatus = await checkUsageLimit(userId);

    if (!usageStatus.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'No credits remaining',
          message: usageStatus.reason,
          usage: {
            freeRemaining: usageStatus.freeRemaining,
            paidRemaining: usageStatus.paidRemaining,
            totalUsed: usageStatus.totalUsed,
          },
        },
        { status: 402 } // Payment Required
      );
    }

    // 4. SETUP EXECUTION
    const executionId = crypto.randomUUID();
    const startTime = new Date();

    const logger = createLogger({
      executionId,
      userId,
      ideaId,
      stage: 'api-endpoint',
    });

    logger.info('📥 Expand request received', {
      userId,
      email: session.user.email,
      ideaId,
      freeRemaining: usageStatus.freeRemaining,
      paidRemaining: usageStatus.paidRemaining,
      timestamp: startTime.toISOString(),
    });

    // Create execution record
    await supabaseAdmin.from('executions').insert({
      id: executionId,
      user_id: userId,
      status: 'running',
      started_at: startTime.toISOString(),
    });

    // 5. GET IDEA
    const selectedIdea = await getIdeaById(ideaId, userId);
    if (!selectedIdea) {
      return NextResponse.json(
        {
          success: false,
          error: `Idea not found: ${ideaId}`,
        },
        { status: 404 }
      );
    }

    logger.info('📊 Idea fetched', {
      ideaId: selectedIdea.id,
      title: selectedIdea.title,
      status: selectedIdea.status,
    });

    // 6. RUN AGENT PIPELINE
    logger.info('🚀 Starting agent pipeline', {
      ideaId: selectedIdea.id,
      ideaTitle: selectedIdea.title,
    });

    const result = await runAgentPipeline({
      userId,
      selectedIdea,
      executionId,
      logger,
    });

    // Calculate duration
    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - startTime.getTime()) / 1000
    );

    // Determine status
    const hasErrors = result.errors.length > 0;
    const hasContent = !!result.generatedContent;
    const status = hasErrors ? (hasContent ? 'partial' : 'failed') : 'completed';

    // 7. CONSUME CREDIT (only if pipeline succeeded)
    let creditType: 'free' | 'paid' | null = null;
    let updatedUsage = usageStatus;

    if (status === 'completed' && hasContent) {
      try {
        creditType = await consumeExpansion(userId);
        logger.info('💳 Credit consumed', {
          creditType,
          freeRemaining: usageStatus.freeRemaining - (creditType === 'free' ? 1 : 0),
          paidRemaining: usageStatus.paidRemaining - (creditType === 'paid' ? 1 : 0),
        });

        // Update usage status for response
        updatedUsage = {
          ...usageStatus,
          freeRemaining: usageStatus.freeRemaining - (creditType === 'free' ? 1 : 0),
          paidRemaining: usageStatus.paidRemaining - (creditType === 'paid' ? 1 : 0),
          totalUsed: usageStatus.totalUsed + 1,
          allowed: true,
        };
      } catch (error) {
        logger.error('❌ Failed to consume credit', { error });
        // Don't fail the whole request if credit consumption fails
        // Admin can manually adjust later
      }
    }

    // 8. SAVE RESULTS
    await supabaseAdmin
      .from('executions')
      .update({
        selected_idea_id: result.selectedIdea?.id || null,
        format_chosen: result.chosenFormat,
        format_reasoning: result.formatReasoning,
        status,
        error_message: result.errors.join('; ') || null,
        duration_seconds: durationSeconds,
        completed_at: endTime.toISOString(),
      })
      .eq('id', executionId);

    // If content was generated, save it
    let outputId: string | null = null;
    if (result.generatedContent && result.selectedIdea) {
      outputId = crypto.randomUUID();

      const { data: outputData, error: outputError } = await supabaseAdmin
        .from('outputs')
        .insert({
          id: outputId,
          execution_id: executionId,
          user_id: userId,
          idea_id: result.selectedIdea.id,
          format: result.chosenFormat!,
          content: result.generatedContent,
          published: false,
        })
        .select()
        .single();

      if (outputError) {
        logger.error('❌ Failed to save output', { error: outputError });
      } else {
        logger.info('💾 Output saved', {
          outputId,
          format: result.chosenFormat,
          ideaId: result.selectedIdea.id,
        });
      }

      // Mark idea as expanded
      await supabaseAdmin
        .from('ideas')
        .update({ status: 'expanded' })
        .eq('id', result.selectedIdea.id);
    }

    // 9. LOG COMPLETION
    logger.info('✅ Expansion complete', {
      status,
      selectedIdea: result.selectedIdea?.title,
      chosenFormat: result.chosenFormat,
      durationSeconds,
      outputId,
      creditType,
      creditsRemaining: updatedUsage.freeRemaining + updatedUsage.paidRemaining,
    });

    // 10. RETURN RESPONSE
    return NextResponse.json({
      success: status === 'completed' && !hasErrors,
      execution: {
        id: executionId,
        status,
        selectedIdea: result.selectedIdea
          ? {
              id: result.selectedIdea.id,
              title: result.selectedIdea.title,
            }
          : null,
        format: result.chosenFormat,
        durationSeconds,
        errors: result.errors,
      },
      content: result.generatedContent
        ? {
            format: result.chosenFormat,
            preview:
              result.chosenFormat === 'blog_post'
                ? result.generatedContent.title
                : result.chosenFormat === 'github_repo'
                ? result.generatedContent.repoName
                : 'Generated',
          }
        : null,
      outputId,
      usage: {
        creditUsed: creditType,
        freeRemaining: updatedUsage.freeRemaining,
        paidRemaining: updatedUsage.paidRemaining,
        totalRemaining: updatedUsage.freeRemaining + updatedUsage.paidRemaining,
        totalUsed: updatedUsage.totalUsed,
      },
      error: hasErrors ? result.errors.join('; ') : undefined,
    });
  } catch (error: any) {
    console.error('❌ Expansion failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to expand idea',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
