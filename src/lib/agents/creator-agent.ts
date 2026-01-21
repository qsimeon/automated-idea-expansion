import type { AgentStateType } from './types';
import { createBlogV2 } from './creators/blog-creator-v2'; // V2: Multi-stage with images
import { createMastodonThread } from './creators/mastodon-creator';
import { createCodeProjectV2 } from './creators/code/code-creator-v2'; // Multi-stage code creator
import { publishToGitHub, publishToGitHubDryRun } from './publishers/github-publisher';

/**
 * CREATOR AGENT (Orchestrator)
 *
 * Purpose: Route to the appropriate creator based on format
 *
 * This agent receives:
 * - The selected idea (from Judge)
 * - The chosen format (from Router)
 *
 * It delegates to the format-specific creator:
 * - blog_post → blogCreator-v2 (with plan → generate → review + images)
 * - twitter_thread → mastodonCreator (can include hero image)
 * - github_repo → codeCreator-v2 (with plan → generate → review → iterate)
 *
 * Note: Images are now COMPONENTS of blogs/threads, not standalone formats
 */
export async function creatorAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { selectedIdea, chosenFormat } = state;

  // Validation
  if (!selectedIdea) {
    return {
      generatedContent: null,
      errors: ['Cannot create content: no idea selected'],
    };
  }

  if (!chosenFormat) {
    return {
      generatedContent: null,
      errors: ['Cannot create content: no format chosen'],
    };
  }

  // Route to appropriate creator
  try {
    switch (chosenFormat) {
      case 'blog_post':
        console.log('Creating blog post with multi-stage pipeline (V2)...');
        const blogResult = await createBlogV2(selectedIdea);
        return {
          generatedContent: {
            format: 'blog_post',
            ...blogResult.content,
          },
          tokensUsed: blogResult.tokensUsed,
        };

      case 'twitter_thread':
        console.log('Creating twitter thread...');
        const mastodonResult = await createMastodonThread(selectedIdea);
        return {
          generatedContent: {
            format: 'twitter_thread',
            ...mastodonResult.content,
          },
          tokensUsed: mastodonResult.tokensUsed,
        };

      case 'github_repo':
        console.log('Creating code project with multi-stage pipeline...');
        const codeResult = await createCodeProjectV2(selectedIdea);

        // Publish to GitHub (or dry run if environment variables not set)
        let publishResult = null;
        const isDryRun = !process.env.GITHUB_TOKEN || !process.env.GITHUB_USERNAME;

        if (isDryRun) {
          console.log('\n⚠️  GitHub credentials not found - running in DRY RUN mode');
          console.log('   Set GITHUB_TOKEN and GITHUB_USERNAME to actually create repositories');
          publishResult = await publishToGitHubDryRun(codeResult.content, state.userId);
        } else {
          publishResult = await publishToGitHub(codeResult.content, state.userId);
        }

        return {
          generatedContent: {
            format: 'github_repo',
            ...codeResult.content,
            published: !isDryRun,
            publishResult,
          },
          tokensUsed: codeResult.tokensUsed,
        };

      default:
        return {
          generatedContent: null,
          errors: [`Unknown format: ${chosenFormat}`],
        };
    }
  } catch (error) {
    console.error(`Creator agent failed for format ${chosenFormat}:`, error);
    return {
      generatedContent: null,
      errors: [
        `Creator failed for ${chosenFormat}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}
