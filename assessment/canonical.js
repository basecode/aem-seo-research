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
import { createAssessment } from './assessment-lib.js';
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
  let initialResponseCode = null;

  const attemptFetch = async (attemptUrl, followRedirect = true) => {
    try {
      const response = await httpClient.get(attemptUrl, { redirect: 'manual' });
      const responseCode = response.status;

      // Save the initial response code if it's the first attempt
      if (initialResponseCode === null) {
        initialResponseCode = responseCode;
      }

      // Handle redirects manually
      if (followRedirect && responseCode >= 300 && responseCode < 400) {
        const location = response.headers.get('Location');
        if (location) {
          // Follow the redirect without allowing further redirects
          return attemptFetch(location, false);
        }
      }

      if (response.ok) {
        return { response, initialResponseCode };
      }

      throw new Error(`Response not OK: ${response.statusText}`);
    } catch (error) {
      if (retries > 0) {
        console.log(`Error fetching URL ${url}: ${error.message}. Retrying in ${backoff}ms`);
        await delay(backoff);
        backoff *= 2;
        retries -= 1;
        // Recursive call
        return attemptFetch(url, followRedirect);
      }
      // Rethrow error after exhausting retries
      throw error;
    }
  };

  return attemptFetch(url);
};

const checkForCanonical = async (url, sitemapUrls, assessment) => {
  try {
    const { response, initialResponseCode } = await fetchWithRetry(url);
    const finalUrl = response.url;
    const isRedirect = url !== finalUrl;
    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('text/html')) {
      throw new Error('Not an HTML page');
    }

    const htmlContent = await response.text();
    const dom = new JSDOM(htmlContent);
    const canonicalLink = dom.window.document.querySelector('link[rel="canonical"]')?.href;
    const isCanonicalMatchFinalUrl = finalUrl === canonicalLink;

    if (!canonicalLink) throw new Error('No canonical link found');

    const alternatives = [
      startsWithWww(url) ? url.replace('https://www.', 'https://') : `https://www.${url.slice(8)}`,
      endsWithSlash(url) ? url.slice(0, -1) : `${url}/`,
      endsWithHtml(url) ? url.slice(0, -5) : `${url}.html`,
    ];

    const isCanonicalInSitemap = sitemapUrls.some((obj) => obj.page === canonicalLink);

    const alternativeInSitemap = alternatives.map(
      (alternativeUrl) => sitemapUrls.some((obj) => obj.page === alternativeUrl),
    );

    const missingCanonicalReasons = [
      alternativeInSitemap[0] && 'WWW version in sitemap',
      alternativeInSitemap[1] && 'Trailing slash version in sitemap',
      alternativeInSitemap[2] && 'HTML extension version in sitemap',
    ].filter(Boolean);

    const issues = [
      !isCanonicalInSitemap && missingCanonicalReasons.length === 0 && 'Canonical not in sitemap (Ensure the preferred canonical URL is listed in the sitemap for better search engine indexing)',
      !isCanonicalInSitemap && missingCanonicalReasons.length > 0 && `Canonical not in sitemap, but alternative found: ${missingCanonicalReasons.join(', ')} (The sitemap contains an alternative version of the URL, which might lead to confusion for search engines)`,
      isRedirect && !isCanonicalMatchFinalUrl && `Redirect detected: The page redirects from ${url} to ${finalUrl}, but the canonical URL is ${canonicalLink} (Ensure the canonical URL is the final destination without further redirects)`,
      containsParams(url) && 'URL contains parameters (URL parameters can lead to duplicate content issues; review if they are essential for user navigation or if they can be handled differently)',
    ].filter(Boolean);

    if (issues.length > 0) {
      assessment.addColumn({
        url,
        status: initialResponseCode,
        issues: issues.join('. '),
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
    httpClient,
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
      // console.error(`Error: Unknown option '${arg}'`);
      // process.exit(1);
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
