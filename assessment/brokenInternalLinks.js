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

import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { USER_AGENT, createAssessment } from './assessment-lib.js';
import { getTopPages } from './ahrefs-lib.js';

async function fetchInternalLinks(pageUrl) {
  try {
    const response = await fetch(pageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.statusText} ${JSON.stringify(response.headers.values())}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const internalLinks = [];
    const baseUrl = new URL(pageUrl);

    // Extract href attributes of anchor tags
    $('a').each((index, element) => {
      const href = $(element).attr('href');
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        // Convert relative links to absolute links
        internalLinks.push(new URL(href, baseUrl).toString());
      }
    });

    return internalLinks;
  } catch (error) {
    console.error(`Error fetching internal links for ${pageUrl}: ${error.message}`);
    return []; // Return an empty array if an error occurs
  }
}

const checkLink = (async (link) => {
  try {
    const response = await fetch(link, { method: 'HEAD', 'User-Agent': USER_AGENT });
    if (!response.ok) return { link, status: response.status };
  } catch (error) {
    return { link, status: 'Error fetching link' };
  }
  return null;
});

// Function to check internal links for a given page URL
async function checkInternalLinks(pageUrl, internalLinks) {
  return (await Promise.all(internalLinks.map(checkLink)))
    .filter((value) => value !== null);
}

const userSiteUrl = process.argv[2];
console.log(process.argv);

const options = {
  topPages: 200,
  rateLimitSize: 1,
};

const checkForBrokenInternalLinks = (async (url, assessment) => {
  console.log(`checking for broken internal links in ${url}`);
  const internalLinks = await fetchInternalLinks(url);
  const errors = await checkInternalLinks(url, internalLinks);
  for (const error of errors) {
    assessment.addColumn({
      url,
      link: error.link,
      statusCode: error.status,
    });
  }
});

const brokenInternalLinksAudit = (async (siteUrl, assessment, params) => {
  console.log(`Fetching top ${params.topPages} pages from Ahrefs`);
  const pages = await getTopPages(siteUrl, params.topPages);

  const handleChunkItem = (async (page) => {
    if (page.url && page.sum_traffic > 0) {
      return checkForBrokenInternalLinks(page.url, assessment);
    }
    return null;
  });

  // for (const page of pages) {
  //   // eslint-disable-next-line no-await-in-loop
  //   await handleChunkItem(page);
  // }

  const chunks = [];
  console.log('Pages to be checked:', pages.length);
  const limit = params.rateLimitSize;
  for (let i = 0; i < Math.ceil(pages.length / limit); i += 1) {
    chunks.push(pages.slice(i * limit, Math.min((i + 1) * limit, pages.length - 1)));
  }
  for (const chunk of chunks) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(chunk.map(handleChunkItem));
  }
});

export const brokenInternalLinks = (async () => {
  const assessment = await createAssessment(userSiteUrl, 'Broken internal links');
  assessment.setRowHeadersAndDefaults({
    url: '',
    link: '',
    statusCode: '',
  });
  await brokenInternalLinksAudit(userSiteUrl, assessment, options);
  assessment.end();
  process.exit(0);
})();
