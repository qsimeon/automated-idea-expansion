import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getIdeaById, updateIdea, deleteIdea } from '@/lib/db/queries';
import type { UpdateIdeaInput } from '@/lib/db/types';

/**
 * GET /api/ideas/[id]
 * Get a single idea by ID
 *
 * REQUIRES AUTHENTICATION
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const idea = await getIdeaById(id, session.user.id);

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
 *
 * REQUIRES AUTHENTICATION
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const idea = await updateIdea(id, session.user.id, input);

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
 *
 * REQUIRES AUTHENTICATION
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    await deleteIdea(id, session.user.id);

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
