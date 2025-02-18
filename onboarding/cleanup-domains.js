#!/usr/bin/env node
/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/*
1. Duplicates (so each domain only appears once).
2. Obvious noise like:
• IP addresses (e.g. 52.142.228.244, 7.5.7.8, etc.).
• Hostnames without a “.” or TLD (e.g. localhost, internal-service, etc.).
• Strings with invalid domain characters or suspicious short patterns.
*/

import fs from 'node:fs';
import csvParser from 'csv-parser';
import { stringify } from 'csv-stringify';
import { program } from 'commander';

// ------------------------------------
// CONFIG
// ------------------------------------
program
  .requiredOption('-i, --input <path>', 'Path to the domain list CSV file')
  .requiredOption('-o, --output <path>', 'Path to the output CSV file');

program.parse(process.argv);

const options = program.opts();
const INPUT_CSV = options.input;
const OUTPUT_CSV = options.output;

// --------------------------------------------------
// 1. Read domainlist.csv => gather lines in memory
// --------------------------------------------------
async function loadDomains() {
  return new Promise((resolve, reject) => {
    const domains = [];
    fs.createReadStream(INPUT_CSV)
      .pipe(csvParser({ headers: false }))
      .on('data', (row) => {
        const domain = Object.values(row)[0]?.trim();
        if (domain) domains.push(domain.toLowerCase());
      })
      .on('end', () => resolve(domains))
      .on('error', (err) => reject(err));
  });
}

// --------------------------------------------------
// 2. Filter out "noise"
// --------------------------------------------------

// Regex to detect a 4-part IPv4 address like "52.142.228.244"
const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/i;

// A simple domain-ish pattern check
// - Must contain at least one '.' and end in 2+ letters
// - We exclude underscores, spaces, and non-standard domain characters
// - This is a simple approximation, not a perfect domain validator:
const DOMAIN_REGEX = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

// We'll do a final TLD check: The last dot segment must have at least 2 letters
function endsWithValidTLD(domain) {
  // e.g. 'example.com' => last piece is 'com' (3 letters)
  const parts = domain.split('.');
  const tld = parts[parts.length - 1];
  // Minimal TLD length = 2 letters. If you want to allow .io, .ai, .co etc.
  // This is typical for "real" TLDs, though .x might appear
  // (you can adjust if you want a bigger or smaller min length).
  return /^[a-z]{2,}$/i.test(tld);
}

/**
 * Returns true if domain is "real-sounding" by these heuristics:
 *  1. Not an IP address
 *  2. Passes a domain pattern (letters/digits/hyphens + dots)
 *  3. Ends in a TLD of >=2 letters
 *  4. Not "too short" (like "a.co" can be valid though)
 */
function isValidDomain(domain) {
  if (!domain || IP_REGEX.test(domain)) return false;
  if (!DOMAIN_REGEX.test(domain)) return false;
  if (!endsWithValidTLD(domain)) return false;
  if (!domain.startsWith('www.')) return false;
  return true;
}

// --------------------------------------------------
// 3. Write results
// --------------------------------------------------
async function writeDomains(domains) {
  return new Promise((resolve, reject) => {
    // We'll use csv-stringify to write each domain on its own line
    const output = fs.createWriteStream(OUTPUT_CSV);
    const stringifier = stringify({
      header: false, // we want just lines, no header
    });
    stringifier.on('error', (err) => reject(err));
    stringifier.pipe(output);

    domains.forEach((domain) => {
      stringifier.write([domain]);
    });

    stringifier.end(() => {
      resolve();
    });
  });
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------
async function main() {
  try {
    console.log(`Reading raw domains from: ${INPUT_CSV} ...`);
    let rawDomains = await loadDomains();

    console.log(`Total raw lines: ${rawDomains.length}`);

    // Remove duplicates using a Set
    const uniqueSet = new Set(rawDomains);
    rawDomains = [...uniqueSet];
    console.log(`After deduplicating: ${rawDomains.length}`);

    // Filter out obvious non-domains or IP addresses
    const cleaned = rawDomains.filter(isValidDomain);

    console.log(
      `After removing IPs / invalid patterns => ${cleaned.length} "real-sounding" domains`,
    );

    // Sort them alphabetically (optional)
    cleaned.sort();

    // Write out domainlist-clean.csv
    console.log(`Writing to: ${OUTPUT_CSV}`);
    await writeDomains(cleaned);

    console.log('Done! Now use domainlist-clean.csv in your match.js script.');
  } catch (err) {
    console.error('Error in main():', err);
    process.exit(1);
  }
}

await main();
