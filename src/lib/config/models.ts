/**
 * MODEL REGISTRY
 *
 * Centralized configuration for all AI models used in the system.
 * Organized by provider and purpose.
 *
 * Benefits:
 * - Single source of truth for model names
 * - Easy to update model versions
 * - Clear documentation of what each model is used for
 * - Prevents typos in model names
 */

export const MODEL_REGISTRY = {
  /**
   * OPENAI MODELS
   */
  openai: {
    // GPT-5 Nano - Fast, cheap, good for simple tasks
    nano: 'gpt-5-nano-2025-08-07',

    // GPT-4o-mini - Cost-effective for review and validation
    mini: 'gpt-4o-mini-2024-07-18',

    // O1 - Deep reasoning for complex tasks
    o1: 'o1-2024-12-17',
  },

  /**
   * ANTHROPIC MODELS
   */
  anthropic: {
    // Claude Haiku 4.5 - Fast, efficient for simple tasks
    haiku: 'claude-haiku-4-5-20251001',

    // Claude Sonnet 4.5 - Best for code generation and complex structured output
    sonnet: 'claude-sonnet-4-5-20250929',

    // Claude Opus 4.5 - Most capable, use sparingly
    opus: 'claude-opus-4-5-20251101',
  },
} as const;

/**
 * PURPOSE-BASED MODEL SELECTION
 *
 * Recommended models for common use cases
 */
export const MODEL_USE_CASES = {
  // Planning and decision-making
  planning: MODEL_REGISTRY.openai.nano,

  // Code generation - simple/modular
  codeGenerationSimple: MODEL_REGISTRY.anthropic.sonnet,

  // Code generation - complex
  codeGenerationComplex: MODEL_REGISTRY.openai.o1,

  // Code review and validation
  codeReview: MODEL_REGISTRY.openai.mini,

  // Code fixing
  codeFix: MODEL_REGISTRY.anthropic.sonnet,

  // Blog content generation
  blogGeneration: MODEL_REGISTRY.anthropic.sonnet,

  // Blog planning
  blogPlanning: MODEL_REGISTRY.openai.nano,

  // Blog review
  blogReview: MODEL_REGISTRY.openai.mini,

  // Image prompt generation
  imagePrompt: MODEL_REGISTRY.openai.mini,

  // Idea summarization
  ideaSummary: MODEL_REGISTRY.anthropic.haiku,

  // Format routing (blog vs code)
  routing: MODEL_REGISTRY.openai.mini,

  // README generation
  readmeGeneration: MODEL_REGISTRY.anthropic.sonnet,

  // Repository naming
  repoNaming: MODEL_REGISTRY.openai.nano,

  // Module signature extraction
  moduleSignatures: MODEL_REGISTRY.anthropic.sonnet,

  // Dependency aggregation
  dependencyAggregation: MODEL_REGISTRY.anthropic.haiku,

  // Notebook generation - simple/modular
  notebookGenerationSimple: MODEL_REGISTRY.anthropic.sonnet,

  // Notebook generation - complex
  notebookGenerationComplex: MODEL_REGISTRY.openai.o1,
} as const;

/**
 * Type helpers for type-safe model access
 */
export type OpenAIModel = typeof MODEL_REGISTRY.openai[keyof typeof MODEL_REGISTRY.openai];
export type AnthropicModel = typeof MODEL_REGISTRY.anthropic[keyof typeof MODEL_REGISTRY.anthropic];
export type ModelName = OpenAIModel | AnthropicModel;
