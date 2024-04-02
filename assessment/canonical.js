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

import { JSDOM } from 'jsdom';
import { composeAuditURL } from '@adobe/spacecat-shared-utils';
import process from '@adobe/eslint-config-helix';
import { createAssessment } from './assessment-lib.js';
import FileCache from './libs/file-cache.js';
import AhrefsAPIClient from './libs/ahrefs-client.js';
import { OUTPUT_DIR } from './file-lib.js';
import { fetchAllPages, USER_AGENT } from './utils/support.js';

const TRACKING_PARAM = '?utm';
const userSiteUrl = process.argv[2];

const options = {
  topPages: 200,
  sitemapSrc: undefined,
};

const startsWithWww = (url) => url.startsWith('https://www.');
const endsWithSlash = (url) => url.endsWith('/');
const endsWithHtml = (url) => url.endsWith('.html');
const containsTrackingParams = (url) => url.includes(TRACKING_PARAM);
const checkForDuplicateUrl = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD', 'User-Agent': USER_AGENT });
    return response.ok;
  } catch (error) {
    console.error(`Error checking URL: ${url}`, error);
    return false;
  }
};

// eslint-disable-next-line consistent-return
const checkForCanonical = async (url, assessment, source = 'ahrefs', retries = 3, backoff = 300) => {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    if (response.ok && contentType.includes('text/html')) {
      const htmlContent = await response.text();
      const dom = new JSDOM(htmlContent);

      // should be in the head
      const { head } = dom.window.document;
      const canonicalLink = head.querySelector('link[rel="canonical"]')?.href;

      if (canonicalLink) {
        const alternativeWwwUrl = startsWithWww(url) ? url.replace('https://www.', 'https://') : `https://www.${url.slice(8)}`;
        const alternativeSlashUrl = endsWithSlash(url) ? url.slice(0, -1) : `${url}/`;
        const alternativeHtmlUrl = endsWithHtml(url) ? url.slice(0, -5) : `${url}.html`;

        const isAlternativeWwwDuplicate = await checkForDuplicateUrl(alternativeWwwUrl);
        const isAlternativeSlashDuplicate = await checkForDuplicateUrl(alternativeSlashUrl);
        const isAlternativeHtmlDuplicate = await checkForDuplicateUrl(alternativeHtmlUrl);

        const issues = [
          startsWithWww(url) !== startsWithWww(canonicalLink) ? 'www mismatch' : '',
          endsWithSlash(url) !== endsWithSlash(canonicalLink) ? 'trailing slash mismatch' : '',
          endsWithHtml(url) !== !endsWithHtml(canonicalLink) ? 'html extension mismatch' : '',
          containsTrackingParams(url) ? 'tracking params present and should be removed' : '',
          isAlternativeWwwDuplicate ? `duplicate URL detected for ${startsWithWww(url) ? 'non-www' : 'www'} version` : '',
          isAlternativeSlashDuplicate ? `duplicate URL detected for ${endsWithSlash(url) ? 'non-slash' : 'slash'} version` : '',
          isAlternativeHtmlDuplicate ? `duplicate URL detected for ${endsWithHtml(url) ? 'non-html' : 'html'} version` : '',
        ].filter((issue) => issue !== ''); // Filter out non-issues

        // check if canonical link exists
        if (issues.length > 0) {
          const issuesSummary = issues.join(', ');
          assessment.addColumn({
            url,
            source,
            response: response.status,
            error: issuesSummary,
          });
        }
      } else {
        assessment.addColumn({
          url,
          source,
          response: response.status,
          error: 'No canonical link found',
        });
      }
    } else {
      assessment.addColumn({
        url,
        source,
        response: response.status,
        error: 'URL does not exist or is not an HTML page',
      });
    }
  } catch (error) {
    if (retries > 0) {
      console.log(`Error fetching URL ${url}: ${error.message}. Retrying in ${backoff}ms`);
      await new Promise((resolve) => {
        setTimeout(resolve, backoff);
      });
      return checkForCanonical(url, assessment, source, retries - 1, backoff * 2);
    } else {
      assessment.addColumn({
        url,
        source,
        error: `Error fetching URL ${url}: ${error.message} after ${retries} retries`,
      });
    }
  }
};

const canonicalAudit = async (siteUrl, assessment) => {
  const auditUrl = (await composeAuditURL(siteUrl)).replace(/\.html$/, '');

  console.log(`Fetching pages on audit url ${auditUrl}, from sitemap ${options.sitemapSrc ? `provided at ${options.sitemapSrc}` : ''}`);
  const pages = await fetchAllPages(siteUrl, options.sitemapSrc);

  console.log(`Fetching top ${options.topPages} pages from Ahrefs`);
  const ahrefsClient = new AhrefsAPIClient({
    apiKey: process.env.AHREFS_API_KEY,
  }, new FileCache(OUTPUT_DIR));
  let response = await ahrefsClient.getTopPages(auditUrl, options.topPages);
  // if ahrefs response is empty, try with www
  // Make sure all other URLs are now also with www (from sitemap)
  if (response.result.pages.length === 0) {
    response = await ahrefsClient.getTopPages(`www.${auditUrl}`, options.topPages);
  }

  // eslint-disable-next-line max-len
  const filteredPages = pages.filter((page) => response.result.pages.some((responsePage) => responsePage.url === page.page));

  // eslint-disable-next-line array-callback-return,consistent-return
  return Promise.all(filteredPages.map((page) => {
    if (page.page) {
      return checkForCanonical(page.page, assessment, 'sitemap');
    }
  }));
};

export const canonical = (async () => {
  process.argv.slice(3).forEach((arg) => {
    if (arg.startsWith('top-pages=')) {
      const [, value] = arg.split('=');
      const number = parseInt(value, 10);
      if (Number.isNaN(number) || number <= 0) {
        console.log('Defaulting to top 200 pages');
        options.topPages = 200;
      } else {
        options.topPages = number;
      }
    } else if (arg.startsWith('sitemap=')) {
      const [, value] = arg.split('=');
      options.sitemapSrc = value;
    } else {
      console.error(`Error: Unknown option '${arg}'`);
      process.exit(1);
    }
  });
  const assessment = await createAssessment(userSiteUrl, 'Canonical');
  assessment.setRowHeadersAndDefaults({
    url: '',
    source: '',
    error: '',
  });
  await canonicalAudit(userSiteUrl, assessment);
  assessment.end();
  process.exit(0);
})();
