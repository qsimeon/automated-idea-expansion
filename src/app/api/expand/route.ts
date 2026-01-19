import { NextResponse } from 'next/server';
import { runAgentPipeline } from '@/lib/agents/graph';
import { getPendingIdeas, getIdeaById } from '@/lib/db/queries';
import { supabaseAdmin } from '@/lib/db/supabase';
import crypto from 'crypto';

// Temporarily use test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/expand
 *
 * Trigger the AI agent pipeline to expand an idea
 *
 * Body:
 * - ideaId (optional): Specific idea to expand. If not provided, judges all pending ideas.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ideaId } = body;

    console.log('📥 Expand request received');
    console.log(`   Specific idea: ${ideaId || 'None (will judge all)'}`);

    // Generate execution ID
    const executionId = crypto.randomUUID();
    const startTime = new Date();

    // Create execution record
    await supabaseAdmin.from('executions').insert({
      id: executionId,
      user_id: TEST_USER_ID,
      status: 'running',
      started_at: startTime.toISOString(),
    });

    // Get ideas
    let allIdeas;
    if (ideaId) {
      // Specific idea requested
      const idea = await getIdeaById(ideaId, TEST_USER_ID);
      if (!idea) {
        return NextResponse.json(
          {
            success: false,
            error: `Idea not found: ${ideaId}`,
          },
          { status: 404 }
        );
      }
      allIdeas = [idea];
    } else {
      // Get all pending ideas
      allIdeas = await getPendingIdeas(TEST_USER_ID);
    }

    if (allIdeas.length === 0) {
      // No ideas to expand
      await supabaseAdmin
        .from('executions')
        .update({
          status: 'completed',
          error_message: 'No pending ideas to expand',
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);

      return NextResponse.json({
        success: true,
        message: 'No pending ideas to expand',
        execution: { id: executionId, status: 'completed' },
      });
    }

    // Run the agent pipeline!
    console.log('🤖 Starting agent pipeline...');

    const result = await runAgentPipeline({
      userId: TEST_USER_ID,
      allIdeas,
      specificIdeaId: ideaId || null,
      executionId,
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
        judge_reasoning: result.judgeReasoning,
        judge_score: result.judgeScore,
        format_chosen: result.chosenFormat,
        format_reasoning: result.formatReasoning,
        status,
        error_message: result.errors.join('; ') || null,
        tokens_used: result.tokensUsed,
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
        console.error('❌ Failed to save output:', outputError);
        console.error('   Output data:', {
          id: outputId,
          execution_id: executionId,
          user_id: TEST_USER_ID,
          idea_id: result.selectedIdea.id,
          format: result.chosenFormat,
        });
      } else {
        console.log(`✅ Output saved: ${outputId}`);
      }

      // Mark idea as expanded
      const { error: updateError } = await supabaseAdmin
        .from('ideas')
        .update({ status: 'expanded' })
        .eq('id', result.selectedIdea.id);

      if (updateError) {
        console.error('❌ Failed to update idea status:', updateError);
      }
    }

    console.log(`✅ Expansion complete! Status: ${status}`);

    return NextResponse.json({
      success: true,
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
        judgeScore: result.judgeScore,
        tokensUsed: result.tokensUsed,
        durationSeconds,
        errors: result.errors,
      },
      content: result.generatedContent
        ? {
            format: result.chosenFormat,
            preview:
              result.chosenFormat === 'blog_post'
                ? result.generatedContent.title
                : result.chosenFormat === 'twitter_thread'
                ? `${result.generatedContent.totalPosts} posts`
                : result.chosenFormat === 'github_repo'
                ? result.generatedContent.repoName
                : result.chosenFormat === 'image'
                ? result.generatedContent.prompt
                : 'Generated',
          }
        : null,
      outputId, // Include outputId so frontend can link to it
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
