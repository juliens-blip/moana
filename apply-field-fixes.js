/**
 * Automated Field Name Fix Script
 *
 * This script automatically applies all field name corrections
 * identified in the MCP integration testing.
 *
 * Run with: node apply-field-fixes.js
 */

const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   Automated Field Name Fix Script                         ║');
console.log('║   Moana Yachting - MCP Integration Fixes                   ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Track changes
const changes = [];

/**
 * Apply fix to a file
 */
function applyFix(filePath, replacements) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return false;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let changeCount = 0;

    // Apply each replacement
    replacements.forEach(({ find, replace, description }) => {
      const regex = new RegExp(find, 'g');
      const matches = content.match(regex);

      if (matches) {
        content = content.replace(regex, replace);
        changeCount += matches.length;
        changes.push({
          file: path.basename(filePath),
          description,
          count: matches.length
        });
      }
    });

    if (content !== originalContent) {
      // Create backup
      fs.writeFileSync(`${filePath}.backup`, originalContent);
      // Write updated content
      fs.writeFileSync(filePath, content);
      console.log(`✓ Updated ${path.basename(filePath)} (${changeCount} changes)`);
      return true;
    } else {
      console.log(`⚠ No changes needed in ${path.basename(filePath)}`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Fix lib/types.ts
 */
function fixTypes() {
  console.log('\n--- Fixing lib/types.ts ---');

  const filePath = path.join(__dirname, 'lib', 'types.ts');

  const replacements = [
    {
      find: `'Prix'\\?:\\s*number;\\s*\\/\\/\\s*Optional - in EUR`,
      replace: `'Prix Actuel (€/\\$)'?: string; // Optional - current price (stored as text in Airtable)`,
      description: 'Updated Prix field to Prix Actuel (€/$) with string type'
    },
    {
      find: `'Prix précédent'\\?:\\s*number;\\s*\\/\\/\\s*Optional - previous price in EUR`,
      replace: `'Prix Précédent (€/\\$)'?: string; // Optional - previous price (stored as select in Airtable)`,
      description: 'Updated Prix précédent field to Prix Précédent (€/$) with string type'
    }
  ];

  return applyFix(filePath, replacements);
}

/**
 * Fix lib/airtable/listings.ts
 */
function fixListings() {
  console.log('\n--- Fixing lib/airtable/listings.ts ---');

  const filePath = path.join(__dirname, 'lib', 'airtable', 'listings.ts');

  const replacements = [
    // Fix all field retrieval references
    {
      find: `'Prix':\\s*\\(record\\.get\\('Prix'\\)[^)]*\\)\\s*as\\s*number\\s*\\|\\s*undefined,`,
      replace: `'Prix Actuel (€/\\$)': (record.get('Prix Actuel (€/\\$)') || undefined) as string | undefined,\n    'Prix Précédent (€/\\$)': (record.get('Prix Précédent (€/\\$)') || undefined) as string | undefined,\n    'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,\n    'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,`,
      description: 'Updated field retrieval in all listing functions'
    },
    // Fix createListing field assignment
    {
      find: `if \\(data\\.prix !== undefined\\) \\{\\s*fields\\['Prix'\\] = data\\.prix;\\s*\\}`,
      replace: `if (data.prixActuel !== undefined) {\n    fields['Prix Actuel (€/\\$)'] = data.prixActuel;\n  }\n  if (data.prixPrecedent !== undefined) {\n    fields['Prix Précédent (€/\\$)'] = data.prixPrecedent;\n  }\n  if (data.dernierMessage !== undefined) {\n    fields['Dernier message'] = data.dernierMessage;\n  }\n  if (data.commentaire !== undefined) {\n    fields['Commentaire'] = data.commentaire;\n  }`,
      description: 'Updated createListing field assignments'
    },
    // Fix updateListing field assignment
    {
      find: `if \\(data\\.prix !== undefined\\) updates\\['Prix'\\] = data\\.prix;`,
      replace: `if (data.prixActuel !== undefined) updates['Prix Actuel (€/\\$)'] = data.prixActuel;\n  if (data.prixPrecedent !== undefined) updates['Prix Précédent (€/\\$)'] = data.prixPrecedent;\n  if (data.dernierMessage !== undefined) updates['Dernier message'] = data.dernierMessage;\n  if (data.commentaire !== undefined) updates['Commentaire'] = data.commentaire;`,
      description: 'Updated updateListing field assignments'
    }
  ];

  return applyFix(filePath, replacements);
}

/**
 * Fix lib/airtable/filters.ts
 */
function fixFilters() {
  console.log('\n--- Fixing lib/airtable/filters.ts ---');

  const filePath = path.join(__dirname, 'lib', 'airtable', 'filters.ts');

  const replacements = [
    {
      find: `AND\\(NOT\\(\\{Prix\\} = BLANK\\(\\)\\), \\{Prix\\} >= \\$\\{filters\\.minPrix\\}\\)`,
      replace: `AND(NOT({Prix Actuel (€/\\$)} = BLANK()), {Prix Actuel (€/\\$)} != "N/A", VALUE({Prix Actuel (€/\\$)}) >= \\${filters.minPrix})`,
      description: 'Updated minPrix filter formula'
    },
    {
      find: `AND\\(NOT\\(\\{Prix\\} = BLANK\\(\\)\\), \\{Prix\\} <= \\$\\{filters\\.maxPrix\\}\\)`,
      replace: `AND(NOT({Prix Actuel (€/\\$)} = BLANK()), {Prix Actuel (€/\\$)} != "N/A", VALUE({Prix Actuel (€/\\$)}) <= \\${filters.maxPrix})`,
      description: 'Updated maxPrix filter formula'
    }
  ];

  return applyFix(filePath, replacements);
}

/**
 * Fix lib/validations.ts
 */
function fixValidations() {
  console.log('\n--- Fixing lib/validations.ts ---');

  const filePath = path.join(__dirname, 'lib', 'validations.ts');

  const replacements = [
    {
      find: `prix: z\\.number\\([^)]+\\)[^,]+,`,
      replace: `prixActuel: z.string().max(50, 'Le prix est trop long').optional(),`,
      description: 'Updated prix validation to prixActuel string'
    },
    {
      find: `prixPrecedent: z\\.number\\([^)]+\\)[^,]+,`,
      replace: `prixPrecedent: z.string().max(50, 'Le prix précédent est trop long').optional(),`,
      description: 'Updated prixPrecedent validation to string'
    }
  ];

  return applyFix(filePath, replacements);
}

/**
 * Fix components/listings/ListingCard.tsx
 */
function fixListingCard() {
  console.log('\n--- Fixing components/listings/ListingCard.tsx ---');

  const filePath = path.join(__dirname, 'components', 'listings', 'ListingCard.tsx');

  const replacements = [
    {
      find: `\\{fields\\.Prix && \\(`,
      replace: `{fields['Prix Actuel (€/\\$)'] && fields['Prix Actuel (€/\\$)'] !== 'N/A' && (`,
      description: 'Updated price field check'
    },
    {
      find: `<span>\\{formatNumber\\(fields\\.Prix, 0\\)\\} €</span>`,
      replace: `<span>{fields['Prix Actuel (€/\\$)']}</span>`,
      description: 'Updated price display (removed formatNumber)'
    }
  ];

  return applyFix(filePath, replacements);
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting automated field name fixes...\n');
  console.log('⚠️  Backups will be created with .backup extension\n');

  const results = {
    success: 0,
    failed: 0,
    total: 0
  };

  // Apply all fixes
  const fixes = [
    { name: 'types.ts', fn: fixTypes },
    { name: 'listings.ts', fn: fixListings },
    { name: 'filters.ts', fn: fixFilters },
    { name: 'validations.ts', fn: fixValidations },
    { name: 'ListingCard.tsx', fn: fixListingCard }
  ];

  for (const fix of fixes) {
    results.total++;
    if (fix.fn()) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    FIX SUMMARY                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Files Processed: ${results.total}`);
  console.log(`Successfully Updated: ${results.success}`);
  console.log(`Failed: ${results.failed}\n`);

  if (changes.length > 0) {
    console.log('--- Changes Applied ---\n');
    changes.forEach(change => {
      console.log(`${change.file}:`);
      console.log(`  ${change.description} (${change.count} occurrences)\n`);
    });
  }

  console.log('\n--- Next Steps ---');
  console.log('1. Review the changes in each file');
  console.log('2. Run: npm run type-check');
  console.log('3. Run: node mcp-integration-test.js');
  console.log('4. Test the application manually');
  console.log('5. If issues occur, restore from .backup files\n');

  console.log('Backup files created:');
  console.log('  lib/types.ts.backup');
  console.log('  lib/airtable/listings.ts.backup');
  console.log('  lib/airtable/filters.ts.backup');
  console.log('  lib/validations.ts.backup');
  console.log('  components/listings/ListingCard.tsx.backup\n');

  if (results.failed > 0) {
    console.log('⚠️  Some fixes failed. Please review manually.');
    process.exit(1);
  } else {
    console.log('✓ All fixes applied successfully!');
    process.exit(0);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
