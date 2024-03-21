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
const visitedSitemaps = [];
const userSiteUrl = process.argv[2];

async function parseSitemap(xml, source) {
  if (visitedSitemaps.includes(source)) return [];
  try {
    const result = await parseStringPromise(xml);
    if (result.urlset && result.urlset.url) {
      return result.urlset.url.map((urlEntry) => urlEntry.loc[0]);
    } else if (result.sitemapindex && result.sitemapindex.sitemap) {
      const sitemapFetchPromises = result.sitemapindex.sitemap.map(async (sitemap) => {
        const sitemapIndexUrl = sitemap.loc[0];
        if (visitedSitemaps.includes(sitemapIndexUrl)) return undefined;
        visitedSitemaps.push(sitemapIndexUrl);
        const response = await fetch(sitemapIndexUrl, userAgentHeader);
        if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
          throw new Error(`Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
        }
        const contentType = response.headers.get('content-type');
        const content = contentType.includes('application/x-gzip')
          ? zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString()
          : await response.text();
        return parseSitemap(content, sitemapIndexUrl);
      });
      const sitemapIndexUrls = await Promise.all(sitemapFetchPromises);
      return sitemapIndexUrls.flat();
    }
  } catch (error) {
    visitedSitemaps.push(source);
    throw error;
  }
  return [];
}

async function fetchSitemapUrls(siteUrl, assessment) {
  const sitemapUrl = new URL('sitemap.xml', siteUrl).toString();
  visitedSitemaps.push(sitemapUrl); // Prevent re-fetching the same sitemap

  // Handle both robots.txt sitemaps and the default sitemap.xml
  const sitemapSources = [sitemapUrl];
  const robots = await getRobotsTxt(siteUrl);
  if (robots.exists && robots.sitemaps) {
    sitemapSources.push(...robots.sitemaps);
  }

  const sitemapFetchPromises = sitemapSources.map(async (source) => {
    try {
      const response = await fetch(source, userAgentHeader);
      if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
        throw new Error(`Sitemap at ${source} not found or invalid.`);
      }
      const contentType = response.headers.get('content-type');
      const content = contentType.includes('application/x-gzip')
        ? zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString()
        : await response.text();
      const urls = await parseSitemap(content, source);
      assessment.addColumn({ sitemap: source, source, locs: urls.length });
    } catch (error) {
      assessment.addColumn({ sitemap: source, source, error: error.message });
    }
  });

  await Promise.all(sitemapFetchPromises);
}

(async () => {
  const assessment = await createAssessment(userSiteUrl, 'Sitemap');
  assessment.setRowHeadersAndDefaults({
    sitemap: '',
    source: '',
    locs: 0,
    error: '',
    warning: '',
  });
  await fetchSitemapUrls(userSiteUrl, assessment);
  assessment.end();
})();
