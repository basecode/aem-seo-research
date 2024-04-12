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
import fs from 'fs';
import SpaceCatSdk from 'spacecat-sdk/src/sdk.js';
import { json2csv } from 'json-2-csv';
import path from 'path';
import { composeAuditURL } from '@adobe/spacecat-shared-utils';
import { canonical } from './assessment/canonical.js';
import { sitemap } from './assessment/sitemap.js';
import { brokenInternalLinks } from './assessment/brokenInternalLinks.js';
import { brokenBacklinks } from './assessment/brokenBacklinks.js';
import { OUTPUT_DIR, sanitizeFilename } from './assessment/file-lib.js';
import { SPACECAT_API_BASE_URL } from './assessment/libs/assessment-lib.js';
import { gitHubURLToHlxSite } from './assessment/libs/page-provider.js';

const audits = {
  canonical,
  brokenInternalLinks,
  brokenBacklinks,
  sitemap,
};

const options = {
  site: undefined,
  baseURL: undefined,
  topPages: 200,
  topBacklinks: 200,
  onlyBacklinksInTopPages: true,
  devBaseURL: undefined,
  sitemap: undefined,
  siteAuditURL: undefined,
  devAuditURL: undefined,
};

const runAudit = async (auditType) => {
  if (audits[auditType]) {
    await audits[auditType](options);
  } else {
    console.error(`Unknown audit type: ${auditType}`);
  }
};

const runAllAudits = async () => {
  const auditFunctions = Object.values(audits);

  return auditFunctions.reduce(async (accPromise, auditFunction) => {
    const acc = await accPromise;
    const result = await auditFunction(options);
    acc.push(result);
    return acc;
  }, Promise.resolve([]));
};

const parseArgs = (args) => {
  const [, baseURL] = args;
  options.baseURL = baseURL;
  const isPositiveNumber = (value) => !Number.isNaN(value) && value > 0;
  args.forEach((arg) => {
    const [key, value] = arg.split('=');
    // eslint-disable-next-line default-case
    switch (key) {
      case 'topPages': {
        const topPages = parseInt(value, 10);
        options.topPages = isPositiveNumber(topPages) ? topPages : options.topPages;
        break;
      }
      case 'topBacklinks': {
        const topBacklinks = parseInt(value, 10);
        options.topBacklinks = isPositiveNumber(topBacklinks) ? topBacklinks : options.topBacklinks;
        break;
      }
      case 'onlyBacklinksInTopPages':
        options.onlyBacklinksInTopPages = value === 'true';
        break;
      case 'devBaseURL':
        options.devBaseURL = value;
        break;
      case 'sitemap':
        options.sitemap = value;
        break;
    }
  });
};

const setup = async () => {
  // Ensure the output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  console.log('Check if URL is qualified to be assessed. Needs to be part of spacecat catalogue');
  const spaceCatSdk = new SpaceCatSdk(
    { apiBaseUrl: SPACECAT_API_BASE_URL, apiKey: process.env.SPACECAT_API_KEY },
  );
  options.site = await spaceCatSdk.getSite(options.baseURL);
  if (options.site.gitHubURL) {
    options.hlxSiteURL = await gitHubURLToHlxSite(options.site.gitHubURL);
  }

  const siteAuditUrl = await composeAuditURL(options.site.baseURL);
  options.siteAuditURL = siteAuditUrl.replace(/\.html$/, '');
  if (options.devBaseURL) {
    options.devAuditURL = await composeAuditURL(options.devBaseURL);
  }
};

const createSummary = async (results) => {
  const summary = results.map((result) => ({
    auditType: result.auditType,
    totalIssues: result.amountOfIssues,
    report: result.location,
  }));
  const csv = json2csv(summary);
  const summaryFilePath = path.join(OUTPUT_DIR, `summary-${sanitizeFilename(options.baseURL)}-${new Date().toISOString()}.csv`);
  fs.writeFileSync(summaryFilePath, csv);
};

(async () => {
  const args = process.argv.slice(2);
  const auditArg = args.find((arg) => arg.startsWith('audit='));
  const auditType = auditArg ? auditArg.split('=')[1] : null;
  parseArgs(args);

  await setup();

  if (auditType && auditType !== 'all') {
    await runAudit(auditType);
  } else {
    const result = await runAllAudits();
    await createSummary(result);
  }
  process.exit(0);
})();
