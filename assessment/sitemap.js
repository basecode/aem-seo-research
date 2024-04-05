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
import zlib from 'zlib';
import dotenv from 'dotenv';

import { createAssessment } from './assessment-lib.js';
import {
  fetchAllPages, fetchSitemapsFromSource, findSitemap, USER_AGENT,
} from './utils/support.js';
import { parseStringPromise } from 'xml2js';
import {createAssessment, USER_AGENT} from './assessment-lib.js';
import HttpClient from './libs/fetch-client.js';

dotenv.config();

const httpClient = new HttpClient().getInstance();
const userSiteUrl = process.argv[2];

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

async function checkPage(url) {
  const warnings = [];
  const errors = [];
  // drafts files in sitemap
  if (url.includes('draft')) {
    warnings.push(`Detected draft file: ${url}`);
  }
  // file returns 2xx.
  try {
    const response = await httpClient.get(url);
    if (!response.ok) errors.push(`must return 2xx but returns ${response.status}`);
  } catch (error) {
    errors.push(`${url} returns error ${error.message}`);
  }

  return { errors, warnings };
}

export async function fetchSitemapsFromBaseUrl(url, sitemapSrc) {
  if (sitemapSrc) {
    return fetchSitemapsFromSource([
      new URL(sitemapSrc, url).toString(),
    ]);
  }
  let sitemaps = await findSitemap(userSiteUrl);
  if (!sitemaps.length) {
    sitemaps = await fetchSitemapsFromSource([
      { url: new URL('sitemap.xml', url).toString(), source: 'Default path /sitemap.xml' },
    ]);
    if (!sitemaps.length) {
      sitemaps = await fetchSitemapsFromSource([
        { url: new URL('sitemap_index.xml', url).toString(), source: 'Default path /sitemap_index.xml' },
      ]);
    }
  }
  return sitemaps;
}

export const sitemap = (async () => {
  const assessment = await createAssessment(userSiteUrl, 'Sitemap');
  assessment.setRowHeadersAndDefaults({
    sitemapOrPage: '',
    source: '',
    locs: 0,
    error: '',
    warning: '',
  });

  const sitemaps = await fetchAllPages(userSiteUrl);

  // Assessment for sitemaps
  sitemaps.forEach(async (sm) => {
    if (sm.url) {
      assessment.addColumn({
        sitemapOrPage: sm.url, source: sm.source, locs: sm.locs, error: sm.error || '', warning: sm.warning || '',
      });
    }
  });

  // Assessments for pages. We filer by unique pages, because they can appear in multiple sitemaps.
  const seenPages = new Set();
  const promises = sitemaps
    .filter((item) => !!item.page)
    .filter((item) => (seenPages.has(item.page) ? false : seenPages.add(item.page)))
    .map(async (item) => {
      const { errors, warnings } = await checkPage(item.page);
      if (errors.length > 0 || warnings.length > 0) {
        assessment.addColumn({
          sitemapOrPage: item.page, source: item.source, error: errors.join(', '), warning: warnings.join(', '),
        });
      }
    });

  await Promise.all(promises);

  assessment.end();
})();
