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
import sitesData from './sites-data.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pss-urls');

// Ensure the reports directory exists
if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR);
}

dotenv.config();

(async function () {
  const sanitizeFilename = (url) => url.replace(/[^a-zA-Z0-9]/g, '_');
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';

  await Promise.all(sitesData.map(async (site) => {
    // stop when we reach 10 sites
    // if (sitesData.indexOf(site) > 1000) {
    //  return;
    // }

    // Ensure page is defined
    if (!('finalUrl' in site) || !site.finalUrl) return;

    const { finalUrl: page } = site;

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

      if (hasRUM || deliveryType) {
        // console.log(`hasRUM: ${hasRUM}; deliveryType: ${deliveryType}; ${page}`);
      }

      if (isError) {
        // console.error(`Error fetching ${page}`);
      }

      // Update sitesData
      const siteIndex = sitesData.findIndex((s) => s.finalUrl === page);
      if (siteIndex !== -1) {
        // eslint-disable-next-line no-nested-ternary
        if (isError) sitesData[siteIndex].status = text.includes('ERROR - ') ? text.replace('ERROR - ', '') : (text.includes('Incapsula') ? 'Incapsula blocker' : '');
        sitesData[siteIndex].hasRUM = hasRUM;
        sitesData[siteIndex].deliveryType = deliveryType;
      }

      return;
    }

    // fetch the page and cache the response
    try {
      if (!page.includes('https')) return;
      const response = await fetch(page, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Connection: 'keep-alive',
        },
      });
      if (!response.ok) {
        console.error(`Failed to fetch ${page}`);
      } else {
        const text = await response.text(); // Await the response text
        fs.writeFileSync(path.join(DIR, `${sanitizeFilename(page)}.txt`), text);
      }
    } catch (error) {
      console.error(`Error fetching ${page}:`, error.message);
      fs.writeFileSync(path.join(DIR, `${sanitizeFilename(page)}.txt`), `ERROR - ${error.message}`);
    }
  }));

  // Write sitesData to sites-data-excel-output.txt. Format shall be CSV
  let output = 'Customer Name,Country,Website,Final URL,Status,Batch,Delivery Type,Has RUM,IMS Org\n';
  sitesData.forEach((site) => {
    output += `${site.customerName};${site.country};${site.website};${site.finalUrl};${site.status};${site.batch};${site.deliveryType};${site.hasRUM};${site.imsOrg}\n`;
  });
  fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'sites-data-excel-output.csv'), output);
}());
