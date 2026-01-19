import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AgentStateType } from './types';

/**
 * ROUTER AGENT
 *
 * Purpose: Decide the best output format for the selected idea
 *
 * How it works:
 * 1. Receives the selected idea from Judge Agent
 * 2. Analyzes the idea's content and characteristics
 * 3. Decides which format would work best:
 *    - Blog: Deep explanations, tutorials, analyses
 *    - Mastodon: Quick insights, hot takes, announcements
 *    - Code: Technical demos, implementations, tools
 *    - Image: Visual concepts, artistic ideas, descriptive scenes
 * 4. Returns format choice with reasoning
 *
 * Models used: GPT-4o-mini (primary) or Claude Haiku (fallback)
 */
export async function routerAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { selectedIdea } = state;

  // No idea selected
  if (!selectedIdea) {
    return {
      chosenFormat: null,
      formatReasoning: 'No idea was selected by Judge',
      errors: ['Cannot route: no idea selected'],
    };
  }

  try {
    return await routeWithLLM(selectedIdea);
  } catch (error) {
    console.error('Router agent failed:', error);
    return {
      chosenFormat: null,
      formatReasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errors: [`Router agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Use LLM to decide the best format
 */
async function routeWithLLM(idea: any): Promise<Partial<AgentStateType>> {
  const prompt = buildRoutingPrompt(idea);

  // Try OpenAI first
  try {
    const result = await callOpenAI(prompt);
    return parseRouterResponse(result);
  } catch (openaiError) {
    console.warn('OpenAI failed, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic
    try {
      const result = await callAnthropic(prompt);
      return parseRouterResponse(result);
    } catch (anthropicError) {
      throw new Error(
        `Both LLMs failed. OpenAI: ${openaiError}. Anthropic: ${anthropicError}`
      );
    }
  }
}

/**
 * Detect if idea is code-oriented based on keywords
 */
function detectCodeIntent(title: string, description?: string | null): {
  isMLResearch: boolean;
  isCodingProject: boolean;
  isResearchExploration: boolean;
  keywords: string[];
} {
  const text = `${title} ${description || ''}`.toLowerCase();

  // ML/AI research keywords
  const mlKeywords = [
    'neural network', 'model', 'training', 'dataset', 'learning',
    'classifier', 'embedding', 'contrastive', 'transformer', 'attention',
    'backprop', 'gradient', 'optimization', 'loss function', 'epoch',
    'overfitting', 'regularization', 'batch', 'weights', 'layers',
  ];

  // Coding/implementation keywords
  const codeKeywords = [
    'implement', 'build', 'create', 'cli', 'tool', 'algorithm',
    'function', 'library', 'script', 'api', 'endpoint', 'server',
    'parse', 'generate', 'process', 'automate', 'scrape',
  ];

  // Research/exploration keywords
  const researchKeywords = [
    'explore', 'experiment', 'test', 'benchmark', 'compare',
    'analyze', 'visualization', 'plot', 'demonstrate', 'prototype',
    'investigate', 'evaluate', 'measure', 'study',
  ];

  const foundKeywords: string[] = [];

  const isMLResearch = mlKeywords.some(kw => {
    if (text.includes(kw)) {
      foundKeywords.push(kw);
      return true;
    }
    return false;
  });

  const isCodingProject = codeKeywords.some(kw => {
    if (text.includes(kw)) {
      foundKeywords.push(kw);
      return true;
    }
    return false;
  });

  const isResearchExploration = researchKeywords.some(kw => {
    if (text.includes(kw)) {
      foundKeywords.push(kw);
      return true;
    }
    return false;
  });

  return { isMLResearch, isCodingProject, isResearchExploration, keywords: foundKeywords };
}

/**
 * Build the routing prompt
 */
function buildRoutingPrompt(idea: any): string {
  // Detect code intent
  const codeSignals = detectCodeIntent(idea.title, idea.description);

  let contextHints = '';
  if (codeSignals.isMLResearch || codeSignals.isCodingProject || codeSignals.isResearchExploration) {
    contextHints = `

⚠️ CODE INTENT DETECTED:
${codeSignals.isMLResearch ? '- ML/AI research idea (prefer github_repo for code exploration)' : ''}
${codeSignals.isCodingProject ? '- Coding/implementation project (prefer github_repo for tool/demo)' : ''}
${codeSignals.isResearchExploration ? '- Research exploration (prefer github_repo for hands-on experimentation)' : ''}
Keywords found: ${codeSignals.keywords.join(', ')}

Strong recommendation: Choose 'github_repo' for technical ideas that benefit from code.`;
  }

  return `You are a content format strategist. Your job is to determine the BEST format to expand this idea into content.

Available formats:

1. **blog_post** - Long-form article (1000-2000 words)
   Best for: Deep explanations, conceptual tutorials, thought pieces, how-things-work guides
   Examples: "Understanding X", "How Y works under the hood", "The philosophy of Z"
   ⚠️ NOT for: Technical implementations, ML experiments, coding projects

2. **twitter_thread** - Social media thread (5-10 posts, 500 chars each)
   Best for: Quick insights, hot takes, step-by-step tips, announcements, concise ideas
   Examples: "5 tips for X", "Thread on Y", "Quick thoughts on Z"
   ⚠️ NOT for: Complex technical ideas that need code

3. **github_repo** - Interactive code project (Python/JS/TS app, notebook, or CLI tool)
   Best for: Technical demonstrations, ML experiments, algorithm implementations,
             data analysis, research explorations, tools, libraries, coding challenges
   Examples: "Implement X algorithm", "Explore Y with code", "Build Z tool",
             "Train model for X", "Contrastive learning experiment", "CLI for Y"
   ✅ PREFER THIS for ML/AI research, coding projects, technical explorations
   ✅ Code provides hands-on value - choose when in doubt between code and blog

4. **image** - AI-generated image
   Best for: Visual concepts, artistic ideas, descriptive scenes, metaphors, design mockups
   Examples: "Visualize X", "Artistic representation of Y", "Imagining Z"
   ⚠️ NOT for: Technical or coding ideas

Analyze this idea:

Title: ${idea.title}
Description: ${idea.description || 'No description provided'}
${contextHints}

DECISION RULES:
1. If idea contains ML/AI keywords → strongly prefer 'github_repo' (code exploration)
2. If idea says "build X" or "implement Y" → 'github_repo' (tool/demo)
3. If idea is hands-on/experimental → 'github_repo' (interactive value)
4. If idea is purely conceptual/explanatory → 'blog_post'
5. If idea is quick tips/insights → 'twitter_thread'
6. If idea is visual description → 'image'
7. When uncertain between code and blog → choose code (more valuable for technical ideas)

Respond with ONLY valid JSON in this exact format:
{
  "format": "<blog_post|twitter_thread|github_repo|image>",
  "reasoning": "<2-3 sentences explaining why this format is best>"
}

Important:
- Choose the format that would create the MOST value for this specific idea
- Be aggressive about choosing 'github_repo' for technical ideas
- Code is better than explanation for ML/research/implementation ideas`;
}

/**
 * Call OpenAI GPT-4o-mini
 */
async function callOpenAI(prompt: string): Promise<{ content: string; tokens: number }> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.5, // Lower temp for more consistent routing
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await model.invoke(prompt);

  return {
    content: response.content.toString(),
    tokens: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Call Anthropic Claude Haiku (fallback)
 */
async function callAnthropic(prompt: string): Promise<{ content: string; tokens: number }> {
  const model = new ChatAnthropic({
    modelName: 'claude-3-5-haiku-20241022',
    temperature: 0.5,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await model.invoke(prompt);

  return {
    content: response.content.toString(),
    tokens: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Parse the LLM response and extract the format choice
 */
function parseRouterResponse(response: {
  content: string;
  tokens: number;
}): Partial<AgentStateType> {
  const { content, tokens } = response;

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate format
  const validFormats = ['blog_post', 'twitter_thread', 'github_repo', 'image'];
  if (!validFormats.includes(parsed.format)) {
    throw new Error(`Invalid format: ${parsed.format}. Must be one of: ${validFormats.join(', ')}`);
  }

  if (typeof parsed.reasoning !== 'string' || parsed.reasoning.length === 0) {
    throw new Error('Invalid reasoning in response');
  }

  return {
    chosenFormat: parsed.format as 'blog_post' | 'twitter_thread' | 'github_repo' | 'image',
    formatReasoning: parsed.reasoning,
    tokensUsed: tokens,
  };
}
