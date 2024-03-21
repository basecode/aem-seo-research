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
import { Buffer } from 'buffer';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';
const siteUrl = process.argv[2];
const byOrg = process.argv[3] === 'true';
const organizationId = process.argv[4];
const channelId = process.argv[5];

async function makeApiCall(method, url, data = null) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: {
        'x-api-key': process.env.SPACECAT_API_KEY,
        'Content-Type': 'application/json',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok && response.status !== 404) throw new Error(`API call failed with HTTP status ${response.status}`);
    if (response.status === 404) return null;
    return await response.json(); // Assume DELETE requests might not return a body
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// eslint-disable-next-line no-shadow
async function getSiteByBaseUrl(siteUrl) {
  const base64Url = Buffer.from(siteUrl).toString('base64');
  try {
    return await makeApiCall('GET', `/sites/by-base-url/${base64Url}`);
  } catch (error) {
    console.error('Error fetching site:', error);
    return null; // Site does not exist or an error occurred
  }
}

// eslint-disable-next-line no-shadow
async function manageOrganizationAndSite(siteUrl, newSiteConfig) {
  const siteData = await getSiteByBaseUrl(siteUrl);
  if (siteData) {
    // Site exists, check and merge organization and site config
    const mergedSiteConfig = { ...siteData.config, ...newSiteConfig };
    const resp = await makeApiCall('PATCH', `/sites/${siteData.id}`, { config: mergedSiteConfig, organizationId });
    console.log(JSON.stringify(resp));
  } else {
    // Assume newSiteConfig does not have an organizationId, add it here
    await makeApiCall('POST', '/sites', { ...newSiteConfig, organizationId, baseURL: siteUrl });
  }
}

// Example usage
async function run() {
  const newSiteByOrgConfig = {
    alerts: [
      {
        type: '404',
      },
    ],
  };
  const newSiteBySiteConfig = {
    slack: {
      channel: channelId,
    },
    alerts: [
      {
        type: '404',
      },
    ],
  };
  try {
    if (byOrg) {
      await manageOrganizationAndSite(siteUrl, newSiteByOrgConfig);
    } else {
      await manageOrganizationAndSite(siteUrl, newSiteBySiteConfig);
    }
    console.log('Organization and site managed successfully');
  } catch (error) {
    console.error('Error managing organization or site:', error);
  }
}

run();
