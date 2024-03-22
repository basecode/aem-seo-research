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
import zlib from 'zlib';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { parseStringPromise } from 'xml2js';
import { createAssessment, getRobotsTxt, USER_AGENT } from './assessment-lib.js';

dotenv.config();

const userAgentHeader = { headers: { 'User-Agent': USER_AGENT } };
const userSiteUrl = process.argv[2];

async function checkPage(url) {
  const warnings = [];
  const errors = [];
  // drafts files in sitemap
  if (url.includes('draft')) {
    warnings.push(`Detected draft file: ${url}`);
  }
  // file returns 2xx.
  try {
    const response = await fetch(url, { method: 'HEAD', 'User-Agent': USER_AGENT });
    if (!response.ok) errors.push(`must return 2xx but returns ${response.status}`);
  } catch (error) {
    errors.push(`${url} returns error ${error.message}`);
  }

  return { errors, warnings };
}

async function fetchSitemapXml(url) {
  const response = await fetch(url, userAgentHeader);
  if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
    throw new Error(`HTTP Response Code: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
  }
  const contentType = response.headers.get('content-type');
  const xml = contentType.includes('application/x-gzip')
    ? zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString()
    : await response.text();
  return xml;
}

async function fetchSitemapsFromSource(sources) {
  async function parseSitemap(xml, sitemapObject) {
    try {
      const result = await parseStringPromise(xml);
      if (result.urlset && result.urlset.url) {
        return [{
          url: sitemapObject.url,
          source: sitemapObject.source,
          locs: result.urlset.url.length,
        }, ...result.urlset.url.map((urlEntry) => ({
          page: urlEntry.loc[0],
          source: sitemapObject.url,
        }))];
      } else if (result.sitemapindex && result.sitemapindex.sitemap) {
        const sitemaps = await fetchSitemapsFromSource(result.sitemapindex.sitemap.map((entry) => ({
          url: entry.loc[0],
          source: sitemapObject.url,
        })));
        return [{
          url: sitemapObject.url,
          source: sitemapObject.source,
          locs: result.sitemapindex.sitemap.length,
        }, ...sitemaps];
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    return [];
  }

  const sitemapFetchPromises = sources.map(async (sitemapObject) => {
    try {
      try {
        const fetchedXml = await fetchSitemapXml(sitemapObject.url);
        return await parseSitemap(fetchedXml, sitemapObject);
      } catch (fetchError) {
        return { url: sitemapObject.url, source: sitemapObject.source, error: fetchError.message };
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      return [];
    }
  });

  const urls = await Promise.all(sitemapFetchPromises);
  return urls.flat();
}

// Handle Sitemap in robots.txt
async function fetchSitemapsFromRobots(siteUrl) {
  const robots = await getRobotsTxt(siteUrl);
  const sitemapSources = [];
  if (robots.exists && robots.sitemaps) {
    sitemapSources.push(...robots.sitemaps.map((url) => ({ url, source: '/robots.txt' })));
  }
  return fetchSitemapsFromSource(sitemapSources);
}

(async () => {
  const assessment = await createAssessment(userSiteUrl, 'Sitemap');
  assessment.setRowHeadersAndDefaults({
    sitemapOrPage: '',
    source: '',
    locs: 0,
    error: '',
    warning: '',
  });

  let sitemaps = await fetchSitemapsFromRobots(userSiteUrl);
  if (!sitemaps.length) {
    sitemaps = await fetchSitemapsFromSource([
      { url: new URL('sitemap.xml', userSiteUrl).toString(), source: 'Default path /sitemap.xml' },
    ]);
    if (!sitemaps.length) {
      sitemaps = await fetchSitemapsFromSource([
        { url: new URL('sitemap_index.xml', userSiteUrl).toString(), source: 'Default path /sitemap_index.xml' },
      ]);
    }
  }

  // Assessment for sitemaps
  sitemaps.forEach(async (sitemap) => {
    if (sitemap.url) {
      assessment.addColumn({
        sitemapOrPage: sitemap.url, source: sitemap.source, locs: sitemap.locs, error: sitemap.error || '', warning: sitemap.warning || '',
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
