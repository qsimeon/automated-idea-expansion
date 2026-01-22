import { Annotation } from '@langchain/langgraph';
import type { Idea } from '../db/types';
import type { IdeaForCreator } from '../db/schemas';
import type { Logger } from '../logging/logger';

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

  // Output format: blog_post | twitter_thread | github_repo
  // Note: Images are now components of blogs/threads, not standalone formats
  chosenFormat: Annotation<'blog_post' | 'twitter_thread' | 'github_repo' | null>,

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

  // Logger instance for consistent logging across all agents
  logger: Annotation<Logger | undefined>(),

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

// ===== ENHANCED CONTENT PIPELINE SCHEMAS =====

/**
 * IMAGE SCHEMAS
 * Images are now subcomponents of blogs/threads, not standalone formats
 */

export interface ImageSpec {
  placement: 'hero' | 'inline' | 'end' | string; // Where to place image
  concept: string; // What to visualize
  style?: string; // Art style (optional)
  aspectRatio?: '16:9' | '1:1' | '4:3'; // Default: 16:9
}

export interface GeneratedImage {
  imageUrl: string; // URL or data URL
  caption: string; // Image caption/alt text
  prompt: string; // Prompt used to generate
  placement: string; // Where it goes in content
  model: string; // Which model generated it
  width: number;
  height: number;
}

/**
 * BLOG SCHEMAS
 * Multi-stage pipeline: Plan → Generate → Review
 */

export interface BlogPlan {
  title: string;
  sections: string[]; // ["Introduction", "Core Concepts", ...]
  tone: string; // "educational", "casual", "technical"
  targetWordCount: number; // 1000-2000
  includeImages: boolean;
  imageSpecs: ImageSpec[]; // Where and what images to generate
  qualityRubric: BlogQualityRubric;
}

export interface BlogDraft {
  title: string;
  markdown: string; // Full markdown content
  images: GeneratedImage[]; // Generated images with placement
  wordCount: number;
  readingTimeMinutes: number;
  sections: string[]; // Actual sections created
}

export interface BlogReview {
  overallScore: number; // 0-100
  categoryScores: {
    clarity: number; // How clear is the writing?
    accuracy: number; // Technically correct?
    engagement: number; // Engaging to read?
    imageRelevance: number; // Images enhance content?
  };
  recommendation: 'approve' | 'revise' | 'regenerate';
  strengths: string[];
  improvements: string[];
}

/**
 * THREAD SCHEMAS
 * Multi-stage pipeline: Plan → Generate → Review
 */

export interface ThreadPlan {
  hook: string; // Opening post (most important)
  threadLength: number; // 3-10 posts
  includeHeroImage: boolean; // Image for first post
  imageSpec?: ImageSpec; // Hero image spec
  keyPoints: string[]; // Main points to cover
  tone: string; // "informative", "entertaining", etc.
  qualityRubric: ThreadQualityRubric;
}

export interface ThreadDraft {
  posts: Array<{
    order: number;
    text: string; // Max 500 chars
    characterCount: number;
  }>;
  heroImage?: GeneratedImage; // Optional hero image for post 1
  totalPosts: number;
}

export interface ThreadReview {
  overallScore: number;
  categoryScores: {
    hookStrength: number; // First post quality
    flow: number; // Logical progression
    engagement: number;
    charCountCompliance: number; // All posts ≤500 chars?
  };
  recommendation: 'approve' | 'revise' | 'regenerate';
  strengths: string[];
  improvements: string[];
}

/**
 * QUALITY RUBRIC (Shared across content types)
 */

// Blog quality rubric
export interface BlogQualityRubric {
  clarity: {
    weight: number;
    criteria: string[];
  };
  accuracy: {
    weight: number;
    criteria: string[];
  };
  engagement: {
    weight: number;
    criteria: string[];
  };
  imageRelevance: {
    weight: number;
    criteria: string[];
  };
}

// Thread quality rubric
export interface ThreadQualityRubric {
  hookStrength: {
    weight: number;
    criteria: string[];
  };
  flow: {
    weight: number;
    criteria: string[];
  };
  engagement: {
    weight: number;
    criteria: string[];
  };
  charCountCompliance: {
    weight: number;
    criteria: string[];
  };
}

/**
 * STATE OBJECTS (like CodeCreationState but for content)
 */

export interface BlogCreationState {
  idea: IdeaForCreator;
  plan: BlogPlan | null;
  draft: BlogDraft | null;
  review: BlogReview | null;
  attempts: number;
  maxAttempts: number;
  errors: string[];
  totalTokens: number;
}

export interface ThreadCreationState {
  idea: IdeaForCreator;
  plan: ThreadPlan | null;
  draft: ThreadDraft | null;
  review: ThreadReview | null;
  attempts: number;
  maxAttempts: number;
  errors: string[];
  totalTokens: number;
}
