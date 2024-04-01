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
import {OUTPUT_DIR} from './file-lib.js';
import HttpClient from './libs/fetch-client.js';

const httpClient = new HttpClient().getInstance();
const userSiteUrl = process.argv[2];

const options = {
  topPages: 200,
  rateLimitSize: 10,
  debug: {
    verbose: false,
  },
};

let totalBrokenLinks = 0; // Initialize total broken links counter

async function fetchInternalLinks(pageUrl) {
  try {
    const response = await httpClient.get(pageUrl);
    if (options.debug.verbose) {
      console.debug(`Was the call to page ${pageUrl} cached? --> [${httpClient.isCached(response) ? 'Y' : 'N'}]`)
    }

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

    if (options.debug.verbose) {
      console.log(`Found ${internalLinks.length} internal links for ${pageUrl}`);
    }

    return internalLinks;

  } catch (error) {
    console.error(`Error fetching internal links for ${pageUrl}: ${error.message}`);
    return []; // Return an empty array if an error occurs
  }
}

const checkLink = (async (link) => {
  try {
    const response = await httpClient.get(link);
    if (!response.ok) {
      totalBrokenLinks++;
      return { link, status: response.status };
    }
  } catch (error) {
    totalBrokenLinks++;
    return { link, status: 'Error fetching link' };
  }
  return null;
});

// Function to check internal links for a given page URL
async function checkInternalLinks(pageUrl, internalLinks) {
  return (await Promise.all(internalLinks.map(checkLink)))
    .filter((value) => value !== null);
}

const checkForBrokenInternalLinks = (async (url, assessment) => {
  options.debug.verbose || console.log(`Checking for Broken Internal Links in ${url}`);
  return fetchInternalLinks(url)
      .then(internalLinks => checkInternalLinks(url, internalLinks)
      .then(errors => errors.forEach(e => assessment.addColumn({ url, link: e.link, statusCode: e.status }))));
});

const brokenInternalLinksAudit = (async (siteUrl, assessment, params) => {
  console.log(`Fetching top ${params.topPages} pages from Ahrefs`);
  const ahrefsClient = new AhrefsAPIClient({ apiKey: process.env.AHREFS_API_KEY }, new FileCache(OUTPUT_DIR), httpClient);
  //console.log('Top pages for Broken Internal Links assessment:', (await ahrefsClient.getTopPages(siteUrl, params.topPages)).result.pages);
  const topPagesData = await ahrefsClient.getTopPages(siteUrl, params.topPages);

  if (!topPagesData) {
    console.error('No results found due to top pages not being extracted');
    return;
  }

  const { result: { pages } } = topPagesData;

  // Iterate over the top pages in order of traffic
  for (const page of pages) {
    // Check for broken internal links for the current page
    await checkForBrokenInternalLinks(page.url, assessment);
  }

  const handleChunkItem = (async (page) => {
    return (page.url && page.sum_traffic > 0)
      ? checkForBrokenInternalLinks(page.url, assessment)
      : null;
  });

  console.log('Pages checked:', pages.length);

  const limit = params.rateLimitSize;
  const chunks = [];
  for (let i = 0; i < Math.ceil(pages.length / limit); i += 1) {
    chunks.push(pages.slice(i * limit, Math.min((i + 1) * limit, pages.length - 1)));
  }

  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(chunk.map(handleChunkItem));
  }
  console.log(`Total broken internal links found: ${totalBrokenLinks}`);
});

export const brokenInternalLinks = (async () => {
  const assessment = await createAssessment(userSiteUrl, 'Broken Internal Links');
  assessment.setRowHeadersAndDefaults({ url: '', link: '', statusCode: '' });
  await brokenInternalLinksAudit(userSiteUrl, assessment, options);
  assessment.end();
  process.exit(0);
})();
