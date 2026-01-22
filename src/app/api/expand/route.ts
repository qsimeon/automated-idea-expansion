import { NextResponse } from 'next/server';
import { runAgentPipeline } from '@/lib/agents/graph';
import { getPendingIdeas, getIdeaById } from '@/lib/db/queries';
import { supabaseAdmin } from '@/lib/db/supabase';
import { createLogger } from '@/lib/logging/logger';
import crypto from 'crypto';

// Temporarily use test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/expand
 *
 * Trigger the AI agent pipeline to expand an idea
 *
 * Body:
 * - ideaId (required): The idea to expand (user-selected)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ideaId } = body;

    // Validate required ideaId
    if (!ideaId) {
      return NextResponse.json(
        {
          success: false,
          error: 'ideaId is required',
        },
        { status: 400 }
      );
    }

    // Generate execution ID
    const executionId = crypto.randomUUID();
    const startTime = new Date();

    // Initialize logger with execution context
    const logger = createLogger({
      executionId,
      userId: TEST_USER_ID,
      ideaId,
      stage: 'api-endpoint',
    });

    logger.info('📥 Expand request received', {
      userId: TEST_USER_ID,
      ideaId,
      timestamp: startTime.toISOString(),
    });

    // Create execution record
    await supabaseAdmin.from('executions').insert({
      id: executionId,
      user_id: TEST_USER_ID,
      status: 'running',
      started_at: startTime.toISOString(),
    });

    // Get the specific idea
    const selectedIdea = await getIdeaById(ideaId, TEST_USER_ID);
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

    // Run the agent pipeline!
    logger.info('🚀 Starting agent pipeline', {
      ideaId: selectedIdea.id,
      ideaTitle: selectedIdea.title,
    });

    const result = await runAgentPipeline({
      userId: TEST_USER_ID,
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

    // Save execution results
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
          user_id: TEST_USER_ID,
          idea_id: result.selectedIdea.id,
          format: result.chosenFormat!,
          content: result.generatedContent,
          published: false, // Not published yet (would need publisher agents)
        })
        .select()
        .single();

      if (outputError) {
        logger.error('❌ Failed to save output', {
          error: outputError,
          outputData: {
            id: outputId,
            execution_id: executionId,
            user_id: TEST_USER_ID,
            idea_id: result.selectedIdea.id,
            format: result.chosenFormat,
          },
        });
      } else {
        logger.info('💾 Output saved', {
          outputId,
          format: result.chosenFormat,
          ideaId: result.selectedIdea.id,
        });
      }

      // Mark idea as expanded
      const { error: updateError } = await supabaseAdmin
        .from('ideas')
        .update({ status: 'expanded' })
        .eq('id', result.selectedIdea.id);

      if (updateError) {
        logger.error('❌ Failed to update idea status', { error: updateError });
      }
    }

    // Log pipeline completion with metrics
    logger.info('✅ Expansion complete', {
      status,
      selectedIdea: result.selectedIdea?.title,
      chosenFormat: result.chosenFormat,
      durationSeconds,
      durationMs: logger.getDuration(),
      outputId,
      hasErrors: hasErrors,
      errorCount: result.errors.length,
    });

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
      outputId, // Include outputId so frontend can link to it
      error: hasErrors ? result.errors.join('; ') : undefined,
    });
  } catch (error: any) {
    // Note: Logger may not be initialized if error occurs early
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
