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
import {canonical} from './assessment/canonical.js';
import {sitemap} from './assessment/sitemap.js';
import {brokenInternalLinks} from './assessment/brokenInternalLinks.js';
import {brokenBacklinks} from './assessment/broken-backlinks.js';
import fs from "fs";
import {OUTPUT_DIR} from "./assessment/file-lib.js";
import SpaceCatSdk from "spacecat-sdk/src/sdk.js";
import {SPACECAT_API_BASE_URL} from "./assessment/libs/assessment-lib.js";

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
  await auditFunctions.reduce(async (previousAudit, currentAudit) => {
    await previousAudit;
    return currentAudit(options);
  }, Promise.resolve());
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
    await runAllAudits();
  }
  process.exit(0);
})();
