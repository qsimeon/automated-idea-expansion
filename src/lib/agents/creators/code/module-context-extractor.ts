/**
 * MODULE CONTEXT EXTRACTOR
 *
 * Extracts function/class signatures from generated module files using
 * structured LLM output. This enables notebook and CLI generators to:
 * 1. Know what functions are available in modules
 * 2. Generate imports instead of duplicating code
 * 3. Compose modules together cleanly
 *
 * Philosophy: Use LLM with structured output (Zod) for precise extraction.
 * No regex parsing - let the LLM do the semantic understanding.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';
import type { CodeFile } from './types';

/**
 * EXPORT SIGNATURE SCHEMA
 *
 * Represents a single exportable item from a module (function, class, constant)
 */
export const ExportSignatureSchema = z.object({
  type: z.enum(['function', 'class', 'constant']).describe(
    'Type of export: function, class, or constant'
  ),
  name: z.string().describe('Name of the function, class, or constant'),
  signature: z.string().describe(
    'Full signature with parameters and return type (e.g., "def calculate_energy(x: float, y: float) -> float")'
  ),
  docstring: z.string().nullable().describe(
    'First line of docstring or comment describing the export, if available'
  ),
  isClass: z.boolean().optional().describe('True if this is a class'),
  methods: z.array(z.object({
    name: z.string().describe('Method name'),
    signature: z.string().describe('Method signature'),
  })).optional().describe('Public methods if this is a class'),
});

export type ExportSignature = z.infer<typeof ExportSignatureSchema>;

/**
 * MODULE CONTEXT SCHEMA
 *
 * All exports from a single module file
 */
export const ModuleContextSchema = z.object({
  fileName: z.string().describe('File path (e.g., "energy_calc.py")'),
  moduleName: z.string().describe('Module name without extension (e.g., "energy_calc")'),
  language: z.string().describe('Programming language (python, javascript, typescript)'),
  exports: z.array(ExportSignatureSchema).describe(
    'All function, class, and constant exports from this module'
  ),
});

export type ModuleContext = z.infer<typeof ModuleContextSchema>;

/**
 * Extract module signatures from generated files using structured LLM output
 *
 * @param moduleFiles - Array of CodeFile objects to extract signatures from
 * @param language - Programming language ('python', 'javascript', 'typescript')
 * @returns Array of ModuleContext objects with extracted signatures
 *
 * Example:
 * ```typescript
 * const modules = await extractModuleSignatures([
 *   { path: 'calc.py', content: 'def add(x, y): return x + y' }
 * ], 'python');
 * // Returns: [{ fileName: 'calc.py', moduleName: 'calc', exports: [...] }]
 * ```
 */
export async function extractModuleSignatures(
  moduleFiles: CodeFile[],
  language: string
): Promise<ModuleContext[]> {
  if (moduleFiles.length === 0) {
    return [];
  }

  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0, // Deterministic extraction
  });

  const structuredModel = model.withStructuredOutput(ModuleContextSchema);

  const results: ModuleContext[] = [];

  for (const file of moduleFiles) {
    try {
      const prompt = buildExtractionPrompt(file, language);
      const extracted = await structuredModel.invoke(prompt);

      results.push({
        ...extracted,
        fileName: file.path,
        moduleName: extractModuleName(file.path),
        language,
      });

      console.log(
        `   ✅ Extracted ${extracted.exports.length} exports from ${file.path}`
      );
    } catch (error) {
      console.warn(
        `   ⚠️  Failed to extract signatures from ${file.path}:`,
        error instanceof Error ? error.message : String(error)
      );
      // Continue with empty exports rather than failing
      results.push({
        fileName: file.path,
        moduleName: extractModuleName(file.path),
        language,
        exports: [],
      });
    }
  }

  return results;
}

/**
 * Format module context for prompt injection
 *
 * Creates a human-readable section that can be added to generator prompts
 * to inform the LLM about available modules.
 *
 * @param modules - Array of ModuleContext objects
 * @param artifactType - Type of artifact being generated (notebook, cli-app, etc)
 * @returns Formatted string suitable for prompt injection
 *
 * Example output:
 * ```
 * IMPORTANT - AVAILABLE MODULES IN THIS REPOSITORY:
 * This project includes Python module files that you MUST import from.
 * DO NOT reimplement these functions inline - use imports instead!
 *
 * Available modules:
 *   - energy_calc.py: calculate_energy, validate_input
 *   - utils.py: format_output, plot_results
 *
 * Example imports (use these):
 * from energy_calc import calculate_energy, validate_input
 * from utils import format_output, plot_results
 *
 * ...detailed signatures...
 * ```
 */
export function formatModuleContextForPrompt(
  modules: ModuleContext[],
  artifactType: 'notebook' | 'cli-app' | 'web-app' | 'demo-script' | 'library' = 'notebook'
): string {
  if (modules.length === 0) {
    return '';
  }

  // Summary of available modules
  const moduleList = modules
    .map(m => {
      const exportNames = m.exports.map(e => e.name).join(', ');
      return `  - ${m.fileName}: ${exportNames || '(no exports)'}`;
    })
    .join('\n');

  // Example imports
  const exampleImports = modules
    .filter(m => m.exports.length > 0)
    .map(m => {
      const imports = m.exports
        .slice(0, 3)
        .map(e => e.name)
        .join(', ');

      const moduleName = m.moduleName;
      if (m.language === 'python') {
        return `from ${moduleName} import ${imports}`;
      } else {
        return `import { ${imports} } from './${moduleName}'`;
      }
    })
    .join('\n');

  // Detailed module information with signatures
  const detailedModules = modules
    .map(m => {
      const exports = m.exports
        .map(e => {
          const lines = [`  - ${e.signature}`];
          if (e.docstring) {
            lines.push(`    ${e.docstring}`);
          }
          if (e.methods && e.methods.length > 0) {
            lines.push(`    Methods: ${e.methods.map(m => m.name).join(', ')}`);
          }
          return lines.join('\n');
        })
        .join('\n');

      return `Module: ${m.fileName}
${exports}`;
    })
    .join('\n\n');

  return `
===== AVAILABLE MODULES IN THIS REPOSITORY =====

This project includes ${modules[0]?.language || 'code'} module files that you MUST import from.
DO NOT reimplement these functions inline - use imports instead!

Available modules:
${moduleList}

Example imports (use these in your ${artifactType}):
${exampleImports}

Detailed signatures:
${detailedModules}

CRITICAL REQUIREMENTS:
1. Your ${artifactType} MUST import and use these modules
2. DO NOT reimplement functions that are already in modules
3. For functions in modules, ONLY use imports
4. This reduces code duplication and improves maintainability
5. If a module function exists, use it - don't write your own version

===== END AVAILABLE MODULES =====
`;
}

/**
 * BUILD EXTRACTION PROMPT
 *
 * Constructs a prompt that instructs the LLM to extract signatures
 * from module code. Uses language-specific guidance.
 */
function buildExtractionPrompt(file: CodeFile, language: string): string {
  const languageGuide =
    language === 'python'
      ? `
Python extractions should identify:
- Function definitions (def keyword)
- Class definitions (class keyword)
- Module-level constants (UPPERCASE names)
Include function signatures with type hints if available.`
      : `
JavaScript/TypeScript extractions should identify:
- Exported functions (export function or export const)
- Exported classes (export class)
- Exported constants (export const)
Include parameter types and return types if available.`;

  return `Extract all exportable symbols from this ${language} module file.

File: ${file.path}

Code:
\`\`\`${language}
${file.content}
\`\`\`

${languageGuide}

For each export, provide:
1. Type: function, class, or constant
2. Name: exact identifier name
3. Signature: full signature with parameters and types
4. Docstring: first line of docstring/comment if available
5. For classes: list of public methods

Return structured JSON with all exports.`;
}

/**
 * EXTRACT MODULE NAME from file path
 *
 * Converts file paths to module names:
 * - "energy_calc.py" → "energy_calc"
 * - "src/utils.js" → "utils"
 * - "lib/helpers.ts" → "helpers"
 */
function extractModuleName(filePath: string): string {
  // Get just the filename
  const filename = filePath.split('/').pop() || filePath;

  // Remove extension
  return filename.replace(/\.(py|js|ts|tsx|jsx)$/, '');
}

/**
 * FORMAT IMPORT STATEMENT for a specific module
 *
 * Helper to generate correct import syntax based on language
 *
 * @param module - Module context
 * @param exportNames - Specific exports to import (defaults to all)
 * @returns Import statement string
 */
export function formatImportStatement(
  module: ModuleContext,
  exportNames?: string[]
): string {
  const exports = exportNames || module.exports.map(e => e.name);

  if (exports.length === 0) {
    return '';
  }

  const exportList = exports.join(', ');

  if (module.language === 'python') {
    return `from ${module.moduleName} import ${exportList}`;
  } else {
    // JavaScript/TypeScript
    return `import { ${exportList} } from './${module.moduleName}'`;
  }
}

/**
 * VALIDATE IMPORTS IN GENERATED CODE
 *
 * Checks if generated code imports from available modules
 * (used by critic agent for code review)
 *
 * @param code - Generated code string
 * @param modules - Available modules
 * @returns Object with validation results
 */
export function validateModuleImports(
  code: string,
  modules: ModuleContext[]
): {
  usedModules: ModuleContext[];
  missingImports: Array<{ module: ModuleContext; exports: string[] }>;
  inlineImplementations: string[];
} {
  const usedModules: ModuleContext[] = [];
  const missingImports: Array<{ module: ModuleContext; exports: string[] }> = [];
  const inlineImplementations: string[] = [];

  for (const module of modules) {
    for (const exp of module.exports) {
      // Check if this export is used in the code
      if (code.includes(exp.name)) {
        // Check if it's imported
        const importPattern =
          module.language === 'python'
            ? new RegExp(`from\\s+${module.moduleName}\\s+import\\s+.*${exp.name}`)
            : new RegExp(`import\\s+{[^}]*${exp.name}[^}]*}\\s+from`);

        if (importPattern.test(code)) {
          // Good - it's imported
          if (!usedModules.includes(module)) {
            usedModules.push(module);
          }
        } else {
          // Bad - it's used but not imported, likely an inline implementation
          if (!inlineImplementations.includes(exp.name)) {
            inlineImplementations.push(exp.name);
          }

          // Track missing import
          const existing = missingImports.find(m => m.module === module);
          if (existing) {
            if (!existing.exports.includes(exp.name)) {
              existing.exports.push(exp.name);
            }
          } else {
            missingImports.push({
              module,
              exports: [exp.name],
            });
          }
        }
      }
    }
  }

  return {
    usedModules,
    missingImports,
    inlineImplementations,
  };
}
