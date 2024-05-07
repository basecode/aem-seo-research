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
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
import { makeSpaceCatApiCall } from './lib.js';
import HttpClient from './assessment/libs/fetch-client.js';

dotenv.config();

const httpClient = HttpClient.getInstance();
const ISO6391 = require('iso-639-1');

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

const getSpacecatSitesUrls = async () => {
    const response = await makeSpaceCatApiCall('get', '/sites');
    return response
      .filter((item) => item.deliveryType === 'aem_edge')
      .map((item) => item.baseURL);
  };


async function testUrlIfIsUS(loc) {
   const url = new URL(loc);

  // Extract the existing language code (if any)
  const existingLanguageCode = url.pathname.split('/')[1]; // Assumes language code is the first segment

  // Check if the existing language code is valid and not already "uk"
  if (existingLanguageCode && !ISO6391.validate(existingLanguageCode)) {
    // Add "/uk/" to the URL if no language code exists
    url.pathname = `/uk${url.pathname}`;
    const response = await httpClient.fetch(url.pathname, 'HEAD');
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
        report(siteUrl, `No translation found at ${sitemapUrl}`);
    } else {
        report(siteUrl, `Translation found for: ${sitemapUrl}`);
     }
   }
}

function parseXMLSitemap(sitemapContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sitemapContent, 'text/xml');
    const urlElements = xmlDoc.getElementsByTagName('url');
for (let i = 0; i < urlElements.length; i++) {
    const urlElement = urlElements[i];
    const loc = urlElement.getElementsByTagName('loc')[0].textContent;
    testUrlIfIsUS(loc);
    }
}



async function fetchSitemapUrls(siteUrl) {
    const sitemapUrl = new URL('sitemap.xml', siteUrl).toString(); // Default sitemap location
    const urls = [];
    try {
        const response = await httpClient.fetch(sitemapUrl);
        if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            report(siteUrl, `Sitemap not found at ${sitemapUrl}`);
        } else {
            report(siteUrl, `Found Sitemap in default location: ${sitemapUrl}`);
            let xml;
                xml = await response.text();
            }
            await parseXMLSitemap(xml);
        }
         catch (error) {
        report(siteUrl, `Error fetching default sitemap ${siteUrl}: ${error}`);
    }

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
             await fetchSitemapUrls(siteUrl);
            report(siteUrl, `ExecutionTime in Seconds ${hrtimeToSeconds(process.hrtime(startTime))}`);
        } else {
            console.log(`Skip: ${siteUrl}`);
        }
    }
    console.log(`Total Pages: ${totalPages}`);
    console.log(`Total time in Minutes: ${hrtimeToSeconds(process.hrtime(totalStartTime)) / 60}`);
})();
