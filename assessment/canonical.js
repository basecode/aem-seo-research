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
import { createAssessment } from './assessment-lib.js';
import { fetchSitemapsFromBaseUrl } from './sitemap.js';
import FileCache from './libs/file-cache.js';
import AhrefsAPIClient from './libs/ahrefs-client.js';
import { OUTPUT_DIR } from './file-lib.js';

const TRACKING_PARAM = '?utm';
const userSiteUrl = process.argv[2];

const options = {
  topPages: undefined,
  sitemapSrc: undefined,
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

      // check if canonical link exists
      if (canonicalLink) {
        assessment.addColumn({
          url,
          source,
          canonicalExists: true,
          response: response.status,
          presentInSiteMap: source === 'sitemap' ? url === canonicalLink : '',
          www: url.startsWith('https://www.'),
          hasTrailingSlash: url.endsWith('/'),
          hasHtmlExtension: url.endsWith('.html'),
          hasTrackingParams: url.includes(TRACKING_PARAM),
        });
      } else {
        assessment.addColumn({
          url,
          error: 'No canonical link found',
        });
      }
    } else {
      assessment.addColumn({
        url,
        response: response.status,
        error: `URL ${url} is not an HTML page`,
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
        error: `Error fetching URL ${url}: ${error.message} after ${retries} retries`,
      });
    }
  }
};

const canonicalAudit = async (siteUrl, assessment) => {
  if (options.topPages) {
    // if top pages are specified, get pages from ahrefs
    // default, get pages from sitemap
    console.log(`Fetching top ${options.topPages} pages from Ahrefs`);
    const ahrefsClient = new AhrefsAPIClient({ apiKey: process.env.AHREFS_API_KEY }, new FileCache(OUTPUT_DIR));
    const response = await ahrefsClient.getTopPages(siteUrl, options.topPages);
    // eslint-disable-next-line consistent-return,array-callback-return
    return Promise.all(response?.result?.pages.map((page) => {
      if (page.url && page.sum_traffic > 0) {
        return checkForCanonical(page.url, assessment);
      }
    }));
  } else {
    console.log(`Fetching pages from sitemap ${options.sitemapSrc ? `provided at ${options.sitemapSrc}` : ''}`);
    const pages = await fetchSitemapsFromBaseUrl(siteUrl, options.sitemapSrc);
    // eslint-disable-next-line array-callback-return,consistent-return
    return Promise.all(pages.map((page) => {
      if (page.page) {
        return checkForCanonical(page.page, assessment, 'sitemap');
      }
    }));
  }
};

export const canonical = (async () => {
  process.argv.slice(3).forEach((arg) => {
    if (arg.startsWith('--top-pages')) {
      const [, value] = arg.split('=');
      const number = parseInt(value, 10);
      if (Number.isNaN(number) || number <= 0) {
        console.log('Defaulting to top 200 pages');
        options.topPages = 200;
      } else {
        options.topPages = number;
      }
    } else if (arg.startsWith('--sitemap')) {
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
    canonicalExists: '',
    response: '',
    presentInSiteMap: '',
    www: '',
    hasTrailingSlash: '',
    hasHtmlExtension: '',
    hasTrackingParams: '',
    error: '',
    warning: '',
  });
  await canonicalAudit(userSiteUrl, assessment, options);
  assessment.end();
  process.exit(0);
})();
