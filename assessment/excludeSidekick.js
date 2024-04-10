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
import HttpClient from './libs/fetch-client.js';

const httpClient = new HttpClient().getInstance();
const userSiteUrl = process.argv[2];

async function checkNoIndexMetaTag(url) {
  try {
    const response = await httpClient.get(url);
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

async function excludeSidekickAudit(mainUrl, assessment) {
  try {
    let response = await httpClient.get(`${mainUrl}/tools/sidekick/config.json`);
    let out = await response.json();
    const { plugins } = out;
    const firstPlugin = plugins[0];
    const { url } = firstPlugin;
    const urlTocheck = mainUrl + url;
    let hasNoIndex = await checkNoIndexMetaTag(urlTocheck);
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
    //if we came up to tha point we can also check if the blocs themselves have noindex set
    response = await httpClient.get(`${mainUrl}/sidekick/library.json`);
    out = await response.json();
    const blocksData = out.blocks.data;

    // Applying a function to each path inside the "blocks" object
    blocksData.forEach(async block => {
      // Perform your function on each block's path
    console.log(block.path);
    hasNoIndex = await checkNoIndexMetaTag(block.path);
    if (hasNoIndex) {
      console.log(`The page ${block.path} has noindex meta tag set.`);
      assessment.addColumn({
          url: block.path,
          hasNoIndex: 'noindex is set',
        });
      } else {
        console.log(`The page ${block.path} does not have noindex meta tag set.`);
        assessment.addColumn({
          url: urlTocheck,
          hasNoIndex: 'noindex is not set',
        });
      }
    });
  } catch (error) {
    console.error('The config.json or the library.json was not found or an error occurred:', error);
  }
}

export const excludeSidekick = (async () => {
  const assessment = await createAssessment(userSiteUrl, 'Has no index Metatag');
  assessment.setRowHeadersAndDefaults({
    url: '',
    hasNoIndex: '',
  });
  await excludeSidekickAudit(userSiteUrl, assessment);
  assessment.end();
  process.exit(0);
})();
