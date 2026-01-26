import type { Readme } from './readme-schema';

/**
 * README RENDERER
 *
 * Converts structured Readme schema → clean markdown string
 *
 * This is deterministic: same Readme object always produces identical markdown.
 * Makes it easy to change styling later without touching Claude's schema.
 */

export function renderReadmeToMarkdown(readme: Readme): string {
  const sections: string[] = [];

  // ===== HEADER =====
  sections.push(`# ${readme.title}`);
  sections.push('');
  sections.push(`> ${readme.tagline}`);
  sections.push('');
  sections.push(readme.description);

  // ===== FEATURES =====
  if (readme.features.length > 0) {
    sections.push('');
    sections.push('## ✨ Features');
    sections.push('');
    for (const feature of readme.features) {
      sections.push(`- **${feature.title}** — ${feature.description}`);
    }
  }

  // ===== INSTALLATION =====
  sections.push('');
  sections.push('## 📦 Installation');
  sections.push('');

  if (readme.prerequisites.length > 0) {
    sections.push('### Prerequisites');
    sections.push('');
    for (const prereq of readme.prerequisites) {
      sections.push(`- ${prereq}`);
    }
    sections.push('');
  }

  sections.push('### Setup');
  sections.push('');
  for (const step of readme.installationSteps) {
    sections.push(`${step.stepNumber}. ${step.instruction}`);
    if (step.explanation) {
      sections.push(`   - ${step.explanation}`);
    }
  }

  // ===== USAGE =====
  sections.push('');
  sections.push('## 🚀 Usage');
  sections.push('');
  for (const example of readme.usageExamples) {
    sections.push(`### ${example.title}`);
    sections.push('');
    sections.push(example.description);
    sections.push('');
    sections.push('```');
    sections.push(example.code);
    sections.push('```');
    if (example.expectedOutput) {
      sections.push('');
      sections.push('**Output:**');
      sections.push('');
      sections.push('```');
      sections.push(example.expectedOutput);
      sections.push('```');
    }
    sections.push('');
  }

  // ===== ARCHITECTURE =====
  sections.push('## 🏗️ Architecture');
  sections.push('');
  sections.push(readme.architecture.overview);
  sections.push('');
  sections.push('### File Structure');
  sections.push('');
  sections.push('```');
  sections.push(readme.architecture.diagram);
  sections.push('```');
  sections.push('');

  if (readme.architecture.files.length > 0) {
    sections.push('### Files');
    sections.push('');
    for (const file of readme.architecture.files) {
      sections.push(`- **${file.path}** — ${file.purpose}`);
    }
    sections.push('');
  }

  if (readme.architecture.designDecisions.length > 0) {
    sections.push('### Design Decisions');
    sections.push('');
    for (const decision of readme.architecture.designDecisions) {
      sections.push(`- ${decision}`);
    }
    sections.push('');
  }

  // ===== TECHNICAL DETAILS =====
  sections.push('## 🔧 Technical Details');
  sections.push('');

  if (readme.technicalDetails.dependencies.length > 0) {
    sections.push('### Dependencies');
    sections.push('');
    for (const dep of readme.technicalDetails.dependencies) {
      const versionStr = dep.version ? ` (${dep.version})` : '';
      sections.push(`- **${dep.name}**${versionStr} — ${dep.purpose}`);
    }
    sections.push('');
  }

  if (readme.technicalDetails.keyAlgorithms && readme.technicalDetails.keyAlgorithms.length > 0) {
    sections.push('### Key Algorithms / Patterns');
    sections.push('');
    for (const algo of readme.technicalDetails.keyAlgorithms) {
      sections.push(`- ${algo}`);
    }
    sections.push('');
  }

  if (readme.technicalDetails.importantNotes && readme.technicalDetails.importantNotes.length > 0) {
    sections.push('### Important Notes');
    sections.push('');
    for (const note of readme.technicalDetails.importantNotes) {
      sections.push(`- ${note}`);
    }
    sections.push('');
  }

  // ===== TROUBLESHOOTING =====
  if (readme.troubleshooting.length > 0) {
    sections.push('## ❓ Troubleshooting');
    sections.push('');
    for (const ts of readme.troubleshooting) {
      sections.push(`### ${ts.problem}`);
      sections.push('');
      sections.push(`**Cause:** ${ts.cause}`);
      sections.push('');
      sections.push(`**Solution:** ${ts.solution}`);
      sections.push('');
    }
  }

  // ===== FOOTER =====
  if (readme.notes) {
    sections.push('---');
    sections.push('');
    sections.push(readme.notes);
    sections.push('');
  }

  return sections.join('\n').trim();
}

/**
 * Alternative: Render to JSON (for debugging or API responses)
 */
export function renderReadmeToJSON(readme: Readme): string {
  return JSON.stringify(readme, null, 2);
}

/**
 * Alternative: Render to HTML (for web display)
 *
 * Note: This is a simple implementation. For production, use a markdown → HTML library.
 */
export function renderReadmeToHTML(readme: Readme): string {
  // This is a placeholder - in production you'd use markdown-it or similar
  const markdown = renderReadmeToMarkdown(readme);
  // Simple replacement (not proper markdown parsing):
  let html = markdown
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^```(.*?)$[\s\S]*?^```$/gm, '<pre><code>$&</code></pre>');

  return `<div class="readme">${html}</div>`;
}
