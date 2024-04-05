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
import { createAssessment, USER_AGENT } from './assessment-lib.js';
import AhrefsCache from './libs/ahrefs-cache.js';
import AhrefsAPIClient from './libs/ahrefs-client.js';
import { OUTPUT_DIR } from './file-lib.js';
import { fetchAllPages } from './sitemap.js';
import HttpClient from './libs/fetch-client.js';

const PARAMS = '?';
const userSiteUrl = process.argv[2];
const httpClient = new HttpClient().getInstance();

const options = {
  topPages: 200,
  sitemapSrc: undefined,
};

const startsWithWww = (url) => url.startsWith('https://www.');
const endsWithSlash = (url) => url.endsWith('/');
const endsWithHtml = (url) => url.endsWith('.html');
const containsParams = (url) => url.includes(PARAMS);

const delay = (duration) => new Promise((resolve) => {
  setTimeout(resolve, duration);
});

const fetchWithRetry = async (url, maxRetries = 3, initialBackoff = 300) => {
  let retries = maxRetries;
  let backoff = initialBackoff;

  const attemptFetch = async () => {
    try {
      const response = await httpClient.get(url);
      if (response.ok) {
        const location = response.headers.get('Location');
        // Handle redirects
        return location || response;
      }
      throw new Error(`Response not OK: ${response.statusText}`);
    } catch (error) {
      if (retries > 0) {
        console.log(`Error fetching URL ${url}: ${error.message}. Retrying in ${backoff}ms`);
        await delay(backoff);
        backoff *= 2;
        retries -= 1;
        // Recursive call
        return attemptFetch();
      }
      // Rethrow error after exhausting retries
      throw error;
    }
  };

  return attemptFetch();
};

const checkForDuplicateUrl = async (url) => {
  try {
    const response = await httpClient.get(url);
    return response.ok && !response.redirected;
  } catch (error) {
    console.error(`Failed to fetch ${url}: ${error}`);
    return false;
  }
};

const validateCanonicalLink = async (url, canonicalLink) => {
  const response = await fetchWithRetry(url);
  // If fetch failed, assume not valid
  if (!response) return false;

  const htmlContent = await response.text();
  const dom = new JSDOM(htmlContent);
  const { head } = dom.window.document;
  const alternativeCanonical = head.querySelector('link[rel="canonical"]')?.href;

  // Check for canonical match
  return alternativeCanonical === canonicalLink;
};

const validateCanonicalAcrossAlternatives = async (urlAlternatives, canonicalLink) => {
  const validationPromises = urlAlternatives.map(
    (alternativeUrl) => validateCanonicalLink(alternativeUrl, canonicalLink),
  );

  const results = await Promise.all(validationPromises);
  return results.every((isValid) => isValid);
};

const checkForCanonical = async (url, sitemapUrls, assessment) => {
  try {
    const response = await fetchWithRetry(url);
    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('text/html')) {
      throw new Error('Not an HTML page');
    }

    const htmlContent = await response.text();
    const dom = new JSDOM(htmlContent);
    const canonicalLink = dom.window.document.querySelector('link[rel="canonical"]')?.href;

    if (!canonicalLink) throw new Error('No canonical link found');

    const alternatives = [
      startsWithWww(url) ? url.replace('https://www.', 'https://') : `https://www.${url.slice(8)}`,
      endsWithSlash(url) ? url.slice(0, -1) : `${url}/`,
      endsWithHtml(url) ? url.slice(0, -5) : `${url}.html`,
    ];

    const duplicateChecks = await Promise.all(alternatives.map(checkForDuplicateUrl));
    const canonicalConsistency = await validateCanonicalAcrossAlternatives(alternatives.filter(
      (_, index) => duplicateChecks[index],
    ), canonicalLink);

    const issues = [
      !sitemapUrls.some((obj) => obj.page === canonicalLink) && 'Canonical not in sitemap',
      containsParams(url) && 'URL contains parameters',
      !canonicalConsistency && 'Canonical inconsistency across versions',
      duplicateChecks[0] && 'WWW version duplicate',
      duplicateChecks[1] && 'Trailing slash version duplicate',
      duplicateChecks[2] && 'HTML extension version duplicate',
    ].filter(Boolean);

    if (issues.length > 0) {
      assessment.addColumn({
        url,
        status: response.status,
        issues: issues.join(', '),
      });
    }
  } catch (error) {
    assessment.addColumn({
      url,
      error: error.message,
    });
  }
};

const canonicalAudit = async (siteUrl, assessment) => {
  const auditUrl = (await composeAuditURL(siteUrl)).replace(/\.html$/, '');

  console.log(`Fetching pages on audit url ${auditUrl}, from sitemap ${options.sitemapSrc ? `provided at ${options.sitemapSrc}` : ''}`);
  const sitemapUrls = await fetchAllPages(siteUrl, options.sitemapSrc);

  console.log(`Fetching top ${options.topPages} pages from Ahrefs`);
  const ahrefsClient = new AhrefsAPIClient(
    {
      apiKey: process.env.AHREFS_API_KEY,
    },
    new AhrefsCache(OUTPUT_DIR),
  );

  const fetchTopPages = async (url) => ahrefsClient.getTopPages(url, options.topPages);

  const responseNoWWW = await fetchTopPages(auditUrl.replace(/^www\./, ''));
  const responseWithWWW = auditUrl.startsWith('www.') ? responseNoWWW : await fetchTopPages(`www.${auditUrl}`);

  const sumTraffic = (pages) => pages.reduce((acc, page) => acc + page.sum_traffic, 0);
  const totalTrafficNoWWW = sumTraffic(responseNoWWW.result.pages);
  const totalTrafficWithWWW = sumTraffic(responseWithWWW.result.pages);
  const response = totalTrafficNoWWW > totalTrafficWithWWW ? responseNoWWW : responseWithWWW;

  const canonicalCheckPromises = response.result.pages
    .filter((page) => page.url)
    .map((page) => checkForCanonical(page.url, sitemapUrls, assessment));
  return Promise.all(canonicalCheckPromises);
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
    issues: '',
    error: '',
  });
  await canonicalAudit(userSiteUrl, assessment);
  if (assessment.getRows().length === 0) {
    console.log('No issues found');
    assessment.addColumn({
      url: userSiteUrl,
      error: 'No issues found',
    });
  }
  assessment.end();
  process.exit(0);
})();
