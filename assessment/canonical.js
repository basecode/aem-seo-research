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
import { getTopPages } from './ahrefs-lib.js';

const TRACKING_PARAM = '?utm';
const userSiteUrl = process.argv[2];

const checkForCanonical = async (url, assessment) => {
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
          canonicalExists: true,
          response: response.status,
          presentInSiteMap: url === canonicalLink,
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
    assessment.addColumn({
      url,
      error: `Error fetching URL ${url}: ${error.message}`,
    });
  }
};

const canonicalAudit = async (siteUrl, assessment) => {
  // get top pages
  const pages = await getTopPages(siteUrl);

  // eslint-disable-next-line consistent-return,array-callback-return
  return Promise.all(pages.map((page) => {
    if (page.url && page.sum_traffic > 0) {
      return checkForCanonical(page.url, assessment);
    }
  }));
};

(async () => {
  const assessment = await createAssessment(userSiteUrl, 'Canonical');
  assessment.setRowHeadersAndDefaults({
    url: '',
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
  await canonicalAudit(userSiteUrl, assessment);
  assessment.end();
})();
