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
import fs from 'node:fs';
import Fuse from 'fuse.js';
import { program } from 'commander';

// ------------------------------------
// CONFIG
// ------------------------------------
program
  .requiredOption('-c, --companies <path>', 'Path to the companies CSV file')
  .requiredOption('-d, --domains <path>', 'Path to the domain list CSV file')
  .requiredOption('-o, --output <path>', 'Path to the output CSV file');

program.parse(process.argv);

const ARGV = program.opts();
const COMPANIES_CSV = ARGV.companies;
const DOMAINLIST_CSV = ARGV.domains;
const OUTPUT_CSV = ARGV.output;

// Known suffixes/words to remove from the company name:
const COMPANY_SUFFIXES = [
  'inc\\.?', 'corp\\.?', 'ltd\\.?', 'limited', 'llc',
  'co\\.?', 'company', 'federal services', 'federal',
  'national association', '\\(.*?\\)', // parentheses
];

// On top of or in place of COMPANY_SUFFIXES, define extra "generic words":
const GENERIC_WORDS = [
  'systems', 'solutions', 'technologies', 'services',
  'holding', 'company', 'financial', 'insurance', 'mutual', 'consulting',
  // add any other commonly-used filler terms
];

// Optional: a **mapping** from the Country column to one or more TLDs
// e.g. UNITED KINGDOM => ['.co.uk', '.uk'], CANADA => ['.ca'], etc.
const COUNTRY_TLD_MAP = {
  'UNITED STATES': ['.com', '.us'],
  'UNITED KINGDOM': ['.co.uk', '.uk'],
  CANADA: ['.ca'],
  INDIA: ['.in'],
  GERMANY: ['.de'],
  FRANCE: ['.fr'],
  BRAZIL: ['.br'],
  ANZ: ['.com.au', '.nz'],
  JAPAN: ['.jp'],
};

// If brand length is < SHORT_BRAND_LENGTH, we do the short brand approach
const SHORT_BRAND_LENGTH = 4; // e.g., "ADB" => 3 letters
// Tolerance for near-ties in normal fuzzy approach

// Fewer dot segments => prefer simpler domain
function domainSegmentCount(domain) {
  // ignore 'www' in the count
  return domain.split('.').filter((p) => p && p !== 'www').length;
}

const readCompanyCSV = (file) => {
  const data = fs.readFileSync(file, 'utf-8');
  const lines = data.split('\n');
  const obj = [];
  lines.forEach((line) => {
    const [companyName, country, website, status, hasRUM] = line.split('\t');
    obj.push({
      companyName, country, website, status, hasRUM,
    });
  });
  return obj;
};

const readDomainCSV = (file) => {
  const data = fs.readFileSync(file, 'utf-8');
  const lines = data.split('\n');
  const obj = [];
  lines.forEach((line) => {
    obj.push(`https://${line.trim().toLowerCase()}`);
  });
  return obj;
};

const companyList = readCompanyCSV(COMPANIES_CSV);
const domainList = readDomainCSV(DOMAINLIST_CSV);

//-------------------------------------
// STEP 2: NORMALIZE COMPANY NAME
//-------------------------------------

function normalizeCompanyName(name) {
  let clean = name.toLowerCase();

  // Remove known suffixes & parentheses
  COMPANY_SUFFIXES.forEach((suffix) => {
    const re = new RegExp(`\\b${suffix}\\b`, 'gi');
    clean = clean.replace(re, '');
  });

  // remove "generic" words
  GENERIC_WORDS.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    clean = clean.replace(regex, '');
  });

  // Remove punctuation => spaces, collapse multiple spaces
  clean = clean
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean;
}

// -----------------------------------------------------
// 4) Subset domains for a country TLD (if any) -> build fuse
// -----------------------------------------------------
function buildCountryFuse(theDomainList, country) {
  // find TLD array
  const tlds = COUNTRY_TLD_MAP[country] || [];
  if (!tlds.length) return null; // no known TLD => skip

  // subset domains that end with any TLD in the array
  const subset = theDomainList.filter((d) => tlds.some((tld) => d.endsWith(tld)));
  if (!subset.length) return null;

  // build fuse
  const data = subset.map((d) => ({ domain: d }));
  const options = {
    keys: ['domain'],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
  };
  return new Fuse(data, options);
}

/**
 * If brand is short (like 'IBM', 'HP'), do a special approach:
 *   1. Substring approach: find all domains that contain that brand snippet
 *      (like 'ibm.' or '.ibm' or 'ibm' as a substring).
 *   2. Score them with a stricter fuzzy approach or just filter them by substring.
 *   3. If multiple hits, pick the one with the fewest dot segments.
 *   4. If none found, fallback to normal fuzzy approach.
 */
function shortBrandMatch(brand, domains) {
  // We'll do a simple substring approach ignoring case:
  // brand => "ibm"
  // domain => "www.ibm.com"
  // domain.includes(brand) => true
  const brandLower = brand.toLowerCase();
  // filter domains that contain brandLower
  const matches = domains.filter((d) => d.includes(brandLower));
  if (!matches.length) {
    return null; // no substring hits
  }
  // If more than one, pick the one with the fewest dot segments ignoring 'www'
  matches.sort((a, b) => {
    const segA = domainSegmentCount(a);
    const segB = domainSegmentCount(b);
    return segA - segB;
  });
  return matches[0]; // simplest domain
}

//-------------------------------------
// STEP 4: FIND BEST DOMAIN
//-------------------------------------
/**
 * We'll do:
 *   const results = fuse.search(companyName)
 *
 * results => array of { item: {domain: 'xxx'}, score: number, ... }
 *
 * We pick results[0] if present, and if the score is acceptable (score < 0.85, etc.
 * Remember: in Fuse, score 0 = perfect, 1 = worst.
 */

function doFuseMatch(fuse, query) {
  const results = fuse.search(query, { limit: 10 });
  if (!results.length) return null;

  if (!results.length) {
    return '';
  }
  // best possible is results[0], but let's see if there's a near-tie
  const bestScore = results[0].score;
  if (bestScore > 0.8) {
    // too poor => blank
    return '';
  }
  // filter results to those within +0.02 of bestScore, or pick your own tolerance
  const TIE_TOLERANCE = 0.02;
  const nearTie = results.filter((r) => r.score - bestScore <= TIE_TOLERANCE);

  // among nearTie, pick the domain with the fewest dot segments ignoring 'www'
  // sort ascending by segmentCount
  nearTie.sort((a, b) => {
    const segA = domainSegmentCount(a.item.domain);
    const segB = domainSegmentCount(b.item.domain);
    return segA - segB;
  });

  // The first in nearTie is the domain with the fewest dots among top-scoring matches
  return nearTie[0].item.domain;
}
function findBestDomain(countryFuse, normalizedName, domainList) {
  if (!normalizedName) return '';

  // If brand is short: do shortBrandMatch first
  if (normalizedName.length < SHORT_BRAND_LENGTH) {
    const shortResult = shortBrandMatch(normalizedName, domainList);
    if (shortResult) {
      return shortResult;
    }
  }

  const best = (countryFuse) ? doFuseMatch(countryFuse, normalizedName) : '';
  return best;
}

//-------------------------------------
// STEP 5: PROCESS COMPANIES
//-------------------------------------
function processCompanies(theSitesData) {
  return theSitesData.map((site) => {
    const normalizedName = normalizeCompanyName(site.companyName);
    const countryFuse = buildCountryFuse(domainList, site.country);

    // pick best domain
    return { ...site, website: findBestDomain(countryFuse, normalizedName, domainList) };
  });
}

//-------------------------------------
// STEP 6: WRITE OUT NEW CSV
//-------------------------------------
async function writeOutputCSV(rows) {
  let output = '';
  rows.forEach((site) => {
    output += `${site.companyName};${site.country};${site.website};${site.status};${site.hasRUM}\n`;
  });
  fs.writeFileSync(OUTPUT_CSV, output);
}

//-------------------------------------
// MAIN
//-------------------------------------
async function main() {
  try {
    console.log('Reading & matching companies...');
    const updatedRows = processCompanies(companyList);

    console.log(`Writing output => ${OUTPUT_CSV}`);
    await writeOutputCSV(updatedRows);

    console.log('Done. Check your CSV:', OUTPUT_CSV);
  } catch (e) {
    console.error('Error in main():', e);
    process.exit(1);
  }
}

// Use top-level await in Node 18+ with "type":"module"
await main();
