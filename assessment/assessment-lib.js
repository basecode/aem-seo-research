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

import fs from 'fs';
import path from 'path';
import { json2csv } from 'json-2-csv';
import { composeAuditURL } from '@adobe/spacecat-shared-utils';
import SpaceCatSdk from 'spacecat-sdk/src/sdk.js';
import { generateFileName, OUTPUT_DIR } from './file-lib.js';

export const USER_AGENT = 'basecode/seo-research-crawler/1.0';
export const SPACECAT_API_BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';

const hrtimeToSeconds = (hrtime) => {
  const [seconds, nanoseconds] = hrtime; // Destructuring for clarity
  return (seconds * 1e9 + nanoseconds) / 1e9; // Simplified calculation
};

export const createAssessment = async (siteUrl, userTitle) => {
  const TOTAL_START_HRTIME = process.hrtime();
  const csvContent = [];

  // Ensure the output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  console.log('Check if URL is qualified to be assessed. Needs to be part of spacecat catalogue');
<<<<<<< HEAD
  let SITE_URL='';
  if (/hlx\.live$/i.test(userSite)) { 
     SITE_URL = userSite; 
  }
  else {
    const SITE = await getSiteByBaseUrl(userSite);
    SITE_URL = SITE.baseURL;
  }
  const FILE_PATH = path.join(OUTPUT_DIR, `${generateFileName(SITE_URL, userTitle)}-${Date.now()}.csv`);

  console.log(`${userTitle}: Assessment for ${SITE_URL}`);
=======
  const spaceCatSdk = new SpaceCatSdk(
    { apiBaseUrl: SPACECAT_API_BASE_URL, apiKey: process.env.SPACECAT_API_KEY },
  );
  const site = await spaceCatSdk.getSite(siteUrl);
  const siteAuditUrl = await composeAuditURL(site.baseURL);
  const reportFilePath = path.join(OUTPUT_DIR, `${generateFileName(siteAuditUrl, userTitle)}-${Date.now()}.csv`);
  console.log(`${userTitle}: Assessment for ${siteAuditUrl}`);
>>>>>>> main

  let rowHeadersAndDefaults;

  return {
    getSite() {
      return site;
    },
    getSiteAuditUrl() {
      return siteAuditUrl;
    },
    setRowHeadersAndDefaults(arg) {
      rowHeadersAndDefaults = arg;
    },
    // TODO: should be addRow actually...
    addColumn(column) {
      const merge = { ...rowHeadersAndDefaults, ...column };
      csvContent.push(merge);
    },
    getRows() {
      return csvContent;
    },
    end() {
      console.log(`Processing time in Minutes: ${hrtimeToSeconds(process.hrtime(TOTAL_START_HRTIME)) / 60}`);
      const csv = json2csv(csvContent);
      fs.writeFileSync(reportFilePath, csv);
    },
  };
};

export const getRobotsTxt = async (siteUrl) => {
  const defaultReturnValue = {
    sitemaps: null,
    exists: false,
    error: null,
  };

  const parseRobotsTxt = (robotsTxt) => {
    try {
      const regex = /Sitemap:\s*(https?:\/\/[^\s]+)/g;
      let match;
      const sitemaps = [];
      // eslint-disable-next-line no-cond-assign
      while ((match = regex.exec(robotsTxt)) !== null) {
        sitemaps.push(match[1]);
      }
      return {
        ...defaultReturnValue,
        exists: true,
        sitemaps: sitemaps.length > 0 ? sitemaps : null,
      };
    } catch (error) {
      return { ...defaultReturnValue, ...{ exists: true, sitemaps: null, error } };
    }
  };

  try {
    const robotsResponse = await fetch(new URL('robots.txt', siteUrl).toString(), {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      return parseRobotsTxt(robotsTxt);
    }
    return defaultReturnValue;
  } catch (error) {
    return { ...defaultReturnValue, error };
  }
};
