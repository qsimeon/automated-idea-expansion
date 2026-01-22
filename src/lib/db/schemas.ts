import { z } from 'zod';

/**
 * ZOD SCHEMAS FOR DATABASE TYPES
 *
 * Philosophy: "Schemas all the way down"
 * - Every piece of data that goes in/out of models must have a Zod schema
 * - Database results should be validated with schemas
 * - No `any` types - everything is structured and validated
 */

// ============================================================
// IDEA SCHEMA
// ============================================================

export const IdeaSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  bullets: z.array(z.string()).default([]),
  status: z.enum(['pending', 'expanded', 'archived']),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Idea = z.infer<typeof IdeaSchema>;

/**
 * Minimal idea schema for creator functions
 * Only validates fields actually used by creators
 *
 * Philosophy: User enters raw unstructured text
 * The idea is just... the idea. No forced structure.
 */
export const IdeaCreatorSchema = z.object({
  id: z.string(),
  title: z.string(), // The raw idea text
}).passthrough(); // Allow other fields to pass through (description, etc.)

export type IdeaForCreator = z.infer<typeof IdeaCreatorSchema>;
