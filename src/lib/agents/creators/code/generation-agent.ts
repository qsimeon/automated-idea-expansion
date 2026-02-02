import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { generateNotebook } from './notebook-generator'; // Atomic schemas
import { ReadmeSchema, type Readme } from './readme-schema';
import { renderReadmeToMarkdown } from './readme-renderer';
import { createLogger } from '@/lib/logging/logger';
import { MODEL_USE_CASES } from '@/lib/config/models';
import {
  extractModuleSignatures,
  formatModuleContextForPrompt,
  aggregateAllDependencies,
  validateModuleImports,
  type ModuleContext,
} from './module-context-extractor';
import { z } from 'zod';

/**
 * GENERATION AGENT (Structured Outputs)
 *
 * Purpose: Generate actual code based on the plan
 *
 * This agent acts like a developer implementing the architect's design.
 * It creates:
 * - All necessary code files
 * - README with instructions
 * - Dependencies file (requirements.txt, package.json, etc.)
 * - Setup and run instructions
 *
 * The generator routes to specialized functions based on output type:
 * - CLI App → Generate executable script with argparse/CLI API
 * - Web App → Generate full project structure with framework
 * - Library → Generate module with exports and documentation
 * - Demo Script → Generate single standalone file
 * - Notebook → Generate Jupyter notebook with atomic schemas
 *
 * Architecture:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or cleaning needed
 * - Type-safe generation
 * - Automatic model selection based on complexity (Sonnet for simple/modular, O1 for complex)
 *
 * Model routing:
 * - Simple/Modular: Claude Sonnet 4.5 (~$0.15-0.25 per project)
 * - Complex: O1 with extended thinking (~$1.50-3.00 per project)
 */

// Schemas for code generation
const CLIAppSchema = z.object({
  code: z.string().describe('Complete, working CLI application code'),
  requiredPackages: z.array(z.string()).describe('Required packages/dependencies'),
  usage: z.string().describe('Usage example (e.g., "python main.py --help")'),
});

const DemoScriptSchema = z.object({
  code: z.string().describe('Complete, working demo script code'),
  requiredPackages: z.array(z.string()).describe('Required packages/dependencies').default([]),
});

// Schema for generating multiple code files (modules)
const MultipleFilesSchema = z.object({
  files: z.array(z.object({
    path: z.string().describe('File path (e.g., "utils.py", "api.js")'),
    content: z.string().describe('Complete, working code for this file'),
  }))
    .min(1, 'Must generate at least 1 file')
    .describe('List of code files to create (MUST include at least 1 file)'),
});

type CLIAppOutput = z.infer<typeof CLIAppSchema>;
type DemoScriptOutput = z.infer<typeof DemoScriptSchema>;
type MultipleFilesOutput = z.infer<typeof MultipleFilesSchema>;

/**
 * VALIDATE FILE COUNT - Ensure generated files match architectural requirements
 *
 * Enforces architectural integrity by checking that the number of code files
 * (excluding README, package.json, etc.) matches the declared architecture.
 */
function validateFileCount(files: CodeFile[], plan: CodePlan): void {
  const logger = createLogger({ stage: 'generation-agent' });

  // Count only actual code files (not README, config, or dependency files)
  const codeFiles = files.filter(
    f => !f.path.match(/README\.md|package\.json|requirements\.txt|\.gitignore|Cargo\.toml/i)
  );

  const codeFileCount = codeFiles.length;

  // Validation rules based on architecture
  switch (plan.architecture) {
    case 'modular':
      if (codeFileCount < 2) {
        logger.warn('Modular architecture expected at least 2 code files', {
          codeFileCount,
          files: files.map(f => f.path),
          message: 'Continuing with available files',
        });
      }
      break;

    case 'full-stack':
      if (codeFileCount < 5) {
        throw new Error(
          `Full-stack architecture requires at least 5 code files (client, server, models, etc.). ` +
          `Found ${codeFileCount}. Files: ${files.map(f => f.path).join(', ')}. ` +
          `Please create a proper full-stack structure.`
        );
      }
      break;

    case 'simple':
      // Simple architecture can be 1 file, no validation needed
      break;
  }

  logger.info('File count validation passed', {
    codeFileCount,
    architecture: plan.architecture,
  });
}

/**
 * SELECT GENERATION MODEL - Route to appropriate model based on complexity
 *
 * Strategy:
 * - Simple/Modular → Claude Sonnet 4.5 (best code quality, fast, $0.15-0.25 per generation)
 * - Complex → O1 with extended thinking (deep reasoning, $1.50-3.00 per generation)
 *
 * This ensures we use expensive O1/O3 models only when complexity truly requires it.
 */
function selectGenerationModel(plan: CodePlan): ChatAnthropic | ChatOpenAI {
  const logger = createLogger({ stage: 'generation-agent' });

  switch (plan.modelTier) {
    case 'simple':
    case 'modular':
      // Use Claude Sonnet 4.5 for most code generation (best quality/cost ratio)
      return new ChatAnthropic({
        modelName: MODEL_USE_CASES.codeGenerationSimple,
        temperature: 0.3,
      });

    case 'complex':
      // Use O1 for complex architectures requiring deep reasoning
      logger.info('Using O1 extended thinking for complex code', {
        complexityScore: plan.codeComplexityScore,
      });
      return new ChatOpenAI({
        modelName: MODEL_USE_CASES.codeGenerationComplex,
        temperature: 1, // O1 only supports temperature 1
      });

    default:
      // Fallback to Sonnet if modelTier not recognized
      logger.warn('Unknown modelTier, defaulting to Sonnet', {
        modelTier: plan.modelTier,
      });
      return new ChatAnthropic({
        modelName: MODEL_USE_CASES.codeGenerationSimple,
        temperature: 0.3,
      });
  }
}

export async function generateCode(
  plan: CodePlan,
  idea: { id: string; title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  const logger = createLogger({
    stage: 'generation-agent',
  });

  logger.info('Generating code', {
    outputType: plan.outputType,
    language: plan.language,
  });

  // Route to specialized generator based on output type
  switch (plan.outputType) {
    case 'notebook':
      return await generateNotebook(plan, idea); // Atomic schemas (h1, paragraph, code lines as primitives)
    case 'cli-app':
      return await generateCLIApp(plan, idea);
    case 'web-app':
      return await generateWebApp(plan, idea);
    case 'library':
      return await generateLibrary(plan, idea);
    case 'demo-script':
      return await generateDemoScript(plan, idea);
    default:
      throw new Error(`Unknown output type: ${plan.outputType}`);
  }
}

/**
 * Notebook generation uses atomic schemas that break down every element to primitives
 * (h1, paragraph, code line objects) for clean, deterministic Jupyter output.
 */


/**
 * GENERATE LIBRARY MODULES FOR MODULAR ARCHITECTURE
 *
 * When architecture is 'modular', generate library modules that the main file imports from.
 * This enables clean separation of concerns.
 *
 * @param idea - The project idea
 * @param plan - The code plan
 * @param language - Programming language
 * @returns Array of CodeFile objects for modules, plus ModuleContext for imports
 */
async function generateLibraryModules(
  idea: { title: string; description: string | null },
  plan: CodePlan,
  language: string
): Promise<{ files: CodeFile[]; moduleContext: ModuleContext[] }> {
  const logger = createLogger({ stage: 'generation-agent' });

  const model = new ChatAnthropic({
    modelName: MODEL_USE_CASES.moduleSignatures,
    temperature: 0.3,
  });

  const structuredModel = model.withStructuredOutput(MultipleFilesSchema);

  // Suggest 2-3 utility modules based on the idea
  const fileExtension = language === 'python' ? '.py' : '.js';
  const libFiles = [
    `lib/core${fileExtension}`,
    `lib/utils${fileExtension}`,
  ];

  const prompt = `Generate library modules for a ${language} project.

PROJECT: "${idea.title}"
${idea.description ? `DESCRIPTION: ${idea.description}` : ''}

REQUIRED FILES:
${libFiles.map((f, i) => `${i + 1}. ${f}`).join('\n')}

These are library modules that will be IMPORTED by main application code.
Generate them to be reusable and well-structured.

REQUIREMENTS:
- Each file must be a complete, working ${language} module
- Include proper module docstrings
- Public functions/classes with docstrings
- Can include helper functions (prefix with _)
- Design for IMPORT and USE, not standalone execution
- Proper imports at the top
- Type hints where applicable (Python) or JSDoc (JavaScript)

RESPONSE FORMAT:
{
  "files": [
    {
      "path": "${libFiles[0]}",
      "content": "# Complete module code..."
    },
    {
      "path": "${libFiles[1]}",
      "content": "# Complete module code..."
    }
  ]
}`;

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Generating library modules (attempt ${attempt}/${maxRetries})`);

      const result = await structuredModel.invoke(prompt);

      // Validate response is not empty
      if (!result || !result.files || result.files.length === 0) {
        throw new Error(
          `LLM returned empty response: ${JSON.stringify(result)}. Expected ${libFiles.length} files.`
        );
      }

      // Validate we got the expected number of files
      if (result.files.length < libFiles.length) {
        logger.warn('Received fewer files than requested', {
          expected: libFiles.length,
          received: result.files.length,
          files: result.files.map((f: any) => f.path),
        });
      }

      const codeFiles: CodeFile[] = (result.files || []).map((f: any) => ({
        path: f.path,
        content: f.content,
        language,
      }));

      // Extract signatures
      const moduleContext = await extractModuleSignatures(codeFiles, language);

      logger.info('Generated library modules for modular architecture', {
        modulesCount: codeFiles.length,
        attempt,
      });

      return { files: codeFiles, moduleContext };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.error(`Module generation attempt ${attempt} failed`, {
        error: lastError.message,
        attempt,
        maxRetries,
      });

      if (attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        logger.info(`Retrying after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All retries failed - throw with detailed error
  logger.error('All module generation attempts failed', {
    attempts: maxRetries,
    lastError: lastError?.message,
  });

  throw new Error(
    `Failed to generate library modules after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * CLI APP GENERATOR
 *
 * Creates a command-line application with:
 * - Main executable file
 * - Argument parsing (for modular: imports from library)
 * - Help text
 * - README with usage examples
 */
async function generateCLIApp(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // PHASE 1: For modular architecture, generate library modules first
  let moduleFiles: CodeFile[] = [];
  let moduleContext: ModuleContext[] = [];

  const logger = createLogger({
    stage: 'generation-agent',
  });

  if (plan.architecture === 'modular') {
    logger.info('PHASE 1: Generating library modules for modular CLI');
    const result = await generateLibraryModules(idea, plan, plan.language);
    moduleFiles = result.files;
    moduleContext = result.moduleContext;
  }

  // PHASE 2: Generate main CLI file WITH module context
  const model = selectGenerationModel(plan);

  // Use structured output (guarantees valid JSON)
  const structuredModel = model.withStructuredOutput(CLIAppSchema);

  const mainFile = plan.language === 'python' ? 'main.py' : plan.language === 'typescript' ? 'index.ts' : 'index.js';

  // Format module context for prompt
  const moduleContextSection = formatModuleContextForPrompt(moduleContext, 'cli-app');

  const prompt = `Create a WORKING, EXECUTABLE CLI application that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

${moduleContextSection}

Requirements:
- Language: ${plan.language}
- Architecture: ${plan.architecture}
- Create a FULLY WORKING command-line tool
- ${plan.language === 'python' ? 'Use argparse for CLI arguments' : 'Use commander or yargs for CLI arguments'}
- Include --help flag with clear usage documentation
- Handle errors gracefully with meaningful error messages
- Make output clear and user-friendly
- Code must be EXECUTABLE and TESTED-QUALITY

CRITICAL: The code MUST:
1. Actually RUN without errors
2. Parse command-line arguments properly
3. Validate all inputs before processing
4. Provide clear error messages
5. Include example usage in --help
6. Follow ${plan.language} best practices
7. Be production-ready, not a sketch

Example CLI structure for Python:
- Use argparse with subparsers if multiple commands
- Add type hints (Python 3.9+)
- Include docstrings for all functions
- Handle exceptions properly (try/except)
- Add logging for debugging

Example CLI structure for JavaScript/TypeScript:
- Use commander or yargs for argument parsing
- Add JSDoc or TypeScript types
- Include proper error handling
- Use async/await for async operations

Provide the COMPLETE, RUNNABLE code for ${mainFile}.

OUTPUT STRUCTURE:
- code: Complete working code as a single string
- requiredPackages: Array of package names (e.g., ["numpy", "requests"])
- usage: Usage example string (e.g., "python main.py --help")`;

  try {
    const result = await structuredModel.invoke(prompt);

    // Generate SHORT, descriptive repo name
    const repoName = await generateRepoName(idea, plan);

    // First create the code files (without README)
    const codeFiles: CodeFile[] = [
      ...moduleFiles, // Include library modules if generated
      {
        path: mainFile,
        content: result.code,
        language: plan.language,
      },
    ];

    // ⭐ TASK 2: Validate imports if modules are present
    if (moduleContext.length > 0 && plan.language === 'python') {
      const validation = validateModuleImports(result.code, moduleContext);

      if (validation.missingImports.length > 0) {
        logger.warn('Import validation found potential issues', {
          missingImports: validation.missingImports.map(({ module, exports }) => ({
            module: module.fileName,
            exports,
          })),
        });
      }

      if (validation.inlineImplementations.length > 0) {
        logger.warn('Functions that should be imported instead', {
          inlineImplementations: validation.inlineImplementations,
        });
      }

      if (validation.usedModules.length > 0) {
        logger.info('Correctly importing from modules', {
          usedModulesCount: validation.usedModules.length,
        });
      }
    }

    // Now generate AI-powered README with full context
    // Reconstruct the original idea string from title and description
    const ideaString = idea.description
      ? `${idea.title}: ${idea.description}`
      : idea.title;

    const readme = await generateReadme({
      ideaString,
      language: plan.language,
      plan,
      files: codeFiles, // Pass the generated code files for context
      setupInstructions: plan.language === 'python'
        ? 'pip install ' + (result.requiredPackages || []).join(' ')
        : 'npm install ' + (result.requiredPackages || []).join(' '),
      runInstructions: result.usage || `${plan.language === 'python' ? 'python' : 'node'} ${mainFile}`,
    });

    const files: CodeFile[] = [
      ...codeFiles,
      {
        path: 'README.md',
        content: readme,
      },
    ];

    // Add requirements/package file
    // ⭐ CRITICAL FIX: Aggregate dependencies from ALL code files (modules + main)
    // Previously only used result.requiredPackages from main file
    let allDependencies = result.requiredPackages || [];

    if (plan.architecture === 'modular') {
      try {
        const aggregatedDeps = await aggregateAllDependencies(codeFiles, plan.language);
        if (aggregatedDeps.length > 0) {
          allDependencies = aggregatedDeps;
          logger.info('Aggregated dependencies', {
            dependencies: aggregatedDeps,
          });
        }
      } catch (error) {
        logger.warn('Failed to aggregate dependencies, using main file deps only', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (plan.language === 'python' && allDependencies.length > 0) {
      files.push({
        path: 'requirements.txt',
        content: allDependencies.join('\n'),
      });
    } else if ((plan.language === 'javascript' || plan.language === 'typescript') && allDependencies.length > 0) {
      files.push({
        path: 'package.json',
        content: JSON.stringify(
          {
            name: repoName,
            version: '1.0.0',
            description: idea.description || idea.title,
            main: mainFile,
            scripts: {
              start: `node ${mainFile}`,
            },
            dependencies: allDependencies.reduce((acc: any, pkg: string) => {
              acc[pkg] = '*';
              return acc;
            }, {}),
          },
          null,
          2
        ),
      });
    }

    // Validate file count matches architectural requirements
    validateFileCount(files, plan);

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: [plan.language === 'python' ? 'python' : 'node'],
          packages: result.requiredPackages || [],
        },
        setupInstructions: plan.language === 'python'
          ? 'pip install -r requirements.txt'
          : 'npm install',
        runInstructions: plan.language === 'python'
          ? `python ${mainFile} --help`
          : `node ${mainFile} --help`,
        type: plan.language === 'python' ? 'python' : 'nodejs',
        outputType: 'cli-app',
      },
    };
  } catch (error) {
    logger.error('Failed to parse CLI app generation', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * WEB APP GENERATOR - Creates Python Flask/FastAPI web applications
 *
 * Always generates Python web apps (Flask or FastAPI) instead of Node/React
 * to ensure compatibility and quality.
 */
async function generateWebApp(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  const logger = createLogger({ stage: 'generation-agent' });

  // Force Python for web apps
  const pythonPlan: CodePlan = {
    ...plan,
    language: 'python',
    framework: plan.framework || 'flask', // Default to Flask if no framework specified
  };

  // PHASE 1: Generate library modules if modular
  let moduleFiles: CodeFile[] = [];
  let moduleContext: ModuleContext[] = [];

  if (pythonPlan.architecture === 'modular') {
    logger.info('PHASE 1: Generating library modules for modular web app');
    const result = await generateLibraryModules(idea, pythonPlan, 'python');
    moduleFiles = result.files;
    moduleContext = result.moduleContext;
  }

  // PHASE 2: Generate main Flask/FastAPI app
  const model = selectGenerationModel(pythonPlan);
  const structuredModel = model.withStructuredOutput(DemoScriptSchema);

  const framework = pythonPlan.framework || 'flask';
  const mainFile = 'app.py';

  const moduleContextSection = formatModuleContextForPrompt(moduleContext, 'web-app');

  const prompt = `Create a WORKING Python web application using ${framework.toUpperCase()} that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

${moduleContextSection}

Requirements:
- Framework: ${framework === 'fastapi' ? 'FastAPI' : 'Flask'}
- Create a fully working, production-ready web application
- Include clear routing with meaningful endpoints
- ${framework === 'fastapi' ? 'Use FastAPI with Uvicorn, include Pydantic models for validation' : 'Use Flask with proper error handling'}
- Add appropriate error handling and status codes
- Include docstrings for all functions
- Make it RUNNABLE as-is with proper dependencies

CRITICAL: The code MUST:
1. Actually RUN without errors (tested with \`${framework === 'fastapi' ? 'uvicorn app:app --reload' : 'python app.py'}\`)
2. Be production-quality with proper error handling
3. Follow Python best practices and PEP 8
4. Include all necessary imports
5. Have clear, well-organized code structure
6. Include at least 2-3 meaningful endpoints/routes

Provide COMPLETE, TESTED-QUALITY code for ${mainFile}.

OUTPUT STRUCTURE:
- code: Complete working code as a single string
- requiredPackages: Array of packages (e.g., ["flask", "python-dotenv"] or ["fastapi", "uvicorn"])`;

  try {
    const result = await structuredModel.invoke(prompt);

    if (!result?.code || result.code.trim().length === 0) {
      logger.warn('No code generated for web app, using demo fallback');
      return generateDemoScript(plan, idea);
    }

    // Generate repo name
    const repoName = await generateRepoName(idea, pythonPlan);

    // Create files
    const files: CodeFile[] = [
      ...moduleFiles,
      {
        path: mainFile,
        content: result.code,
        language: 'python',
      },
    ];

    // Generate README
    const readme = await generateReadme({
      ideaString: idea.title + (idea.description ? ': ' + idea.description : ''),
      plan: pythonPlan,
      files,
      language: 'python',
      setupInstructions: 'pip install -r requirements.txt',
      runInstructions: framework === 'fastapi'
        ? 'uvicorn app:app --reload'
        : 'python app.py',
    });

    if (readme) {
      files.push({
        path: 'README.md',
        content: readme,
      });
    }

    // Aggregate dependencies
    let allDependencies = result?.requiredPackages || [];

    if (pythonPlan.architecture === 'modular') {
      try {
        const aggregatedDeps = await aggregateAllDependencies(files, 'python');
        if (aggregatedDeps.length > 0) {
          allDependencies = aggregatedDeps;
        }
      } catch (error) {
        logger.warn('Failed to aggregate dependencies, using main file deps only');
      }
    }

    if (allDependencies.length > 0) {
      files.push({
        path: 'requirements.txt',
        content: allDependencies.join('\n'),
      });
    }

    // Add .env.example for configuration
    files.push({
      path: '.env.example',
      content: `# ${idea.title} Environment Configuration\nDEBUG=True\nFLASK_ENV=development\n`,
    });

    // Validate file count
    validateFileCount(files, pythonPlan);

    logger.info('Generated Python web app successfully', {
      framework,
      filesCount: files.length,
      architecture: pythonPlan.architecture,
    });

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: ['python'],
          packages: allDependencies,
        },
        setupInstructions: 'pip install -r requirements.txt',
        runInstructions: framework === 'fastapi'
          ? 'uvicorn app:app --reload'
          : 'python app.py',
        type: 'python',
        outputType: 'web-app',
      },
    };
  } catch (error) {
    logger.error('Failed to generate web app', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * LIBRARY GENERATOR
 */
async function generateLibrary(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // For now, delegate to demo script
  return generateDemoScript(plan, idea);
}

/**
 * DEMO SCRIPT GENERATOR
 *
 * Creates a simple, standalone script demonstrating the idea.
 * For modular architecture, generates supporting modules.
 */
async function generateDemoScript(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // PHASE 1: For modular architecture, generate library modules first
  let moduleFiles: CodeFile[] = [];
  let moduleContext: ModuleContext[] = [];

  const logger = createLogger({
    stage: 'generation-agent',
  });

  if (plan.architecture === 'modular') {
    logger.info('PHASE 1: Generating library modules for modular demo');
    const result = await generateLibraryModules(idea, plan, plan.language);
    moduleFiles = result.files;
    moduleContext = result.moduleContext;
  }

  // PHASE 2: Generate demo script WITH module context
  const model = selectGenerationModel(plan);

  const fileName = plan.language === 'python' ? 'demo.py' : 'demo.js';

  // Format module context for prompt
  const moduleContextSection = formatModuleContextForPrompt(moduleContext, 'demo-script');

  const prompt = `Create a WORKING demo script that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

${moduleContextSection}

Requirements:
- Language: ${plan.language}
- Create fully working code with appropriate complexity for the idea
- Separate concerns into multiple files when it improves maintainability
- Include comprehensive error handling and edge case coverage
- Include clear comments explaining the code
- Make it RUNNABLE as-is (no missing imports, no errors)
- Include example usage that demonstrates all features

CRITICAL: The code MUST:
1. Actually RUN without errors
2. Be complete and self-contained
3. Include all necessary imports
4. Have at least one concrete, working example
5. Follow ${plan.language} best practices
6. Be production-quality with proper error handling

Provide COMPLETE, TESTED-QUALITY code for ${fileName}.

OUTPUT STRUCTURE:
- code: Complete working code as a single string
- requiredPackages: Array of package names (e.g., ["numpy", "requests"])`;

  // Use structured output (guarantees valid JSON)
  const structuredModel = model.withStructuredOutput(DemoScriptSchema);

  try {
    const result = await structuredModel.invoke(prompt);

    // Fallback: if code is missing, skip this generation
    if (!result?.code || result.code.trim().length === 0) {
      logger.warn('No code generated for demo script, skipping');
      return { code: { repoName: '', description: '', files: [], dependencies: { runtime: [], packages: [] }, setupInstructions: '', runInstructions: '', type: plan.language, outputType: 'demo-script' } };
    }

    // Generate SHORT repo name
    const repoName = await generateRepoName(idea, plan);

    // First create the code files (without README)
    const codeFiles: CodeFile[] = [
      ...moduleFiles, // Include library modules if generated
      {
        path: fileName,
        content: result.code,
        language: plan.language,
      },
    ];

    // ⭐ TASK 2: Validate imports if modules are present
    if (moduleContext.length > 0 && plan.language === 'python') {
      const validation = validateModuleImports(result.code, moduleContext);

      if (validation.missingImports.length > 0) {
        logger.warn('Import validation found potential issues', {
          missingImports: validation.missingImports.map(({ module, exports }) => ({
            module: module.fileName,
            exports,
          })),
        });
      }

      if (validation.inlineImplementations.length > 0) {
        logger.warn('Functions that should be imported instead', {
          inlineImplementations: validation.inlineImplementations,
        });
      }

      if (validation.usedModules.length > 0) {
        logger.info('Correctly importing from modules', {
          usedModulesCount: validation.usedModules.length,
        });
      }
    }

    // Now generate AI-powered README with full context
    // Reconstruct the original idea string from title and description
    const ideaString = idea.description
      ? `${idea.title}: ${idea.description}`
      : idea.title;

    const readme = await generateReadme({
      ideaString,
      language: plan.language,
      plan,
      files: codeFiles, // Pass the generated code files for context
      setupInstructions: result?.requiredPackages && result.requiredPackages.length > 0
        ? plan.language === 'python'
          ? 'pip install ' + result.requiredPackages.join(' ')
          : 'npm install ' + result.requiredPackages.join(' ')
        : 'No dependencies required',
      runInstructions: plan.language === 'python' ? `python ${fileName}` : `node ${fileName}`,
    });

    const files: CodeFile[] = [
      ...codeFiles,
      {
        path: 'README.md',
        content: readme,
      },
    ];

    // Add dependencies file if needed
    // ⭐ CRITICAL FIX: Aggregate dependencies from ALL code files (modules + main)
    let allDependencies = result?.requiredPackages || [];

    if (plan.architecture === 'modular') {
      try {
        const aggregatedDeps = await aggregateAllDependencies(codeFiles, plan.language);
        if (aggregatedDeps.length > 0) {
          allDependencies = aggregatedDeps;
          logger.info('Aggregated dependencies', {
            dependencies: aggregatedDeps,
          });
        }
      } catch (error) {
        logger.warn('Failed to aggregate dependencies, using main file deps only', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (allDependencies.length > 0) {
      if (plan.language === 'python') {
        files.push({
          path: 'requirements.txt',
          content: allDependencies.join('\n'),
        });
      }
    }

    // Validate file count matches architectural requirements
    validateFileCount(files, plan);

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: [plan.language === 'python' ? 'python' : 'node'],
          packages: result.requiredPackages || [],
        },
        setupInstructions: result?.requiredPackages && result.requiredPackages.length > 0
          ? plan.language === 'python'
            ? 'pip install -r requirements.txt'
            : 'npm install'
          : 'No setup required',
        runInstructions: plan.language === 'python' ? `python ${fileName}` : `node ${fileName}`,
        type: plan.language === 'python' ? 'python' : 'nodejs',
        outputType: 'demo-script',
      },
    };
  } catch (error) {
    logger.error('Failed to parse demo script generation', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * UTILITY: Generate comprehensive README using AI with Structured Output
 *
 * SCHEMA-DRIVEN APPROACH:
 * 1. Claude generates structured Readme object (not markdown string)
 * 2. Zod validates the structure
 * 3. renderReadmeToMarkdown() converts to markdown deterministically
 *
 * Benefits:
 * - Guaranteed all sections are present
 * - Type-safe: cannot miss required fields
 * - Consistent formatting (renderer controls style)
 * - Easy to extend or change formatting later
 */
async function generateReadme(context: {
  ideaString: string; // Raw user input (e.g., "Build a weather app...")
  language: string;
  plan: CodePlan;
  files: CodeFile[];
  setupInstructions: string;
  runInstructions: string;
}): Promise<string> {
  // Use Claude Sonnet 4.5 for best documentation quality
  const model = new ChatAnthropic({
    modelName: MODEL_USE_CASES.readmeGeneration,
    temperature: 0.3, // Lower for consistency with schema
  });

  // Use structured output to get a Readme object instead of raw string
  const structuredModel = model.withStructuredOutput(ReadmeSchema);

  const filesList = context.files
    .map(f => `- ${f.path} (${f.content.split('\n').length} lines)`)
    .join('\n');

  const prompt = `You are a technical documentation expert. Generate structured README metadata for this project.

## User's Original Idea
${context.ideaString}

## Project Analysis
**Language**: ${context.language}
**Architecture**: ${context.plan.architecture}
**Output Type**: ${context.plan.outputType}

## Generated Code Files
${filesList}

## Setup & Usage
- Setup instructions: ${context.setupInstructions}
- Run instructions: ${context.runInstructions}
- Implementation approach: ${context.plan.implementationSteps?.join(', ') || 'Not specified'}

## Task: Generate Complete README Structure

Create a professional README with all sections filled in. Make sure:

1. **title** - The project name (based on user's idea)
2. **tagline** - One-line catchphrase (10-100 chars)
3. **description** - Longer overview explaining the problem it solves (50-500 chars)
4. **features** - 2-8 key capabilities (each with title and description)
5. **prerequisites** - Required software (0-5 items, e.g., "Python 3.10+")
6. **installationSteps** - Step-by-step setup (1-10 steps with explanations)
7. **usageExamples** - 2-5 concrete code examples showing different features
8. **architecture** - Overview, ASCII diagram, file descriptions, design decisions
9. **technicalDetails** - Dependencies, key algorithms/patterns, important notes
10. **troubleshooting** - 1-5 common issues with causes and solutions
11. **notes** - Optional footer (mention AI-generated if appropriate)

All code examples MUST be valid ${context.language}.
Usage examples MUST have expectedOutput showing what the user will see.
Installation steps MUST include proper prerequisites.

Generate now:`;

  const logger = createLogger({ stage: 'generation-agent' });

  try {
    // Get structured Readme object from Claude
    const readmeData = await structuredModel.invoke(prompt);

    logger.info('Generated structured README', {
      featuresCount: readmeData.features.length,
      installationStepsCount: readmeData.installationSteps.length,
      usageExamplesCount: readmeData.usageExamples.length,
      troubleshootingCount: readmeData.troubleshooting.length,
    });

    // Render structured data to markdown deterministically
    const markdown = renderReadmeToMarkdown(readmeData);

    logger.info('Rendered to markdown', {
      markdownLength: markdown.length,
    });
    return markdown;
  } catch (error) {
    logger.error('README generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback: Create minimal README from available data
    logger.warn('Using minimal fallback README');

    // Extract title from ideaString (first line before colon)
    const titleFromIdea = context.ideaString.split(':')[0] || 'Project';

    return `# ${titleFromIdea}

${context.ideaString}

## Language

${context.language.charAt(0).toUpperCase() + context.language.slice(1)}

## Setup

${context.setupInstructions}

## Usage

${context.runInstructions}

## Files

${filesList}

## Generated by AI

This project was automatically generated from an AI agent pipeline.
`;
  }
}

/**
 * UTILITY: Generate short, descriptive repo name from idea
 *
 * Problem: toKebabCase("Using randomly initialized frozen...") → 120+ chars (too long!)
 * Solution: Extract key concepts and create a concise name (8-20 chars ideal)
 */
async function generateRepoName(
  idea: { title: string; description: string | null },
  plan: CodePlan
): Promise<string> {
  // Use GPT-5 nano - fastest and most affordable for simple tasks
  const model = new ChatOpenAI({
    modelName: MODEL_USE_CASES.repoNaming,
    // Note: GPT-5 nano only supports default temperature (1)
  });

  const prompt = `Create a SHORT, descriptive GitHub repository name for this project.

IDEA: ${idea.title}
${idea.description ? `Description: ${idea.description}` : ''}
Type: ${plan.outputType}
Language: ${plan.language}

REQUIREMENTS:
- Keep it SHORT (8-20 characters ideal, max 30)
- Use kebab-case (lowercase with hyphens)
- Be DESCRIPTIVE but CONCISE
- Focus on the main concept, not all details
- Make it memorable and clear

EXAMPLES:
✅ GOOD: "neural-views", "contrastive-ml", "frozen-layers"
❌ BAD: "using-randomly-initialized-frozen-neural-network-layers-as-different-views"

Respond with ONLY the repo name, nothing else:`;

  const logger = createLogger({ stage: 'generation-agent' });

  try {
    const response = await model.invoke(prompt);
    let repoName = response.content.toString().trim();

    // Clean up the response (remove quotes, extra text)
    repoName = repoName.replace(/^["'`]|["'`]$/g, ''); // Remove quotes
    repoName = repoName.split('\n')[0]; // Take first line only
    repoName = repoName.toLowerCase();
    repoName = repoName.replace(/[^a-z0-9-]/g, ''); // Only lowercase, numbers, hyphens

    // Fallback if still too long (truncate intelligently)
    if (repoName.length > 35) {
      const parts = repoName.split('-');
      repoName = parts.slice(0, 3).join('-'); // Take first 3 words
    }

    // Final fallback
    if (!repoName || repoName.length < 3) {
      repoName = toKebabCase(idea.title).substring(0, 30);
    }

    logger.info('Generated repo name', { repoName });
    return repoName;
  } catch (error) {
    logger.warn('Repo name generation failed, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return toKebabCase(idea.title).substring(0, 30);
  }
}

/**
 * UTILITY: Convert title to kebab-case for repo names (FALLBACK ONLY)
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
