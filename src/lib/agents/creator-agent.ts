import type { AgentStateType } from './types';
import type { Logger } from '../logging/logger';
import { createBlogV2 } from './creators/blog-creator-v2'; // V2: Multi-stage with images
import { createMastodonThreadV2 } from './creators/mastodon-creator-v2'; // V2: Multi-stage with hero image
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
 * - twitter_thread → mastodonCreator-v2 (with plan → generate → review + hero image)
 * - github_repo → codeCreator-v2 (with plan → generate → review → iterate)
 *
 * Note: Images are now COMPONENTS of blogs/threads, not standalone formats
 * Philosophy: "Schemas all the way down" - all creators use structured outputs with Zod
 */
export async function creatorAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { selectedIdea, chosenFormat, logger: parentLogger } = state;

  // Create child logger for this stage
  const logger: Logger = parentLogger
    ? parentLogger.child('creator-agent')
    : { info: console.log, error: console.error, warn: console.warn, debug: console.debug, child: () => ({} as Logger) };

  // Validation
  if (!selectedIdea) {
    logger.error('Validation failed: no idea selected');
    return {
      generatedContent: null,
      errors: ['Cannot create content: no idea selected'],
    };
  }

  if (!chosenFormat) {
    logger.error('Validation failed: no format chosen');
    return {
      generatedContent: null,
      errors: ['Cannot create content: no format chosen'],
    };
  }

  logger.info(`Starting content creation for format: ${chosenFormat}`, {
    ideaTitle: selectedIdea.title,
    format: chosenFormat,
  });

  // Route to appropriate creator
  try {
    switch (chosenFormat) {
      case 'blog_post':
        logger.info('Delegating to blog creator (V2) - multi-stage pipeline with images');
        const blogResult = await createBlogV2(selectedIdea);
        logger.info('Blog creator completed successfully', {
          tokensUsed: blogResult.tokensUsed,
          hasContent: !!blogResult.content,
        });
        return {
          generatedContent: {
            format: 'blog_post',
            ...blogResult.content,
          },
          tokensUsed: blogResult.tokensUsed,
        };

      case 'twitter_thread':
        logger.info('Delegating to mastodon creator (V2) - multi-stage pipeline with hero image');
        const mastodonResult = await createMastodonThreadV2(selectedIdea);
        logger.info('Mastodon creator completed successfully', {
          tokensUsed: mastodonResult.tokensUsed,
          hasContent: !!mastodonResult.content,
        });
        return {
          generatedContent: {
            format: 'twitter_thread',
            ...mastodonResult.content,
          },
          tokensUsed: mastodonResult.tokensUsed,
        };

      case 'github_repo':
        logger.info('Delegating to code creator (V2) - multi-stage pipeline');
        const codeResult = await createCodeProjectV2(selectedIdea);
        logger.info('Code creator completed successfully', {
          tokensUsed: codeResult.tokensUsed,
          hasContent: !!codeResult.content,
        });

        // Publish to GitHub (or dry run if environment variables not set)
        let publishResult = null;
        const isDryRun = !process.env.GITHUB_TOKEN || !process.env.GITHUB_USERNAME;

        if (isDryRun) {
          logger.warn('GitHub credentials not found - running in DRY RUN mode', {
            missingToken: !process.env.GITHUB_TOKEN,
            missingUsername: !process.env.GITHUB_USERNAME,
          });
          logger.info('Publishing to GitHub (dry run)');
          publishResult = await publishToGitHubDryRun(codeResult.content, state.userId);
          logger.info('GitHub dry run completed');
        } else {
          logger.info('Publishing to GitHub');
          publishResult = await publishToGitHub(codeResult.content, state.userId);
          logger.info('GitHub publishing completed successfully', {
            published: true,
          });
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
        logger.error('Unknown format requested', { format: chosenFormat });
        return {
          generatedContent: null,
          errors: [`Unknown format: ${chosenFormat}`],
        };
    }
  } catch (error) {
    logger.error('Creator agent failed', {
      format: chosenFormat,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      generatedContent: null,
      errors: [
        `Creator failed for ${chosenFormat}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}
