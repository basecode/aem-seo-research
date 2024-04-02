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
import FileCache from './libs/file-cache.js';
import { OUTPUT_DIR } from './file-lib.js';
import HttpClient from './libs/fetch-client.js';

const httpClient = new HttpClient().getInstance();
const userSiteUrl = process.argv[2];
let totalBrokenLinks = 0;
let pagesChecked = 0;

const options = {
  topPages: 2000,
  rateLimitSize: 10
};

async function fetchInternalLinks(pageUrl) {
  const response = await httpClient.get(pageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText}`);
  }

  const internalLinks = [];
  const baseUrl = new URL(pageUrl);

  const htmlContent = await response.text();
  const dom = new JSDOM(htmlContent);
  const { body } = dom.window.document;
  const allLinks = body.querySelectorAll('a');

  // Extract href attributes of anchor tags
  allLinks.forEach((element) => {
    const href = element.href;
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
}

async function checkLink(link) {
  const response = await httpClient.get(link);
  if (!response.ok) {
    return { link, status: response.status };
  }
  return null;
}

// Function to check internal links for a given page URL
async function checkInternalLinks(pageUrl, internalLinks) {
  const brokenLinks = await Promise.all(internalLinks.map(checkLink));
  return brokenLinks.filter((value) => value !== null);
}

async function checkForBrokenInternalLinks(url, assessment, sum_traffic) {
  const internalLinks = await fetchInternalLinks(url);
  const errors = await checkInternalLinks(url, internalLinks);
  errors.forEach(e => {
    totalBrokenLinks++;
    assessment.addColumn({ url, broken_link: e.link, statusCode: e.status, sum_traffic });
  });
}
async function brokenInternalLinksAudit(siteUrl, assessment, params) {
  const ahrefsClient = new AhrefsAPIClient({ apiKey: process.env.AHREFS_API_KEY }, new FileCache(OUTPUT_DIR), httpClient);
  const topPagesData = await ahrefsClient.getTopPages(siteUrl, params.topPages);

  if (!topPagesData) {
    throw new Error('No results found!');
  }

  const { result: { pages } } = topPagesData;
  const filteredPages = pages.filter(page => page.sum_traffic && page.sum_traffic > 0);

  for (const page of filteredPages) {
    if (!page) {
      console.error('Null page found');
      continue; // Skip for null page
    }
    console.log(`Checking the page: ${page.url}`);
    await checkForBrokenInternalLinks(page.url, assessment, page.sum_traffic);
    pagesChecked++;
    console.log(`Pages checked so far: ${pagesChecked}`);
  }

  const limit = params.rateLimitSize;
  const chunks = [];
  for (let i = 0; i < Math.ceil(filteredPages.length / limit); i += 1) {
    chunks.push(pages.slice(i * limit, Math.min((i + 1) * limit, filteredPages.length - 1)));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(page => checkForBrokenInternalLinks(page.url, assessment, page.sum_traffic)));
  }
  console.log(`Top Pages checked : ${pagesChecked}`);
  console.log(`Total broken internal links: ${totalBrokenLinks}`);
}

export const brokenInternalLinks = (async () => {
  const assessment = await createAssessment(userSiteUrl, 'Broken Internal Links');
  assessment.setRowHeadersAndDefaults({ url: '', broken_link: '', statusCode: '', sum_traffic: '' });
  await brokenInternalLinksAudit(userSiteUrl, assessment, options);
  assessment.end();
  process.exit(0);
})();
