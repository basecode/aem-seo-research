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
import dotenv from 'dotenv';

import { parseStringPromise } from 'xml2js';
import { createAssessment } from './assessment-lib.js';
import HttpClient from './libs/fetch-client.js';

dotenv.config();

export const ERROR_CODES = {
  INVALID_URL: 'INVALID_URL',
  ROBOTS_NOT_FOUND: 'ROBOTS_TXT_NOT_FOUND',
  NO_SITEMAP_IN_ROBOTS: 'NO_SITEMAP_IN_ROBOTS_TXT',
  SITEMAP_NOT_FOUND: 'SITEMAP_NOT_FOUND',
  SITEMAP_INDEX_NOT_FOUND: 'SITEMAP_INDEX_NOT_FOUND',
  SITEMAP_EMPTY: 'SITEMAP_EMPTY',
  SITEMAP_NOT_XML: 'SITEMAP_NOT_XML',
  FETCH_ERROR: 'FETCH_ERROR',
};

const httpClient = new HttpClient().getInstance();

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
    const robotsResponse = await httpClient.get(new URL('robots.txt', siteUrl).toString());
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      return parseRobotsTxt(robotsTxt);
    }
    return defaultReturnValue;
  } catch (error) {
    return { ...defaultReturnValue, error };
  }
};

/**
 * Fetches the content from a given URL.
 *
 * @async
 * @param {string} targetUrl - The URL from which to fetch the content.
 * @returns {Promise<string|null>} - A Promise that resolves to the content
 * of the response as a string if the request was successful, otherwise null.
 */
export async function fetchContent(targetUrl) {
  const response = await httpClient.get(targetUrl);
  return response.ok ? response.text() : null;
}

export function extractDomainAndProtocol(inputUrl) {
  try {
    const parsedUrl = new URL(inputUrl);
    return {
      protocol: parsedUrl.protocol.slice(0, -1),
      domain: parsedUrl.hostname,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Checks the validity and existence of a sitemap by fetching its content.
 *
 * @async
 * @param {string} sitemapUrl - The URL of the sitemap to check.
 * @returns {Promise<Object>} - A Promise that resolves to an object
 * representing the result of the sitemap check.
 */
export async function checkSitemap(sitemapUrl) {
  try {
    const sitemapContent = await fetchContent(sitemapUrl);
    if (!sitemapContent) {
      return {
        existsAndIsValid: false,
        reasons: [ERROR_CODES.SITEMAP_NOT_FOUND, ERROR_CODES.SITEMAP_EMPTY],
      };
    }
    const isValidXml = sitemapContent.trim().startsWith('<?xml');
    return {
      existsAndIsValid: isValidXml,
      reasons: isValidXml ? [] : [ERROR_CODES.SITEMAP_NOT_XML],
    };
  } catch (error) {
    return { existsAndIsValid: false, reasons: [ERROR_CODES.FETCH_ERROR] };
  }
}

/**
 * Checks the robots.txt file for a sitemap and returns the sitemap path if found.
 *
 * @async
 * @param {string} protocol - The protocol (http or https) of the site.
 * @param {string} domain - The domain of the site.
 * @returns {Promise<{ path: string|null, reasons: string[] }>} - A Promise that resolves
 * to an object containing the sitemap path and reasons for success or failure.
 */
export async function checkRobotsForSitemap(protocol, domain) {
  const robotsUrl = `${protocol}://${domain}/robots.txt`;
  try {
    const robotsContent = await fetchContent(robotsUrl);
    if (robotsContent !== null) {
      const sitemapMatch = robotsContent.match(/Sitemap:\s*(.*)/i);
      if (sitemapMatch && sitemapMatch[1]) {
        return { path: sitemapMatch[1].trim(), reasons: [] };
      }
      return { path: null, reasons: [ERROR_CODES.NO_SITEMAP_IN_ROBOTS] };
    }
  } catch (error) {
    // ignore
  }
  return { path: null, reasons: [ERROR_CODES.ROBOTS_NOT_FOUND] };
}

/**
 * Finds and validates the sitemap for a given URL by checking:
 * robots.txt, sitemap.xml, and sitemap_index.xml.
 *
 * @async
 * @param {string} inputUrl - The URL for which to find and validate the sitemap.
 * @returns {Promise<Object>} -A Promise that resolves to an object
 * representing the success and reasons for the sitemap search and validation.
 */

export async function findSitemaps(inputUrl) {
  const parsedUrl = extractDomainAndProtocol(inputUrl);
  if (!parsedUrl) {
    console.error(ERROR_CODES.INVALID_URL);
    return [];
  }

  const { protocol, domain } = parsedUrl;

  // Check sitemap path in robots.txt
  const robotsResult = await checkRobotsForSitemap(protocol, domain);
  if (!robotsResult.path) {
    console.error(robotsResult.reasons);
  } else if (robotsResult.path.length > 2) {
    let sitemapUrlFromRobots = robotsResult.path;
    if (robotsResult.path[0] === '/' && robotsResult.path[1] !== '/') {
      sitemapUrlFromRobots = `${protocol}://${domain}${sitemapUrlFromRobots}`;
    }

    const sitemapResult = await checkSitemap(sitemapUrlFromRobots);
    if (sitemapResult.existsAndIsValid) {
      return {
        success: true,
        source: 'robots.txt',
        paths: [sitemapUrlFromRobots],
      };
    }
  }

  // Check sitemap.xml
  const assumedSitemapUrl = `${protocol}://${domain}/sitemap.xml`;
  const sitemapResult = await checkSitemap(assumedSitemapUrl);
  if (sitemapResult.existsAndIsValid) {
    return {
      success: true,
      source: assumedSitemapUrl,
      paths: [assumedSitemapUrl],
    };
  } else {
    console.error(sitemapResult.reasons);
  }

  // Check sitemap_index.xml
  const sitemapIndexUrl = `${protocol}://${domain}/sitemap_index.xml`;
  const sitemapIndexResult = await checkSitemap(sitemapIndexUrl);
  if (sitemapIndexResult.existsAndIsValid) {
    return {
      success: true,
      source: sitemapIndexUrl,
      paths: [sitemapIndexUrl],
    };
  } else if (sitemapIndexResult.reasons.includes(ERROR_CODES.SITEMAP_NOT_FOUND)) {
    console.error(sitemapIndexResult.reasons);
  }

  return {
    success: false,
  };
}

async function fetchSitemapXml(url) {
  const response = await httpClient.get(url);
  if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
    throw new Error(`HTTP Response Code: ${response.status}, Content-Type: ${response.headers.get('content-type')}`);
  }
  const contentType = response.headers.get('content-type');
  const xml = contentType.includes('application/x-gzip')
    ? zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString()
    : await response.text();
  return xml;
}

export async function fetchSitemapsFromSource(sources, origin) {
  async function parseSitemap(xml, sitemapUrl) {
    try {
      const result = await parseStringPromise(xml);
      if (result.urlset && result.urlset.url) {
        return [{
          url: sitemapUrl,
          source: origin,
          locs: result.urlset.url.length,
        }, ...result.urlset.url.map((urlEntry) => ({
          page: urlEntry.loc[0],
          source: sitemapUrl,
        }))];
      } else if (result.sitemapindex && result.sitemapindex.sitemap) {
        const sitemaps = await fetchSitemapsFromSource(result.sitemapindex.sitemap.map((entry) => ({
          url: entry.loc[0],
          source: sitemapUrl,
        })), origin);
        return [{
          url: sitemapUrl.url,
          source: origin,
          locs: result.sitemapindex.sitemap.length,
        }, ...sitemaps];
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    return [];
  }

  const sitemapFetchPromises = sources.map(async (sitemapUrl) => {
    try {
      try {
        const fetchedXml = await fetchSitemapXml(sitemapUrl);
        return await parseSitemap(fetchedXml, sitemapUrl);
      } catch (fetchError) {
        return { url: sitemapUrl.url, source: sitemapUrl.source, error: fetchError.message };
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

export async function fetchAllPages(url, sitemapSrc) {
  if (sitemapSrc) {
    const { protocol, domain } = extractDomainAndProtocol(url);
    return fetchSitemapsFromSource([
      new URL(sitemapSrc, `${protocol}://${domain}`).toString(), 'user provided',
    ]);
  }
  const sitemaps = await findSitemaps(url);
  if (!sitemaps.success) return [];
  return fetchSitemapsFromSource(sitemaps.paths, sitemaps.source);
}

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

export const sitemap = async (options) => {
  const { baseURL } = options;
  console.log(`Running sitemap audit for ${baseURL} with options: ${JSON.stringify(options)}`);

  const assessment = await createAssessment(baseURL, 'Sitemap');
  assessment.setRowHeadersAndDefaults({
    sitemapOrPage: '',
    source: '',
    locs: 0,
    error: '',
    warning: '',
  });

  // const sitemaps = await fetchAllPages(options.devBaseURL);
  const sitemaps = await fetchAllPages(baseURL);

  // Assessment for sitemaps
  sitemaps.forEach(async (sm) => {
    if (sm.url) {
      assessment.addRow({
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
        assessment.addRow({
          sitemapOrPage: item.page, source: item.source, error: errors.join(', '), warning: warnings.join(', '),
        });
      }
    });

  await Promise.all(promises);

  assessment.end();
};
