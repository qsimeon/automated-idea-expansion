import { NextResponse } from 'next/server';
import { getIdeaById, updateIdea, deleteIdea } from '@/lib/db/queries';
import type { UpdateIdeaInput } from '@/lib/db/types';

// For now, we'll use a hardcoded test user UUID since Clerk is disabled
// TODO: Replace with actual Clerk user ID when auth is re-enabled
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * GET /api/ideas/[id]
 * Get a single idea by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idea = await getIdeaById(id, TEST_USER_ID);

    if (!idea) {
      return NextResponse.json(
        {
          success: false,
          error: 'Idea not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      idea,
    });
  } catch (error: any) {
    console.error(`GET /api/ideas/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch idea',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/ideas/[id]
 * Update an existing idea
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Build update input (only include provided fields)
    const input: UpdateIdeaInput = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Title must be a non-empty string',
          },
          { status: 400 }
        );
      }
      input.title = body.title.trim();
    }

    if (body.description !== undefined) {
      input.description = body.description?.trim() || null;
    }

    if (body.bullets !== undefined) {
      if (!Array.isArray(body.bullets)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Bullets must be an array',
          },
          { status: 400 }
        );
      }
      input.bullets = body.bullets.filter((b: any) => typeof b === 'string' && b.trim());
    }

    if (body.status !== undefined) {
      if (!['pending', 'expanded', 'archived'].includes(body.status)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Status must be one of: pending, expanded, archived',
          },
          { status: 400 }
        );
      }
      input.status = body.status;
    }

    const idea = await updateIdea(id, TEST_USER_ID, input);

    return NextResponse.json({
      success: true,
      idea,
    });
  } catch (error: any) {
    console.error(`PUT /api/ideas/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update idea',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ideas/[id]
 * Delete an idea
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteIdea(id, TEST_USER_ID);

    return NextResponse.json({
      success: true,
      message: 'Idea deleted successfully',
    });
  } catch (error: any) {
    console.error(`DELETE /api/ideas/[id] error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete idea',
      },
      { status: 500 }
    );
  }
}
