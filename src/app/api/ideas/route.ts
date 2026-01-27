import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getIdeasForUser, createIdea } from '@/lib/db/queries';
import { ideaSummarizer } from '@/lib/agents/idea-summarizer';
import type { CreateIdeaInput } from '@/lib/db/types';

/**
 * GET /api/ideas
 * Get all ideas for the authenticated user
 *
 * REQUIRES AUTHENTICATION
 */
export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const ideas = await getIdeasForUser(session.user.id);

    return NextResponse.json({
      success: true,
      ideas,
      count: ideas.length,
    });
  } catch (error: any) {
    console.error('GET /api/ideas error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch ideas',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ideas
 * Create a new idea
 *
 * REQUIRES AUTHENTICATION
 */
export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required field: content (the raw idea)
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Content is required - paste your idea here!',
        },
        { status: 400 }
      );
    }

    // Build input (content is required, everything else is optional)
    const input: CreateIdeaInput = {
      content: body.content.trim(),
      title: body.title?.trim() || undefined,
      description: body.description?.trim() || undefined,
      bullets: Array.isArray(body.bullets) ? body.bullets.filter((b: any) => typeof b === 'string' && b.trim()) : undefined,
    };

    // Generate AI summary (1-sentence title) for the idea
    // This becomes the bold card title, with description as the body
    let summary: string | undefined;
    try {
      console.log('🤖 Generating idea summary...');
      const summaryResult = await ideaSummarizer(input.content);
      summary = summaryResult.summary;
      console.log('✅ Summary generated:', summary);
    } catch (summarizerError) {
      console.warn('⚠️  Failed to generate summary, creating idea without it:', {
        error: summarizerError instanceof Error ? summarizerError.message : String(summarizerError),
      });
      // Continue without summary - it's optional
    }

    const idea = await createIdea(session.user.id, input, summary);

    return NextResponse.json(
      {
        success: true,
        idea,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/ideas error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create idea',
      },
      { status: 500 }
    );
  }
}
