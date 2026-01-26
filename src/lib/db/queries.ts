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
  input: CreateIdeaInput
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
      description,
      bullets: input.bullets || [],
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

/**
 * Get pending ideas for a user (for agent processing)
 */
export async function getPendingIdeas(userId: string): Promise<Idea[]> {
  const { data, error } = await supabaseAdmin
    .from('ideas')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending ideas:', error);
    throw new Error(`Failed to fetch pending ideas: ${error.message}`);
  }

  return data || [];
}

// ============================================================
// CREDENTIALS QUERIES
// ============================================================

/**
 * Get all credentials for a user (returns encrypted values)
 */
export async function getCredentials(userId: string): Promise<Credential[]> {
  const { data, error } = await supabaseAdmin
    .from('credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching credentials:', error);
    throw new Error(`Failed to fetch credentials: ${error.message}`);
  }

  return data || [];
}

/**
 * Save or update a credential (encrypts before storing)
 */
export async function saveCredential(
  userId: string,
  provider: 'openai' | 'anthropic' | 'github' | 'twitter' | 'replicate',
  apiKey: string
): Promise<Credential> {
  // Encrypt the API key before storing
  const encryptedValue = encryptToJSON(apiKey);

  const { data, error } = await supabaseAdmin
    .from('credentials')
    .upsert(
      {
        user_id: userId,
        provider,
        encrypted_value: encryptedValue,
        is_active: true,
        validation_status: 'not_checked',
      },
      {
        onConflict: 'user_id,provider', // Update if exists
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error saving credential:', error);
    throw new Error(`Failed to save credential: ${error.message}`);
  }

  return data;
}

/**
 * Get a single decrypted credential value
 */
export async function getDecryptedCredential(
  userId: string,
  provider: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('credentials')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error fetching credential:', error);
    throw new Error(`Failed to fetch credential: ${error.message}`);
  }

  // Decrypt and return the API key
  return decryptFromJSON(data.encrypted_value);
}

/**
 * Get all decrypted credentials for a user
 */
export async function getDecryptedCredentials(
  userId: string
): Promise<Record<string, string>> {
  const credentials = await getCredentials(userId);

  const decrypted: Record<string, string> = {};

  for (const cred of credentials) {
    const credential = cred as Credential;
    if (credential.is_active && credential.encrypted_value) {
      try {
        decrypted[credential.provider] = decryptFromJSON(credential.encrypted_value);
      } catch (error) {
        console.error(`Failed to decrypt ${credential.provider} credential:`, error);
      }
    }
  }

  return decrypted;
}

/**
 * Update credential validation status
 */
export async function updateCredentialValidation(
  userId: string,
  provider: string,
  isValid: boolean
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('credentials')
    .update({
      validation_status: isValid ? 'valid' : 'invalid',
    })
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    console.error('Error updating credential validation:', error);
    throw new Error(`Failed to update credential validation: ${error.message}`);
  }
}

/**
 * Delete a credential
 */
export async function deleteCredential(
  userId: string,
  provider: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('credentials')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    console.error('Error deleting credential:', error);
    throw new Error(`Failed to delete credential: ${error.message}`);
  }
}
