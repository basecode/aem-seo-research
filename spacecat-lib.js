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
import { USER_AGENT } from './assessment/utils/support.js';

const BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';

export async function makeApiCall(method, url, data = null) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      method,
      headers: {
        'x-api-key': process.env.SPACECAT_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) throw new Error(`API call failed with HTTP status ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

export async function getSiteByBaseUrl(siteUrl) {
  const base64Url = Buffer.from(siteUrl).toString('base64');
  try {
    return await makeApiCall('GET', `/sites/by-base-url/${base64Url}`);
  } catch (error) {
    console.error('Error fetching site:', error);
    return null; // Site does not exist or an error occurred
  }
}
