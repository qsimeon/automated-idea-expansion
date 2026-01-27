import { supabaseAdmin } from './supabase';
import type { Idea, CreateIdeaInput, UpdateIdeaInput, Credential } from './types';
import { encryptToJSON, decryptFromJSON } from '../crypto/encryption';

// ============================================================
// IDEAS QUERIES
// ============================================================

/**
 * Get all ideas for a specific user (with output information if expanded)
 */
export async function getIdeasForUser(userId: string): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from('ideas')
    .select(`
      *,
      outputs (
        id,
        format,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ideas:', error);
    throw new Error(`Failed to fetch ideas: ${error.message}`);
  }

  // Transform the data to include output_id at the top level
  const ideas = (data || []).map((idea: any) => {
    const output = idea.outputs && idea.outputs.length > 0 ? idea.outputs[0] : null;
    return {
      ...idea,
      output_id: output?.id || null,
      output_format: output?.format || null,
      output_created_at: output?.created_at || null,
      outputs: undefined, // Remove nested outputs array
    };
  });

  return ideas;
}

/**
 * Get a single idea by ID
 */
export async function getIdeaById(ideaId: string, userId: string): Promise<Idea | null> {
  const { data, error } = await supabaseAdmin
    .from('ideas')
    .select('*')
    .eq('id', ideaId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error fetching idea:', error);
    throw new Error(`Failed to fetch idea: ${error.message}`);
  }

  return data;
}

/**
 * Create a new idea
 */
export async function createIdea(
  userId: string,
  input: CreateIdeaInput,
  summary?: string
): Promise<Idea> {
  // If title not provided, use the content (truncated if too long)
  const title = input.title || (input.content.length > 100
    ? input.content.substring(0, 100) + '...'
    : input.content);

  // If description not provided, use full content (if different from title)
  const description = input.description || (input.content.length > 100 ? input.content : null);

  const { data, error } = await supabaseAdmin
    .from('ideas')
    .insert({
      user_id: userId,
      title,
      summary: summary || null, // AI-generated summary (optional)
      description,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating idea:', error);
    throw new Error(`Failed to create idea: ${error.message}`);
  }

  return data;
}

/**
 * Update an existing idea
 */
export async function updateIdea(
  ideaId: string,
  userId: string,
  input: UpdateIdeaInput
): Promise<Idea> {
  const { data, error } = await supabaseAdmin
    .from('ideas')
    .update(input)
    .eq('id', ideaId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating idea:', error);
    throw new Error(`Failed to update idea: ${error.message}`);
  }

  return data;
}

/**
 * Delete an idea
 */
export async function deleteIdea(ideaId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('ideas')
    .delete()
    .eq('id', ideaId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting idea:', error);
    throw new Error(`Failed to delete idea: ${error.message}`);
  }
}

// ============================================================
// CONFIG QUERIES (Database metadata)
// ============================================================

/**
 * Get the current database version
 * Used to invalidate stale JWT tokens after database resets
 */
export async function getDatabaseVersion(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('config')
    .select('value')
    .eq('key', 'database_version')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Config table not found or database_version not set, return 1 as default
      console.warn('⚠️ database_version not found in config, defaulting to 1');
      return 1;
    }
    console.error('Error fetching database version:', error);
    throw new Error(`Failed to fetch database version: ${error.message}`);
  }

  return parseInt(data?.value || '1', 10);
}

// ============================================================
// IDEAS QUERIES (continued)
// ============================================================

/**
 * Get pending ideas for a user (for agent processing)
 */
