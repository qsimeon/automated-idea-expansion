import { NextResponse } from 'next/server';
import { getIdeasForUser, createIdea } from '@/lib/db/queries';
import type { CreateIdeaInput } from '@/lib/db/types';

// For now, we'll use a hardcoded test user UUID since Clerk is disabled
// TODO: Replace with actual Clerk user ID when auth is re-enabled
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/ideas
 * Get all ideas for the authenticated user
 */
export async function GET() {
  try {
    const ideas = await getIdeasForUser(TEST_USER_ID);

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
 */
export async function POST(request: Request) {
  try {
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

    const idea = await createIdea(TEST_USER_ID, input);

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
