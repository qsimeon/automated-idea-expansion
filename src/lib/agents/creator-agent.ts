import type { AgentStateType } from './types';
import type { Logger } from '../logging/logger';
import { createBlog } from './creators/blog/blog-creator'; // Cell-based with images and social share
import { createCodeProject } from './creators/code/code-creator'; // Multi-stage code creator
import { publishToGitHub, publishToGitHubDryRun, getUserGitHubCredentials } from './publishers/github-publisher';

/**
 * CREATOR AGENT (Orchestrator)
 *
 * Purpose: Route to the appropriate creator based on format
 *
 * This agent receives:
 * - The selected idea (chosen by user)
 * - The chosen format (from Router Agent)
 *
 * It delegates to the format-specific creator:
 * - blog_post → Cell-based blog creator (plan → generate → review + images + social share)
 * - github_repo → Code creator (plan → generate → review → iterate)
 *
 * Note: Images and social posts are COMPONENTS of blogs, not standalone formats
 * Philosophy: "Schemas all the way down" - all creators use structured outputs with Zod
 */
export async function creatorAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { selectedIdea, chosenFormat, logger: parentLogger } = state;

  // Create child logger for this stage
  const logger = parentLogger
    ? parentLogger.child({ stage: 'creator-agent' })
    : {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.debug,
        child: () => ({ info: console.log, error: console.error, warn: console.warn, debug: console.debug })
      };

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
        logger.info('Delegating to cell-based blog creator');
        const blogResult = await createBlog(selectedIdea);
        logger.info('Blog creator completed successfully', {
          hasContent: !!blogResult.content,
        });
        return {
          generatedContent: {
            format: 'blog_post',
            ...blogResult.content,
          },
        };

      case 'github_repo':
        logger.info('Delegating to code creator - multi-stage pipeline');
        const codeResult = await createCodeProject(selectedIdea);
        logger.info('Code creator completed successfully', {
          hasContent: !!codeResult.content,
        });

        // Publish to GitHub using USER's credentials (not site owner's)
        let publishResult = null;
        let isDryRun = false;

        try {
          // Get user's GitHub credentials from database
          const userGitHubCreds = await getUserGitHubCredentials(state.userId);
          logger.info('Publishing to GitHub (user\'s own account)', {
            username: userGitHubCreds.username,
          });
          publishResult = await publishToGitHub(
            codeResult.content,
            state.userId,
            userGitHubCreds.token,
            userGitHubCreds.username
          );
          logger.info('GitHub publishing completed successfully - repo in user\'s account', {
            published: true,
            repoUrl: publishResult.repoUrl,
          });
        } catch (githubError) {
          // If user hasn't authenticated with GitHub, run dry run instead
          logger.warn('User GitHub credentials not available - running in DRY RUN mode', {
            error: githubError instanceof Error ? githubError.message : 'Unknown error',
            reason: 'User must sign in with GitHub OAuth to enable automated repo publishing',
          });
          isDryRun = true;
          logger.info('Publishing to GitHub (dry run - no actual repo created)');
          publishResult = await publishToGitHubDryRun(codeResult.content, state.userId);
          logger.info('GitHub dry run completed - code generated but not published');
        }

        return {
          generatedContent: {
            format: 'github_repo',
            ...codeResult.content,
            published: !isDryRun,
            publishResult,
          },
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
