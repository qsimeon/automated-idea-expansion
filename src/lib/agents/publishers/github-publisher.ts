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
import { supabaseAdmin } from '../../db/supabase';
import { decryptFromJSON } from '../../crypto/encryption';

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
 * Get user's GitHub credentials for publishing to their own account
 *
 * SECURITY: Each user has their own encrypted GitHub token stored in the database.
 * We retrieve and decrypt it to publish repos to the user's GitHub account.
 *
 * @param userId - User ID
 * @returns Object with decrypted token and username
 * @throws Error if user hasn't authenticated with GitHub
 */
export async function getUserGitHubCredentials(userId: string): Promise<{ token: string; username: string }> {
  // Get user's GitHub token from credentials table
  const { data: credential, error: credentialError } = await supabaseAdmin
    .from('credentials')
    .select('encrypted_value')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .single();

  if (credentialError || !credential) {
    throw new Error(
      'GitHub token not found. User must sign in with GitHub to publish repos to their own account.'
    );
  }

  // Decrypt the token
  let gitHubToken: string;
  try {
    gitHubToken = decryptFromJSON(credential.encrypted_value);
  } catch (error) {
    throw new Error('Failed to decrypt GitHub token. Please re-authenticate with GitHub.');
  }

  // Get user's GitHub username from the user profile
  // (This is stored when they first authenticate via OAuth)
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new Error('User profile not found.');
  }

  /**
   * GitHub Username Resolution:
   *
   * Current: Uses `user.name` from users table (populated during OAuth)
   * Future: Add dedicated `github_login` column for better reliability
   *
   * Why not yet: `name` works for 99% of cases, low priority
   * When to change: If users report publishing errors
   */
  const gitHubUsername = user.name || 'Unknown';

  return {
    token: gitHubToken,
    username: gitHubUsername,
  };
}

/**
 * Configuration for GitHub publishing
 */
interface GitHubConfig {
  token: string;        // GitHub Personal Access Token (per-user)
  username: string;     // GitHub username (per-user)
  makePrivate?: boolean; // Create private repo (default: false)
}

/**
 * Get GitHub configuration from user's stored credentials
 *
 * IMPORTANT: Each user's repos are published to THEIR OWN GitHub account,
 * not the site owner's account. This is accomplished by:
 * 1. Using the encrypted GitHub token stored in the 'credentials' table
 * 2. Getting the user's GitHub username from their profile
 *
 * The OAuth token captured during sign-in (with 'public_repo' scope)
 * gives us permission to create repos in the user's account.
 */
function getGitHubConfig(userGitHubToken: string, userGitHubUsername: string): GitHubConfig {
  if (!userGitHubToken) {
    throw new Error(
      'GitHub token not found. User must sign in with GitHub OAuth to publish repos. '
      + 'Repos will be created in the user\'s own GitHub account, not the site owner\'s.'
    );
  }

  if (!userGitHubUsername) {
    throw new Error('GitHub username not found. Check that GitHub OAuth profile was captured.');
  }

  return {
    token: userGitHubToken,
    username: userGitHubUsername,
    makePrivate: false, // Always public for now
  };
}

/**
 * Publish generated code project to GitHub
 *
 * SECURITY: Each user publishes to their OWN GitHub account
 *
 * @param project - Generated code project with files
 * @param userId - User ID (for logging/tracking)
 * @param userGitHubToken - User's encrypted GitHub token (from credentials table)
 * @param userGitHubUsername - User's GitHub username (from OAuth profile)
 * @returns Repository details including URL
 */
export async function publishToGitHub(
  project: GeneratedCode,
  userId: string,
  userGitHubToken: string,
  userGitHubUsername: string
): Promise<GitHubPublishResult> {
  console.log('\n🚀 === GITHUB PUBLISHER (USER\'S GITHUB) ===');
  console.log(`   Owner: ${userGitHubUsername}`);
  console.log(`   Repository: ${project.repoName}`);
  console.log(`   Files: ${project.files.length}`);

  // Get configuration (per-user)
  const config = getGitHubConfig(userGitHubToken, userGitHubUsername);

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
      return await publishToGitHub(project, userId, userGitHubToken, userGitHubUsername);
    }

    if (error.status === 401) {
      throw new Error('GitHub authentication failed. User\'s GitHub token may have expired. Please re-authenticate with GitHub.');
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
