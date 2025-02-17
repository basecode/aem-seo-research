/*
 * Copyright 2025 Adobe. All rights reserved.
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
// eslint-disable-next-line import/no-unresolved
import fetch from 'node-fetch';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import https from 'https';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pss-urls');

// Ensure the reports directory exists
if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR);
}

// read csv file and store the data in sitesData
// eslint-disable-next-line no-unused-vars
const readCSV = (file) => {
  const data = fs.readFileSync(file, 'utf-8');
  const lines = data.split('\n');
  const obj = [];
  lines.forEach((line) => {
    const [customerName, country, website, finalUrl, status, batch, deliveryType, hasRUM, imsOrg] = line.split('\t');
    obj.push({
      customerName,
      country,
      website,
      finalUrl,
      status,
      batch,
      deliveryType,
      hasRUM,
      imsOrg,
    });
  });
  return obj;
};

const sitesData = readCSV(path.join(path.dirname(fileURLToPath(import.meta.url)), 'sites-data-excel-used-for-input-and-output.csv'));

dotenv.config();

(async function main() {
  const sanitizeFilename = (url) => url.replace(/[^a-zA-Z0-9]/g, '_');
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
  ];

  const fetchWithTimeout = (url, options, timeout = 10000) => Promise.race([
    fetch(url, options),
    new Promise((_, reject) => { setTimeout(() => reject(new Error('Timeout')), timeout); }),
  ]);

  const agent = new https.Agent({
    rejectUnauthorized: false, // Ignore SSL certificate errors
  });

  await Promise.all(sitesData.map(async (site) => {
    // Ensure page is defined
    let page;
    let isFinalUrl = false;
    if (site.finalUrl) {
      isFinalUrl = true;
      page = site.finalUrl;
    } else if (site.website) {
      page = site.website;
    } else {
      return;
    }

    // read the cached file if it exists
    const filename = path.join(DIR, `${sanitizeFilename(page)}.txt`);
    if (fs.existsSync(filename)) {
      const text = fs.readFileSync(filename, 'utf-8');
      const isEDS = text.includes('franklin-lib.js') || text.includes('aem.js');
      const hasRUM = text.includes('rum-standalone.js') || isEDS;
      const isAEM = text.includes('clientlibs') ? 'AEM-CS' : '';
      const isError = text.includes('ERROR - ') || text.includes('Incapsula');
      // eslint-disable-next-line no-nested-ternary
      const deliveryType = isEDS ? 'EDS' : (isAEM ? 'AEM-CS' : '');

      // Update sitesData
      const siteIndex = (isFinalUrl)
        ? sitesData.findIndex((s) => s.finalUrl === page)
        : sitesData.findIndex((s) => s.website === page);
      if (siteIndex !== -1) {
        // eslint-disable-next-line no-nested-ternary
        if (isError) sitesData[siteIndex].status = text.includes('ERROR - ') ? text.replace('ERROR - ', '') : (text.includes('Incapsula') ? 'Incapsula blocker' : '');
        sitesData[siteIndex].hasRUM = hasRUM;
        sitesData[siteIndex].deliveryType = deliveryType;
        sitesData[siteIndex].batch = (hasRUM) ? 'Oppties pending' : 'Won\'t';
      }

      return;
    }

    // fetch the page and cache the response
    try {
      if (!page.includes('https')) return;
      const response = await fetchWithTimeout(page, {
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Connection: 'keep-alive',
          Referer: 'https://www.google.com/',
          DNT: '1',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        agent,
      });
      if (!response.ok) {
        fs.writeFileSync(path.join(DIR, `${sanitizeFilename(page)}.txt`), `ERROR - ${response.status} ${response.statusText}`);
      } else {
        const text = await response.text(); // Await the response text
        fs.writeFileSync(path.join(DIR, `${sanitizeFilename(page)}.txt`), text);
      }
    } catch (error) {
      fs.writeFileSync(path.join(DIR, `${sanitizeFilename(page)}.txt`), `ERROR - ${error.message}`);
    }
  }));

  // eslint-disable-next-line max-len
  // 'Customer Name\tCountry\tWebsite\tFinal URL\tCrawl Status\tOnboarded\tDelivery Type\tHas RUM\tIMS Org\t'
  // Write sitesData to sites-data-excel-output.txt. Format shall be CSV
  let output = '';
  sitesData.forEach((site) => {
    output += `${site.customerName}\t${site.country}\t${site.website}\t${site.finalUrl}\t${site.status}\t${site.batch}\t${site.deliveryType}\t${site.hasRUM}\t${site.imsOrg}\n`;
  });
  fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'sites-data-excel-used-for-input-and-output.csv'), output);
}());
