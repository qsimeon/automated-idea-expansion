/**
 * GitHub Publisher - Creates real GitHub repositories with generated code
 *
 * This publisher takes generated code projects and:
 * 1. Creates a new public GitHub repository
 * 2. Uploads all generated files (README, code, dependencies)
 * 3. Adds repository topics for discoverability
 * 4. Returns the live repository URL
 *
 * Uses Octokit (official GitHub REST API client)
 */

import { Octokit } from '@octokit/rest';
import type { GeneratedCode } from '../creators/code/types';

/**
 * Result of publishing to GitHub
 */
export interface GitHubPublishResult {
  repoUrl: string;      // https://github.com/username/repo-name
  repoName: string;     // repo-name
  cloneUrl: string;     // git@github.com:username/repo-name.git
  filesUploaded: number; // How many files were uploaded
}

/**
 * Configuration for GitHub publishing
 */
interface GitHubConfig {
  token: string;        // GitHub Personal Access Token
  username: string;     // GitHub username
  makePrivate?: boolean; // Create private repo (default: false)
}

/**
 * Get GitHub configuration from environment variables
 */
function getGitHubConfig(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN;
  const username = process.env.GITHUB_USERNAME;

  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable not set');
  }

  if (!username) {
    throw new Error('GITHUB_USERNAME environment variable not set');
  }

  return {
    token,
    username,
    makePrivate: process.env.GITHUB_MAKE_PRIVATE === 'true',
  };
}

/**
 * Publish generated code project to GitHub
 *
 * @param project - Generated code project with files
 * @param userId - User ID (for logging/tracking)
 * @returns Repository details including URL
 */
export async function publishToGitHub(
  project: GeneratedCode,
  userId: string
): Promise<GitHubPublishResult> {
  console.log('\n🚀 === GITHUB PUBLISHER ===');
  console.log(`   Repository: ${project.repoName}`);
  console.log(`   Files: ${project.files.length}`);

  // Get configuration
  const config = getGitHubConfig();

  // Initialize Octokit client
  const octokit = new Octokit({
    auth: config.token,
  });

  try {
    // STEP 1: Create repository
    console.log('\n📦 Creating repository...');
    const repo = await createRepository(octokit, config, project);
    console.log(`   ✅ Repository created: ${repo.html_url}`);

    // STEP 2: Upload all files
    console.log('\n📁 Uploading files...');
    await uploadFiles(octokit, config.username, project.repoName, project.files);
    console.log(`   ✅ ${project.files.length} files uploaded`);

    // STEP 3: Add repository topics
    console.log('\n🏷️  Adding topics...');
    await addRepositoryTopics(octokit, config.username, project.repoName, project);
    console.log('   ✅ Topics added');

    console.log('\n✅ === GITHUB PUBLISHING COMPLETE ===');
    console.log(`   URL: ${repo.html_url}`);

    return {
      repoUrl: repo.html_url,
      repoName: project.repoName,
      cloneUrl: repo.clone_url,
      filesUploaded: project.files.length,
    };
  } catch (error: any) {
    // Handle specific GitHub API errors
    if (error.status === 422 && error.message?.includes('name already exists')) {
      console.error('❌ Repository already exists');

      // Retry with timestamp suffix
      const newName = `${project.repoName}-${Date.now()}`;
      console.log(`   Retrying with name: ${newName}`);

      project.repoName = newName;
      return await publishToGitHub(project, userId);
    }

    if (error.status === 401) {
      throw new Error('GitHub authentication failed. Check GITHUB_TOKEN environment variable.');
    }

    if (error.status === 403) {
      throw new Error('GitHub API rate limit exceeded or insufficient permissions.');
    }

    console.error('❌ GitHub publishing failed:', error.message);
    throw error;
  }
}

/**
 * Create a new GitHub repository
 */
async function createRepository(
  octokit: Octokit,
  config: GitHubConfig,
  project: GeneratedCode
) {
  const { data: repo } = await octokit.repos.createForAuthenticatedUser({
    name: project.repoName,
    description: project.description || `AI-generated ${project.type} project`,
    private: config.makePrivate || false,
    auto_init: false, // Don't create default README - we'll upload our own files
  });

  return repo;
}

/**
 * Upload all files to the repository
 */
async function uploadFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  files: GeneratedCode['files']
) {
  for (const file of files) {
    console.log(`   Uploading: ${file.path}`);

    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: file.path,
        message: `Add ${file.path}`,
        content: Buffer.from(file.content).toString('base64'), // GitHub API requires base64
      });
    } catch (error: any) {
      console.error(`   ⚠️  Failed to upload ${file.path}:`, error.message);
      // Continue with other files even if one fails
    }

    // Rate limiting: Be nice to GitHub API
    // 5000 requests/hour limit, but we space them out
    await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms between files
  }
}

/**
 * Add topics/tags to repository for discoverability
 */
async function addRepositoryTopics(
  octokit: Octokit,
  owner: string,
  repo: string,
  project: GeneratedCode
) {
  // Generate topics based on project
  const topics = generateTopics(project);

  try {
    await octokit.repos.replaceAllTopics({
      owner,
      repo,
      names: topics,
    });
  } catch (error: any) {
    console.error('   ⚠️  Failed to add topics:', error.message);
    // Non-critical, continue anyway
  }
}

/**
 * Generate repository topics based on project characteristics
 */
function generateTopics(project: GeneratedCode): string[] {
  const topics = ['ai-generated', 'automation'];

  // Add language
  if (project.type) {
    topics.push(project.type);
  }

  // Add output type
  if (project.outputType) {
    const typeMap: Record<string, string> = {
      'notebook': 'jupyter-notebook',
      'cli-app': 'cli',
      'web-app': 'web-app',
      'library': 'library',
      'demo-script': 'demo',
    };
    const topic = typeMap[project.outputType];
    if (topic) {
      topics.push(topic);
    }
  }

  // Limit to 20 topics (GitHub max)
  return topics.slice(0, 20);
}

/**
 * Dry run mode - validates without actually creating repository
 * Useful for testing
 */
export async function publishToGitHubDryRun(
  project: GeneratedCode,
  userId: string
): Promise<GitHubPublishResult> {
  console.log('\n🧪 === GITHUB PUBLISHER (DRY RUN) ===');
  console.log(`   Would create repo: ${project.repoName}`);
  console.log(`   Would upload ${project.files.length} files:`);

  project.files.forEach((file) => {
    console.log(`     - ${file.path}`);
  });

  const topics = generateTopics(project);
  console.log(`   Would add topics: ${topics.join(', ')}`);

  return {
    repoUrl: `https://github.com/DRY-RUN/${project.repoName}`,
    repoName: project.repoName,
    cloneUrl: `git@github.com:DRY-RUN/${project.repoName}.git`,
    filesUploaded: project.files.length,
  };
}
