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
import { JSDOM } from 'jsdom';
import { createAssessment } from './assessment-lib.js';

const userSiteUrl = process.argv[2];

async function checkNoIndexMetaTag(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const headElement = document.querySelector('head');
    const metaRobots = headElement.querySelector('meta[name="robots"]');

    if (metaRobots && metaRobots.getAttribute('content').toLowerCase().includes('noindex')) {
      return true; // Page has noindex meta tag
    } else {
      return false; // Page does not have noindex meta tag
    }
  } catch (error) {
    console.error('Error fetching or parsing HTML:', error);
    return false;
  }
}

async function excludeSidekick(mainUrl, assessment) {
  try {
    const response = await fetch(`${mainUrl}/tools/sidekick/config.json`);
    const out = await response.json();
    const { plugins } = out;
    const firstPlugin = plugins[0];
    const { url } = firstPlugin;
    const urlTocheck = mainUrl + url;
    const hasNoIndex = await checkNoIndexMetaTag(urlTocheck);
    if (hasNoIndex) {
      console.log(`The page ${urlTocheck} has noindex meta tag set.`);
      assessment.addColumn({
        url: urlTocheck,
        hasNoIndex: 'noindex is set',
      });
    } else {
      console.log(`The page ${urlTocheck} does not have noindex meta tag set.`);
      assessment.addColumn({
        url: urlTocheck,
        hasNoIndex: 'noindex is not set',
      });
    }
  } catch (error) {
    console.error('The config.json was not found or an error occurred:', error);
  }
}

(async () => {
  const assessment = await createAssessment(userSiteUrl, 'Has no index Metatag');
  assessment.setRowHeadersAndDefaults({
    url: '',
    hasNoIndex: '',
  });
  await excludeSidekick(userSiteUrl, assessment);
  assessment.end();
  process.exit(0);
})();