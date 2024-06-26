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

import * as cheerio from 'cheerio';
import AhrefsAPIClient from 'spacecat-audit-worker/src/support/ahrefs-client.js';
import Assessment from './libs/assessment-lib.js';
import { fetchAllPages } from './sitemap.js';
import HttpClient from './libs/fetch-client.js';

const PARAMS = '?';
const httpClient = HttpClient.getInstance();

const startsWithWww = (url) => url.startsWith('https://www.');
const endsWithSlash = (url) => url.endsWith('/');
const endsWithHtml = (url) => url.endsWith('.html');
const containsParams = (url) => url.includes(PARAMS);

const delay = (duration) => new Promise((resolve) => {
  setTimeout(resolve, duration);
});

const fetchWithRetry = async (url, maxRetries = 3, initialBackoff = 300) => {
  let retries = maxRetries;
  let backoff = initialBackoff;

  const attemptFetch = async (attemptUrl) => {
    try {
      return await httpClient.fetch(attemptUrl);
    } catch (error) {
      if (retries > 0) {
        console.log(`Error fetching URL ${url}: ${error.message}. Retrying in ${backoff}ms`);
        await delay(backoff);
        backoff *= 2;
        retries -= 1;
        // Recursive call
        return attemptFetch(url);
      }
      // Rethrow error after exhausting retries
      throw error;
    }
  };

  return attemptFetch(url);
};

const checkForCanonical = async (url, sitemapUrls, assessment, devBaseURL) => {
  const path = new URL(url).pathname;
  const fetchURL = devBaseURL ? new URL(path, devBaseURL).href : url;

  try {
    const response = await fetchWithRetry(fetchURL);
    const finalUrl = response.url;
    const finalPath = new URL(finalUrl).pathname;
    const contentType = response.headers.get('content-type');

    if (!contentType || !contentType.includes('text/html')) {
      // Skip non-HTML content
      return;
    }

    const htmlContent = await response.text();
    console.log(finalUrl);
    const $ = cheerio.load(htmlContent);
    const canonicalLinkElement = $('link[rel="canonical"]').attr('href');
    const canonicalBaseURL = canonicalLinkElement || finalUrl;
    const canonicalLink = canonicalLinkElement ? new URL(canonicalBaseURL, finalUrl).href : null;
    const canonicalPath = canonicalLink ? new URL(canonicalLink).pathname : null;

    if (!canonicalLink) throw new Error('No canonical link found');

    const alternatives = devBaseURL ? [] : [
      startsWithWww(url) ? url.replace('https://www.', 'https://') : `https://www.${url.slice(8)}`,
      endsWithSlash(url) ? url.slice(0, -1) : `${url}/`,
      endsWithHtml(url) ? url.slice(0, -5) : `${url}.html`,
    ];

    const isCanonicalInSitemap = sitemapUrls.some(
      (obj) => (
        devBaseURL ? new URL(obj.page).pathname === canonicalPath : obj.page === canonicalLink
      ),
    );

    const canonicalMatch = devBaseURL ? finalPath === canonicalPath : finalUrl === canonicalLink;

    const alternativeInSitemap = alternatives.map(
      (alternativeUrl) => sitemapUrls.some((obj) => obj.page === alternativeUrl),
    );

    const missingCanonicalReasons = devBaseURL ? [] : [
      alternativeInSitemap[0] && 'WWW version in sitemap',
      alternativeInSitemap[1] && 'Trailing slash version in sitemap',
      alternativeInSitemap[2] && 'HTML extension version in sitemap',
    ].filter(Boolean);

    const issues = [
      !devBaseURL && !isCanonicalInSitemap && missingCanonicalReasons.length === 0 && 'Canonical not in sitemap',
      !isCanonicalInSitemap && missingCanonicalReasons.length > 0 && `Canonical not in sitemap, but alternative found: ${missingCanonicalReasons.join(', ')}`,
      !canonicalMatch && 'Canonical URL does not match page URL',
      containsParams(finalUrl) && 'URL contains parameters',
    ].filter(Boolean);

    if (issues.length > 0) {
      assessment.addRow({
        url: finalUrl,
        status: response.status,
        issues: issues.join('. '),
      });
    }
  } catch (error) {
    assessment.addRow({
      url: fetchURL,
      error: error.message,
    });
  }
};

const canonicalAudit = async (options, assessment) => {
  const {
    baseURL, devBaseURL, siteAuditURL, sitemap, topPages,
  } = options;

  console.log(`Fetching pages on audit url ${siteAuditURL}, from sitemap ${sitemap ? `provided at ${sitemap}` : ''}`);
  const sitemapUrls = await fetchAllPages(baseURL, sitemap);

  console.log(`Fetching top ${topPages} pages from Ahrefs`);
  const ahrefsClient = new AhrefsAPIClient({
    apiKey: process.env.AHREFS_API_KEY,
    apiBaseUrl: 'https://api.ahrefs.com/v3',
  }, httpClient.getFetch());

  const fetchTopPages = async (url) => ahrefsClient.getTopPages(url, topPages);

  const responseNoWWW = await fetchTopPages(siteAuditURL.replace(/^www\./, ''));
  const responseWithWWW = siteAuditURL.startsWith('www.') ? await fetchTopPages(siteAuditURL) : await fetchTopPages(`www.${siteAuditURL}`);

  const sumTraffic = (pages) => pages.reduce((acc, page) => acc + page.sum_traffic, 0);
  const totalTrafficNoWWW = sumTraffic(responseNoWWW.result.pages);
  const totalTrafficWithWWW = sumTraffic(responseWithWWW.result.pages);
  const response = totalTrafficNoWWW > totalTrafficWithWWW ? responseNoWWW : responseWithWWW;

  const canonicalCheckPromises = response.result.pages
    .filter((page) => page.url)
    .map((page) => checkForCanonical(
      page.url,
      sitemapUrls.filter(
        (sitemapUrl) => sitemapUrl.page,
      ),
      assessment,
      devBaseURL,
    ));
  return Promise.all(canonicalCheckPromises);
};

export const canonical = async (options) => {
  const title = 'Canonical Audit';
  const assessment = new Assessment(options, title);
  assessment.setRowHeadersAndDefaults({
    url: '',
    issues: '',
    error: '',
  });
  await canonicalAudit(options, assessment);
  assessment.end();
  return {
    auditType: title,
    amountOfIssues: assessment.getRows().length,
    location: assessment.reportFilePath,
  };
};
