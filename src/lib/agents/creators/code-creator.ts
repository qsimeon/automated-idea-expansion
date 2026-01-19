import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { CodeProject } from '../types';

/**
 * CODE CREATOR
 *
 * Purpose: Generate a functional code project (Node.js or Python)
 *
 * Output: Working code with:
 * - Source files
 * - README with instructions
 * - Package manifest (package.json or requirements.txt)
 * - Example usage
 */
export async function createCodeProject(idea: any): Promise<{
  content: CodeProject;
  tokensUsed: number;
}> {
  const prompt = buildCodePrompt(idea);

  // Try OpenAI first (good at code generation)
  try {
    return await generateWithOpenAI(prompt);
  } catch (openaiError) {
    console.warn('OpenAI failed for code creation, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic (also excellent at code!)
    try {
      return await generateWithAnthropic(prompt);
    } catch (anthropicError) {
      throw new Error(
        `Code creation failed. OpenAI: ${openaiError}. Anthropic: ${anthropicError}`
      );
    }
  }
}

/**
 * Build the code generation prompt
 */
function buildCodePrompt(idea: any): string {
  return `You are an expert software engineer. Create a functional code project based on this idea.

Idea Details:
Title: ${idea.title}
Description: ${idea.description || 'No description'}
Key Points: ${JSON.stringify(idea.bullets) || 'None'}
Reference Links: ${JSON.stringify(idea.external_links) || 'None'}

Requirements:
- Choose the BEST language: Node.js (JavaScript/TypeScript) OR Python
- Create a WORKING, RUNNABLE project
- Include all necessary files:
  * Source code files (clean, well-commented)
  * README.md (installation, usage, examples)
  * package.json OR requirements.txt
  * Example usage or demo
- Code should be:
  * Production-quality
  * Well-structured
  * Include error handling
  * Have helpful comments
  * Be simple enough to run locally

For Node.js projects:
- Use modern ES6+ syntax
- Include scripts in package.json ("start", "dev", etc.)
- Use popular, stable packages if needed

For Python projects:
- Use Python 3.10+ features
- Include main() function
- Use type hints
- Follow PEP 8

Project structure guidelines:
- Keep it simple (1-5 files max)
- Focus on demonstrating the core idea
- Make it easy to run: npm start or python main.py

Respond with ONLY valid JSON in this exact format:
{
  "type": "nodejs|python",
  "repoName": "kebab-case-name",
  "description": "One-line description",
  "files": [
    {
      "path": "README.md",
      "content": "# Project Title\\n\\n..."
    },
    {
      "path": "package.json",
      "content": "{\\"name\\": \\"...\\"...}"
    },
    {
      "path": "index.js",
      "content": "// Main code\\n..."
    }
  ]
}

Important:
- All file content must be valid, complete code
- Include README with clear setup instructions
- Make sure package.json/requirements.txt has all dependencies`;
}

/**
 * Generate code project with OpenAI
 */
async function generateWithOpenAI(prompt: string): Promise<{
  content: CodeProject;
  tokensUsed: number;
}> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.3, // Lower temp for more consistent code
    maxTokens: 6000, // Code can be lengthy
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await model.invoke(prompt);
  const content = response.content.toString();

  return {
    content: parseCodeProject(content),
    tokensUsed: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Generate code project with Anthropic
 */
async function generateWithAnthropic(prompt: string): Promise<{
  content: CodeProject;
  tokensUsed: number;
}> {
  const model = new ChatAnthropic({
    modelName: 'claude-3-5-haiku-20241022',
    temperature: 0.3,
    maxTokens: 6000,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await model.invoke(prompt);
  const content = response.content.toString();

  return {
    content: parseCodeProject(content),
    tokensUsed: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Parse the JSON response into a CodeProject
 */
function parseCodeProject(content: string): CodeProject {
  // Extract JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in code response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate structure
  if (!['nodejs', 'python'].includes(parsed.type)) {
    throw new Error(`Invalid project type: ${parsed.type}`);
  }

  if (typeof parsed.repoName !== 'string' || !parsed.repoName) {
    throw new Error('Invalid repo name');
  }

  if (typeof parsed.description !== 'string' || !parsed.description) {
    throw new Error('Invalid description');
  }

  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error('Invalid files array');
  }

  // Validate files
  const files = parsed.files.map((file: any) => {
    if (typeof file.path !== 'string' || !file.path) {
      throw new Error('Invalid file path');
    }
    if (typeof file.content !== 'string') {
      throw new Error('Invalid file content');
    }
    return {
      path: file.path,
      content: file.content,
    };
  });

  // Extract README content for convenience
  const readmeFile = files.find((f: { path: string; content: string }) => f.path.toLowerCase() === 'readme.md');
  const readme = readmeFile ? readmeFile.content : '';

  return {
    type: parsed.type as 'nodejs' | 'python',
    repoName: parsed.repoName,
    description: parsed.description,
    files,
    readme,
  };
}
