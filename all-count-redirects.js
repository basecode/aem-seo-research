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
import axios from 'axios';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line no-unused-vars
const sleep = promisify(setTimeout);

const RUM_DASHBOARD_URL = 'https://helix-pages.anywhere.run/helix-services/run-query@v3/rum-dashboard';
const REDIRECT_THRESHOLD = 1000;
const USER_AGENT = 'basecode/many-redirects';

/*
Example output:
[
  'www.mydomain.com',
  'null',
  'main--mydomain--adobecom.hlx.live',
  'main--mydomain--adobecom.hlx.page',
  'Other',
];
*/
const getRumUrls = async () => {
  const response = await axios.get(`${RUM_DASHBOARD_URL}?limit=300`, {
    headers: {
      Authorization: `Bearer ${process.env.RUM_GLOBAL_KEY}`,
      'User-Agent': USER_AGENT,
    },
  });
  return response.data.results.data.map((item) => item.url);
};

const getRedirectUrls = (urls) => urls
  .filter((url) => url !== 'null' && url !== 'Other' && url !== 'undefined' && url !== ' ' && url !== '' && url != null && url)
  .map((url) => {
    if (url.startsWith('main--')) {
      return {
        url,
        redirectUrl: `https://${url}/redirects.json`,
      };
    }
    const parts = url.replace('www.', '').replace('http://', '').replace('https://', '').split('.');
    return {
      url,
      redirectUrl: `https://main--${parts[0]}--hlxsites.hlx.live/redirects.json`,
    };
  });

/*
Example output:
[
  {url: 'www.somedomain.com', total: 1752, redirectUrl: 'https://main--somedomain--hlxsites.hlx.live/redirects.json'},
];
*/
const getRedirectFiles = async (urls) => {
  const redirectUrls = [];

  const promises = urls.map(async (urlObject) => {
    try {
      const response = await axios.get(urlObject.redirectUrl, {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });
      if (response.data.total > REDIRECT_THRESHOLD) {
        return {
          url: urlObject.url,
          total: response.data.total,
          redirectUrl: urlObject.redirectUrl,
        };
      }
    } catch (e) { /* empty */ }
    return null;
  });

  const results = await Promise.all(promises);

  results.forEach((result) => {
    if (result) {
      redirectUrls.push(result);
    }
  });

  return redirectUrls;
};

(async function () {
  const rumUrls = await getRumUrls();
  const redirectUrls = getRedirectUrls(rumUrls);
  const redirectFiles = await getRedirectFiles(redirectUrls);
  console.log(redirectFiles);
}());
