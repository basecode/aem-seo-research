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
import ISO6391 from 'iso-639-1';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
// eslint-disable-next-line import/no-unresolved
// import { makeSpaceCatApiCall } from './lib.js';
import { DOMParser } from 'xmldom';
import { json2csv } from 'json-2-csv';
import { parse } from 'csv-parse';
import HttpClient from './assessment/libs/fetch-client.js';
// import Assessment from './libs/assessment-lib.js';

let found = 0;
let notFound = 0;
const resultJson = [];
const httpClient = HttpClient.getInstance();
const csvFilePath = './top200url.csv';
// const ISO6391 = require('iso-639-1');

// const visitedSitemaps = [];

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

/* const async report = (site, message) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(message);
  fs.appendFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `${message}\n`);
};  */

const report = async (site, message) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(message);
  try {
    await fs.promises.appendFile(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `${message}\n`);
  } catch (error) {
    console.error('Error appending to file:', error);
    // Handle the error as needed
  }
};

const reportSite = (site) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(`Report for ${site}`);
  fs.writeFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `Report for ${site}\n`);
  report(site, `Date: ${Date.now()}`);
};

/*
const getSpacecatSitesUrls = async () => {
  const response = await makeSpaceCatApiCall('get', '/sites');
  return response
    .filter((item) => item.deliveryType === 'aem_edge')
    .map((item) => item.baseURL);
};
*/

async function testUrlIfIsInUK(loc, siteUrl, i) {
  const url = new URL(loc);
  const existingLanguageCode = url.pathname.split('/')[1];

  if (existingLanguageCode && !ISO6391.validate(existingLanguageCode)) {
    url.pathname = `/uk${url.pathname}`;
    const newUrl = `https://${url.hostname}${url.pathname}`;
    console.log(`checking response from ${newUrl}`);
    await report(siteUrl, `checking response from ${newUrl}`);

    try {
      const response = await httpClient.fetch(newUrl, 'HEAD');
      if (!response.ok || response.status === '404') {
        //console.log(response);
        console.log(`No translation found at ${newUrl}`);
        await report(siteUrl, `No translation found at ${newUrl}`);
        resultJson[`url${i + 1}`] = siteUrl;
        const isTranslated = false;
        const urlTranslated = { newUrl, isTranslated };
        resultJson.push(urlTranslated);
        notFound++;
      } else {
        //console.log(response);
        console.log(`Translation found for: ${newUrl}`);
        await report(siteUrl, `Translation found for: ${newUrl}`);
        resultJson[`url${i + 1}`] = siteUrl;
        const isTranslated = true;
        const urlNotTranslated = { newUrl, isTranslated };
        resultJson.push(urlNotTranslated);
        found++;
      }
    } catch (error) {
      console.error(`Error fetching ${newUrl}:`, error);
      await report(siteUrl, `Error fetching ${newUrl}: ${error}`);
    }
  }
}

async function parseXMLSitemap(sitemapContent, siteUrl) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sitemapContent, 'text/xml');
    const urlElements = xmlDoc.getElementsByTagName('url');
    // for (let i = 0; i < 10; i++)
    for (let i = 0; i < urlElements.length; i++) {
      const urlElement = urlElements[i];
      const loc = urlElement.getElementsByTagName('loc')[0].textContent;
      await testUrlIfIsInUK(loc, siteUrl, i);
    }
  } catch (error) { console.log(error); }
}

async function fetchUrlsFromfile(file, siteUrl, startTime, totalStartTime) {
  return new Promise((resolve, reject) => {
    try {
      let numberOfURLs = 0;
      const parser = parse({ delimiter: ';' });

      parser.on('readable', async () => {
        let record;
        while ((record = parser.read())) {
          const loc = record.toString();
          console.log(loc);
          try {
            await testUrlIfIsInUK(loc, siteUrl, numberOfURLs);
          } catch (error) {
            console.error('Error processing URL:', error);
          }
          numberOfURLs++;
        }
      });

      parser.on('error', (error) => {
        console.error('Error reading CSV:', error);
        reject(error);
      });

      parser.on('end', () => {
        console.log('CSV parsing complete.');
        resolve(); // Resolve the promise when parsing is complete
      });

      fs.createReadStream(csvFilePath)
        .pipe(parser)
        .on('error', (error) => {
          console.error('Error reading CSV file:', error);
          reject(error);
        });
    } catch (error) {
      console.error('Error parsing CSV file:', error);
      reject(error);
    }
  });
}

/*
async function fetchUrlsFromSitemap(siteUrl) {
  const sitemapUrl = new URL('sitemap.xml', siteUrl).toString(); // Default sitemap location
  try {
    const response = await httpClient.fetch(sitemapUrl);
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
      report(siteUrl, `Sitemap not found at ${sitemapUrl}`);
    } else {
      console.log(`Found Sitemap in default location: ${sitemapUrl}`);
      report(siteUrl, `Found Sitemap in default location: ${sitemapUrl}`);
      let xml;
      xml = await response.text();
      await parseXMLSitemap(xml, siteUrl);
    }
  } catch (error) {
    console.log(error);
    report(siteUrl, `Error fetching default sitemap ${siteUrl}: ${error}`);
  }
} */

// Example usage
(async () => {
  const totalStartTime = process.hrtime();
  const siteUrl = 'https://www.servicenow.com/blogs/';
  const startTime = process.hrtime();

  try {
    console.log(`Processing: ${siteUrl}`);
    reportSite(siteUrl);
    await fetchUrlsFromfile(csvFilePath, siteUrl, startTime, totalStartTime); // Asynchronous operation
    // Logging statements moved inside fetchUrlsFromfile function
    console.log('CSV parsing complete.');
    console.log(`We had ${notFound} pages without translation and ${found} pages with translation`);

    const csv = json2csv(resultJson);
    const summaryFilePath = path.join('./reports/', `summary-${sanitizeFilename(siteUrl)}-${new Date().toISOString()}.csv`);
    fs.writeFileSync(summaryFilePath, csv);

    const executionTime = hrtimeToSeconds(process.hrtime(startTime));
    console.log(`ExecutionTime in Seconds ${executionTime}`);
    report(siteUrl, `ExecutionTime in Seconds ${executionTime}`);

    console.log(`Total time in Minutes: ${hrtimeToSeconds(process.hrtime(totalStartTime)) / 60}`);
    // Remaining logging statements removed from here
  } catch (error) {
    console.error('An error occurred:', error);
    // Handle the error as needed (e.g., log it, report it, etc.)
  }
})();
