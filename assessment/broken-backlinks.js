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

import dotenv from 'dotenv';
import { composeAuditURL } from '@adobe/spacecat-shared-utils';
import AhrefsAPIClient from 'spacecat-audit-worker/src/support/ahrefs-client.js';
import { createAssessment } from './assessment-lib.js';
import { gitHubURLToHlxSite, prodToDevUrl } from './libs/page-provider.js';
import HttpClient from './libs/fetch-client.js';

dotenv.config();

const httpClient = HttpClient.getInstance();

// TODO: reusable fragment copied from https://github.com/adobe/spacecat-audit-worker/blob/main/src/backlinks/handler.js#L21-L38
async function filterOutValidBacklinks(backlinks, log) {
  const isStillBrokenBacklink = async (backlink) => {
    try {
      const response = await httpClient.fetch(backlink.url_to);
      if (!response.ok && response.status !== 404
        && response.status >= 400 && response.status < 500) {
        log.warn(`Backlink ${backlink.url_to} returned status ${response.status}`);
      }
      return !response.ok;
    } catch (error) {
      log.error(`Failed to check backlink ${backlink.url_to}: ${error}`);
      return true;
    }
  };

  const backlinkStatuses = await Promise.all(backlinks.map(isStillBrokenBacklink));
  return backlinks.filter((_, index) => backlinkStatuses[index]);
}

export const brokenBacklinksAudit = async (options, log = console) => {
  const { ahrefsClient } = options;
  const topBacklinksResponse = await ahrefsClient
    .getBacklinks(options.siteAuditUrl, options.topBacklinks);
  let topBacklinks = topBacklinksResponse?.result?.backlinks;

  if (!topBacklinks || topBacklinks.length === 0) {
    log.warn(`No backlinks found for the site URL: ${options.siteAuditUrl}`);
    return [];
  }
  log.info(`${topBacklinks.length} backlinks found for the site URL: ${options.siteAuditUrl}: ${topBacklinks[0]}`);

  let topPagesUrls;
  if (options.onlyBacklinksInTopPages) {
    const topPagesResponse = await ahrefsClient
      .getTopPages(options.siteAuditUrl, options.topPages);
    if (!topPagesResponse?.result?.pages
      || topPagesResponse?.result?.pages.length === 0) {
      log.warn(`No top pages found for the site URL: ${options.siteAuditUrl}`);
      return [];
    }
    topPagesUrls = topPagesResponse.result.pages.map((page) => page.url);
    log.info(`${topPagesUrls.length} top pages found for the site URL: ${options.siteAuditUrl}: ${topPagesUrls[0]}`);
  }

  // filter out backlinks that are not top pages
  if (options.onlyBacklinksInTopPages) {
    topBacklinks = topBacklinks
      .filter((backlink) => topPagesUrls.includes(backlink.url_to));
    log.info(`${topBacklinks.length} backlinks after filtering by top pages for the site URL: ${options.siteAuditUrl}`);
  }

  topBacklinks = topBacklinks
    .map((backlink) => ({
      ...backlink,
      original_url_to: backlink.url_to,
      url_to: prodToDevUrl(backlink.url_to, {
        hlxSiteURL: options.hlxSiteURL,
        devBaseURL: options.devBaseURL,
      }),
    }));

  const realBrokenBacklinks = await filterOutValidBacklinks(topBacklinks, log);
  log.info(`${realBrokenBacklinks.length} backlinks after filtering out valid ones for the site URL: ${options.siteAuditUrl}`);
  return realBrokenBacklinks;
};

export const brokenBacklinks = (async () => {
  const userSiteUrl = process.argv[2];

  const options = {
    topPages: 200,
    topBacklinks: 200,
    onlyBacklinksInTopPages: true,
    devBaseURL: undefined,
    sitemap: undefined,
  };
  const args = process.argv.slice(3);
  const isPositiveNumber = (value) => !Number.isNaN(value) && value > 0;
  args.forEach((arg) => {
    const [key, value] = arg.split('=');
    // eslint-disable-next-line default-case
    switch (key) {
      case 'topPages': {
        const topPages = parseInt(value, 10);
        options.topPages = isPositiveNumber(topPages) ? topPages : options.topPages;
        break;
      }
      case 'topBacklinks': {
        const topBacklinks = parseInt(value, 10);
        options.topBacklinks = isPositiveNumber(topBacklinks) ? topBacklinks : options.topBacklinks;
        break;
      }
      case 'onlyBacklinksInTopPages':
        options.onlyBacklinksInTopPages = value === 'true';
        break;
      case 'devBaseURL':
        options.devBaseURL = value;
        break;
      case 'sitemap':
        options.sitemap = value;
        break;
    }
  });

  const assessment = await createAssessment(userSiteUrl, 'Broken Backlinks');
  assessment.setRowHeadersAndDefaults({
    original_url: '',
    url: '',
    source: 'ahrefs',
    title: '',
    url_from: '',
  });

  const site = assessment.getSite();
  options.siteAuditUrl = assessment.getSiteAuditUrl();

  if (options.devBaseURL) {
    options.devBaseURL = await composeAuditURL(options.devBaseURL);
  } else if (site.gitHubURL) {
    options.hlxSiteURL = await gitHubURLToHlxSite(site.gitHubURL);
  }

  console.log(`Running broken backlinks audit for ${userSiteUrl} with options: ${JSON.stringify(options)}`);

  options.ahrefsClient = new AhrefsAPIClient({
    apiKey: process.env.AHREFS_API_KEY,
    apiBaseUrl: 'https://api.ahrefs.com/v3',
  }, httpClient.getFetch());

  const brokenBacklinksResult = await brokenBacklinksAudit(options);
  brokenBacklinksResult.forEach((backlink) => {
    assessment.addColumn({
      original_url: backlink.original_url_to,
      url: backlink.url_to,
      source: 'ahrefs',
      title: backlink.title,
      url_from: backlink.url_from,
    });
  });

  assessment.end();
  process.exit(0);
})();
