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
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';

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

// Example usage
async function run() {
  try {
    const sites = await makeApiCall('GET', '/sites');
    const enabled = sites.filter((site) => site.config.imports?.filter((item) => item.sources?.includes('google')).length > 0).map((site) => site.baseURL);
    console.log(enabled);
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
