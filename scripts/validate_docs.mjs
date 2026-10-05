#!/usr/bin/env node

/**
 * docs7 Documentation Validator (Portable)
 * Validates docs.json, page inventory, navigation consistency,
 * frontmatter completeness, and Mermaid strict-mode compliance.
 *
 * Usage:
 *   node scripts/validate_docs.mjs [path-to-docs-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const targetDir = path.resolve(process.argv[2] || './docs');

let errorCount = 0;
let warnCount = 0;

function logPass(msg) {
  console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
}

function logFail(msg) {
  errorCount++;
  console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
}

function logWarn(msg) {
  warnCount++;
  console.warn(`\x1b[33m[WARN]\x1b[0m ${msg}`);
}

function logInfo(msg) {
  console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);
}

if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
  logFail(`Target directory does not exist: ${targetDir}`);
  process.exit(1);
}

logInfo(`Validating docs7 documentation at: ${targetDir}`);

// 1. Check docs.json
const configPath = path.join(targetDir, 'docs.json');
let config = null;

if (!fs.existsSync(configPath)) {
  logFail(`docs.json is missing in ${targetDir}`);
} else {
  try {
    let raw = fs.readFileSync(configPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    config = JSON.parse(raw);
    logPass('docs.json is valid JSON');

    if (!config.name) {
      logWarn('docs.json is missing "name" field');
    }

    if (!config.colors || typeof config.colors !== 'object') {
      logFail('docs.json is missing required "colors" object (e.g. { "primary": "#009688" }). docs7 dev will fail to start!');
    } else if (!config.colors.primary) {
      logFail('docs.json "colors" object must have at least "primary" defined');
    } else {
      logPass('docs.json "colors" configuration is present');
    }

    if (config.filterSidebar !== true) {
      logWarn('docs.json does not have "filterSidebar": true. Adding "filterSidebar": true is recommended for fast local search/filtering in the sidebar navigation.');
    } else {
      logPass('docs.json "filterSidebar": true is enabled');
    }

    if (!config.navigation || !Array.isArray(config.navigation.groups)) {
      logFail('docs.json is missing "navigation.groups" array');
    } else {
      logPass(`docs.json navigation groups found (${config.navigation.groups.length} groups)`);
    }
  } catch (err) {
    logFail(`docs.json failed to parse: ${err.message}`);
  }
}

// 2. Discover all .mdx files
function scanMdxFiles(dir, baseDir = dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanMdxFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const slug = relPath.replace(/\.mdx$/, '');
      results.push({ fullPath, relPath, slug });
    }
  }
  return results;
}

const mdxFiles = scanMdxFiles(targetDir);
logInfo(`Found ${mdxFiles.length} .mdx page(s) on disk`);

// 3. Navigation Consistency & Orphan Check
const declaredSlugs = new Set();
if (config && config.navigation && Array.isArray(config.navigation.groups)) {
  for (const group of config.navigation.groups) {
    if (Array.isArray(group.pages)) {
      for (const pageSlug of group.pages) {
        declaredSlugs.add(pageSlug);
      }
    }
  }

  // Check for orphans (files on disk not in docs.json)
  for (const mdx of mdxFiles) {
    if (!declaredSlugs.has(mdx.slug)) {
      logFail(`Orphan page: "${mdx.relPath}" (slug "${mdx.slug}") is not declared in navigation.groups`);
    }
  }

  // Check for dangling nav entries (declared in docs.json but missing on disk)
  const diskSlugs = new Set(mdxFiles.map(f => f.slug));
  for (const slug of declaredSlugs) {
    if (!diskSlugs.has(slug)) {
      logFail(`Dangling navigation slug: "${slug}" is declared in docs.json but no corresponding .mdx file exists`);
    }
  }

  if (mdxFiles.length > 0 && errorCount === 0) {
    logPass('All .mdx pages and navigation slugs match perfectly (0 orphans, 0 dangling)');
  }
}

// 4. Frontmatter and Mermaid Strict-Mode Audit
const mermaidFenceRegex = /```mermaid\r?\n([\s\S]*?)```/g;

for (const mdx of mdxFiles) {
  const content = fs.readFileSync(mdx.fullPath, 'utf8');

  // Check Frontmatter
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    logFail(`[${mdx.relPath}] Missing YAML frontmatter block (--- ... ---)`);
  } else {
    const fmText = frontmatterMatch[1];
    const hasTitle = /^title\s*:/m.test(fmText);
    const hasDesc = /^description\s*:/m.test(fmText);

    if (!hasTitle) {
      logFail(`[${mdx.relPath}] Frontmatter missing required "title" attribute`);
    }
    if (!hasDesc) {
      logFail(`[${mdx.relPath}] Frontmatter missing required "description" attribute`);
    }
  }

  // Check for H1
  if (!/^#\s+.+/m.test(content)) {
    logWarn(`[${mdx.relPath}] Missing markdown H1 header (# Title) in body`);
  }

  // Audit Mermaid Blocks
  let match;
  let diagramIndex = 0;
  mermaidFenceRegex.lastIndex = 0;

  while ((match = mermaidFenceRegex.exec(content)) !== null) {
    diagramIndex++;
    const blockContent = match[1];
    const lines = blockContent.split(/\r?\n/);

    // Rule: No blank lines inside mermaid block
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '' && i > 0 && i < lines.length - 1) {
        logFail(`[${mdx.relPath} | diagram ${diagramIndex}] Contains blank line at line ${i + 1} inside mermaid fence. Docs7 strict mode may hang!`);
      }
    }

    // Rule: No %% comments
    if (/^\s*%%/m.test(blockContent)) {
      logFail(`[${mdx.relPath} | diagram ${diagramIndex}] Contains "%%" comment. Docs7 strict mode can fail or hang!`);
    }

    // Rule: No <br> or <br/> in node labels
    if (/<br\s*\/?>/i.test(blockContent)) {
      logFail(`[${mdx.relPath} | diagram ${diagramIndex}] Contains HTML "<br>" tag in label. Use " - " instead.`);
    }

    // Rule: Subgraphs must have quoted titles and no unquoted brackets
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('subgraph')) {
        if (/subgraph\s+\w+\s*\[/i.test(line) && !/subgraph\s+\w+\[".*?"\]/i.test(line)) {
          logFail(`[${mdx.relPath} | diagram ${diagramIndex}] Subgraph on line ${i + 1} uses unquoted brackets. Use: subgraph ID["Title"]`);
        }
        if (/\[.*\[.*\].*\]/.test(line)) {
          logFail(`[${mdx.relPath} | diagram ${diagramIndex}] Subgraph title on line ${i + 1} contains nested brackets.`);
        }
      }
    }
  }

  // Audit for raw ASCII directory trees in code blocks
  if (/```[\w-]*\r?\n[\s\S]*?(├──|└──)[\s\S]*?```/.test(content)) {
    logWarn(`[${mdx.relPath}] Contains plain-text ASCII directory tree (├──/└──). Use native <Tree> / <Tree.Folder> / <Tree.File> components instead!`);
  }
}

// 5. CSS Check for diagram frame widening
function checkForCustomCss(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (checkForCustomCss(fullPath)) return true;
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      const cssContent = fs.readFileSync(fullPath, 'utf8');
      if (cssContent.includes('.mermaid-frame')) {
        return true;
      }
    }
  }
  return false;
}

const hasWideningCss = checkForCustomCss(targetDir);
if (hasWideningCss) {
  logPass('Diagram frame widening CSS (.mermaid-frame) detected');
} else {
  logWarn('No custom CSS found widening .mermaid-frame. Diagrams wider than 595px may scale down and become illegible.');
}

// Summary
console.log('\n----------------------------------------');
if (errorCount === 0) {
  console.log(`\x1b[32mValidation passed!\x1b[0m ${warnCount} warning(s), 0 error(s).`);
  process.exit(0);
} else {
  console.error(`\x1b[31mValidation failed!\x1b[0m ${errorCount} error(s), ${warnCount} warning(s).`);
  process.exit(1);
}
