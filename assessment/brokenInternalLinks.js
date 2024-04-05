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
import AhrefsAPIClient from './libs/ahrefs-client.js';
import AhrefsCache from './libs/ahrefs-cache.js';
import { OUTPUT_DIR } from './file-lib.js';
import HttpClient from './libs/fetch-client.js';
import PageProvider from './libs/page-provider.js';

const httpClient = new HttpClient().getInstance();
const userSiteUrl = process.argv[2];
let totalBrokenLinks = 0;
let pagesChecked = 0;

const defaultOptions = {
  topPages: 200, // default number of pages to check
};

async function fetchInternalLinks(pageUrl) {
  try {
    const response = await httpClient.get(pageUrl);
    if (!response.ok) {
      return [];
    }

    const internalLinks = [];
    const baseUrl = new URL(pageUrl);

    const htmlContent = await response.text();
    const dom = new JSDOM(htmlContent);
    const { body } = dom.window.document;
    const allLinks = body.querySelectorAll('a');

    // Extract href attributes of anchor tags
    allLinks.forEach((element) => {
      const { href } = element;
      if (href) {
        let link = null;

        if (href.startsWith('/') && !href.startsWith('//')) {
          link = new URL(href, baseUrl).toString();
        } else if (href.startsWith(`//${baseUrl.host}`)) {
          link = `${baseUrl.protocol}:${href}`;
        } else if (href.startsWith(baseUrl.toString())) {
          link = href;
        }

        if (link != null) {
          internalLinks.push(link);
        }
      }
    });

    return internalLinks;
  } catch (error) {
    console.error(`Failed to fetch internal links from ${pageUrl}: ${error}`);
    return [];
  }
}

async function checkLink(link) {
  try {
    const response = await httpClient.get(link);
    if (!response.ok) {
      return { link, status: response.status };
    }
  } catch { /* empty */ }
  return null;
}

// Function to check internal links for a given page URL
async function checkInternalLinks(pageUrl, internalLinks) {
  const brokenLinks = await Promise.all(internalLinks.map(checkLink));
  return brokenLinks.filter((value) => value !== null);
}

async function checkForBrokenInternalLinks(url, assessment) {
  const internalLinks = await fetchInternalLinks(url);
  if (internalLinks.length === 0) return;
  const errors = await checkInternalLinks(url, internalLinks);
  if (errors.length === 0) return;
  errors.forEach((e) => {
    totalBrokenLinks += 1;
    assessment.addColumn({ url, brokenLink: e.link, statusCode: e.status });
  });
}
async function brokenInternalLinksAudit(assessment, params) {
  const ahrefsClient = new AhrefsAPIClient({
    apiKey: process.env.AHREFS_API_KEY,
  }, new AhrefsCache(OUTPUT_DIR), httpClient);

  const pageProvider = new PageProvider({
    ahrefsClient,
  });

  const pages = await pageProvider.getPagesOfInterest(assessment.getSite(), params.topPages);

  if (!pages) {
    throw new Error('No results found!');
  }

  // Use Promise.all to handle all asynchronous operations concurrently
  await Promise.all(pages.map(async (page) => {
    if (page) {
      const url = page.devUrl;
      console.log(`Checking the page: ${url}`);

      await checkForBrokenInternalLinks(url, assessment);

      pagesChecked += 1;
      console.log(`Pages checked so far: ${pagesChecked}`);
    } else {
      console.error('Null page found');
    }
  }));

  console.log(`Top Pages checked: ${pagesChecked}`);
  console.log(`Total broken internal links: ${totalBrokenLinks}`);
}

export const brokenInternalLinks = (async () => {
  const assessment = await createAssessment(userSiteUrl, 'Broken Internal Links');
  assessment.setRowHeadersAndDefaults({ url: '', brokenLink: '', statusCode: '' });
  await brokenInternalLinksAudit(assessment, defaultOptions);
  assessment.end();
  process.exit(0);
})();
