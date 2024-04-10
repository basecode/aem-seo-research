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
import zlib from 'zlib';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parseStringPromise } from 'xml2js';
// eslint-disable-next-line import/no-unresolved
import { makeSpaceCatApiCall } from './lib.js';
import HttpClient from './assessment/libs/fetch-client.js';

dotenv.config();

const httpClient = HttpClient.getInstance();

const visitedSitemaps = [];

const REPORTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports');
const EXECUTE_SINGLE_SITE_REPORT = '';

// Ensure the reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}

const hrtimeToSeconds = (hrtime) => {
  // hrtime is an array: [seconds, nanoseconds]
  // Convert seconds to nanoseconds and add the nanoseconds
  const totalNanoseconds = hrtime[0] * 1e9 + hrtime[1];
  return totalNanoseconds / 1e9;
};

const sanitizeFilename = (url) => url.replace(/[^a-zA-Z0-9]/g, '_');

const reportExists = (site) => fs.existsSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`));

const report = (site, message) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(message);
  fs.appendFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `${message}\n`);
};

const reportSite = (site) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(`Report for ${site}`);
  fs.writeFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `Report for ${site}\n`);
  report(site, `Date: ${Date.now()}`);
};

const reportPages = (site, pages) => {
  report(site, `Total Pages: ${pages.length}`);
  pages.forEach((page) => fs.appendFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `${page}\n`));
};

/*
Example output:
['https://domain1.com', 'https://domain2.com'];
*/
const getSpacecatSitesUrls = async () => {
  const response = await makeSpaceCatApiCall('get', '/sites');
  return response
    .filter((item) => item.deliveryType === 'aem_edge')
    .map((item) => item.baseURL);
};

async function fetchSitemapUrls(siteUrl) {
  const sitemapUrl = new URL('sitemap.xml', siteUrl).toString(); // Default sitemap location
  const urls = [];

  function parseRobotsTxt(robotsTxt) {
    try {
      const regex = /Sitemap:\s*(https?:\/\/[^\s]+)/g;
      let match;
      const sitemaps = [];
      // eslint-disable-next-line no-cond-assign
      while ((match = regex.exec(robotsTxt)) !== null) {
        sitemaps.push(match[1]);
      }
      return sitemaps.length > 0 ? sitemaps : null;
    } catch (error) {
      return null; // No sitemap URL found in robots.txt
    }
  }

  async function parseSitemap(xml, source) {
    if (visitedSitemaps.includes(source)) return; // Ensure to use `source` instead of `sitemapUrl`
    try {
      const result = await parseStringPromise(xml);
      const fetchPromises = [];

      if (result.urlset && result.urlset.url) {
        result.urlset.url.forEach((urlEntry) => {
          urls.push(urlEntry.loc[0]);
        });
      } else if (result.sitemapindex && result.sitemapindex.sitemap) {
        result.sitemapindex.sitemap.forEach((sitemap) => {
          const sitemapIndexUrl = sitemap.loc[0];
          if (visitedSitemaps.includes(sitemapIndexUrl)) return;
          visitedSitemaps.push(sitemapIndexUrl);
          report(siteUrl, `Found Sitemap in Index: ${sitemapIndexUrl}`);

          // Create a fetch promise and add it to the array
          const fetchPromise = httpClient.fetch(sitemapIndexUrl)
            .then((response) => {
              if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
                report(siteUrl, `Error in ${sitemapIndexUrl}, Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}, Source: ${source}`);
                return null; // Return null to handle this in the subsequent .then()
              } else if (response.headers.get('content-type').includes('application/x-gzip')) {
                // Handle gzipped sitemap
                report(siteUrl, '..and gzipped');
                return response.arrayBuffer().then((buffer) => {
                  const decompressed = zlib.gunzipSync(Buffer.from(buffer)).toString();
                  // Recursively parse nested sitemaps
                  return parseSitemap(decompressed, sitemapIndexUrl);
                });
              } else {
                // Handle regular sitemap
                // Recursively parse nested sitemaps
                return response.text().then((xmlText) => parseSitemap(xmlText, sitemapIndexUrl));
              }
            });

          fetchPromises.push(fetchPromise);
        });
      }

      // Wait for all fetch operations to complete
      await Promise.all(fetchPromises);
    } catch (error) {
      visitedSitemaps.push(source); // Ensure to use `source` instead of `sitemapUrl`
      console.error(`Error in ${source}: ${error}. Source: ${source}`);
    }
  }

  // Check robots.txt for the sitemap URL(s)
  try {
    const robotsResponse = await httpClient.fetch(new URL('robots.txt', siteUrl).toString());
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      const robotsSitemapUrls = parseRobotsTxt(robotsTxt);
      if (robotsSitemapUrls && robotsSitemapUrls.length > 0) {
        // Create a list of promises for processing each sitemap found in robots.txt
        const sitemapFetchPromises = robotsSitemapUrls.map(async (robotsSitemapUrl) => {
          if (visitedSitemaps.includes(robotsSitemapUrl)) {
            return; // Skip already visited sitemaps
          }
          report(siteUrl, `Found Sitemap in robots.txt: ${robotsSitemapUrl}`);
          const response = await httpClient.fetch(robotsSitemapUrl);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            report(siteUrl, `Sitemap not found at ${robotsSitemapUrl}`);
          } else if (response.headers.get('content-type').includes('application/x-gzip')) {
            // Handle gzipped sitemap
            const buffer = Buffer.from(await response.arrayBuffer());
            const decompressed = zlib.gunzipSync(buffer).toString();
            await parseSitemap(decompressed, robotsSitemapUrl);
          } else {
            // Handle regular sitemap
            const xml = await response.text();
            await parseSitemap(xml, robotsSitemapUrl);
          }
        });

        // Wait for all sitemap processing promises to complete
        await Promise.all(sitemapFetchPromises);
        return urls; // Return the collected URLs after processing all sitemaps
      }
    }
  } catch (error) {
    report(siteUrl, `No robots.txt found for ${siteUrl}, using default sitemap URL.`);
  }

  // Fetch and parse the default sitemap if no sitemap URL is found in robots.txt
  try {
    const response = await httpClient.fetch(sitemapUrl);
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
      report(siteUrl, `Sitemap not found at ${sitemapUrl}`);
    } else {
      report(siteUrl, `Found Sitemap in default location: ${sitemapUrl}`);
      let xml;
      if (response.headers.get('content-type').includes('application/x-gzip')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        zlib.gunzipSync(buffer).toString();
      } else {
        xml = await response.text();
      }
      await parseSitemap(xml, sitemapUrl);
    }
  } catch (error) {
    visitedSitemaps.push(sitemapUrl);
    report(siteUrl, `Error fetching default sitemap ${siteUrl}: ${error}`);
  }

  return urls;
}

// Example usage
(async () => {
  const totalStartTime = process.hrtime();
  let totalPages = 0;

  const siteUrls = EXECUTE_SINGLE_SITE_REPORT
    ? [EXECUTE_SINGLE_SITE_REPORT]
    : await getSpacecatSitesUrls();

  for (const siteUrl of siteUrls) {
    if (!reportExists(siteUrl)) {
      const startTime = process.hrtime();
      console.log(`Processing: ${siteUrl}`);
      reportSite(siteUrl);
      // eslint-disable-next-line no-await-in-loop
      const pages = await fetchSitemapUrls(siteUrl);
      totalPages += pages.length;
      reportPages(siteUrl, pages);
      report(siteUrl, `ExecutionTime in Seconds ${hrtimeToSeconds(process.hrtime(startTime))}`);
    } else {
      console.log(`Skip: ${siteUrl}`);
    }
  }
  console.log(`Total Pages: ${totalPages}`);
  console.log(`Total time in Minutes: ${hrtimeToSeconds(process.hrtime(totalStartTime)) / 60}`);
})();
