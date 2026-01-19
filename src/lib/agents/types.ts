import { Annotation } from '@langchain/langgraph';
import type { Idea } from '../db/types';

/**
 * Agent State - The shared "memory" that all agents read from and write to
 *
 * Think of this as a notebook that gets passed between agents:
 * - Judge reads ideas, writes selectedIdea
 * - Router reads selectedIdea, writes chosenFormat
 * - Creator reads both, writes generatedContent
 * - Publisher reads everything, writes publishedUrl
 */
export const AgentState = Annotation.Root({
  // ============================================================
  // INPUTS (Set at start)
  // ============================================================

  userId: Annotation<string>(),

  // All pending ideas to evaluate
  allIdeas: Annotation<Idea[]>,

  // For manual trigger: specific idea to expand
  specificIdeaId: Annotation<string | null>,

  // ============================================================
  // JUDGE AGENT OUTPUTS
  // ============================================================

  // The idea selected for expansion
  selectedIdea: Annotation<Idea | null>,

  // Why this idea was chosen (for transparency)
  judgeReasoning: Annotation<string>,

  // Score 0-100 (how good is this idea)
  judgeScore: Annotation<number>,

  // ============================================================
  // ROUTER AGENT OUTPUTS
  // ============================================================

  // Output format: blog_post | twitter_thread | github_repo | image
  chosenFormat: Annotation<'blog_post' | 'twitter_thread' | 'github_repo' | 'image' | null>,

  // Why this format was chosen
  formatReasoning: Annotation<string>,

  // ============================================================
  // CREATOR AGENT OUTPUTS
  // ============================================================

  // The generated content (structure varies by format)
  generatedContent: Annotation<any>,

  // ============================================================
  // PUBLISHER OUTPUTS
  // ============================================================

  // Where the content was published (URL)
  publishedUrl: Annotation<string | null>,

  // Platform-specific metadata
  publishMetadata: Annotation<any>,

  // ============================================================
  // TRACKING & ERRORS
  // ============================================================

  // Execution ID (for database logging)
  executionId: Annotation<string>(),

  // Any errors that occurred (agents append to this)
  errors: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Total tokens used (for cost tracking)
  tokensUsed: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
});

/**
 * Type helper for agent functions
 */
export type AgentStateType = typeof AgentState.State;

/**
 * Blog post structure
 */
export interface BlogPost {
  title: string;
  markdown: string;
  wordCount: number;
  readingTimeMinutes: number;
}

/**
 * Mastodon thread structure
 */
export interface MastodonThread {
  posts: Array<{
    order: number;
    text: string; // Max 500 chars
  }>;
  totalPosts: number;
}

/**
 * Code project structure
 */
export interface CodeProject {
  type: 'nodejs' | 'python'; // Extensible to other types
  repoName: string;
  description: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  readme: string;
}

/**
 * AI-generated image structure
 */
export interface AIImage {
  prompt: string;
  imageUrl: string;
  model: string; // Which model generated it (flux, sdxl, etc)
  width: number;
  height: number;
}
