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
import Assessment from './libs/assessment-lib.js';
import AhrefsAPIClient from './libs/ahrefs-client.js';
import { gitHubURLToHlxSite, prodToDevUrl } from './libs/page-provider.js';
import HttpClient from './libs/fetch-client.js';

dotenv.config();

const httpClient = new HttpClient().getInstance();

// TODO: reusable fragment copied from https://github.com/adobe/spacecat-audit-worker/blob/main/src/backlinks/handler.js#L21-L38
async function filterOutValidBacklinks(backlinks, log) {
  const isStillBrokenBacklink = async (backlink) => {
    try {
      const response = await httpClient.get(backlink.url_to);
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

export const brokenBacklinksAudit = async (assessment, options, log = console) => {
  const {
    hlxSiteURL, siteAuditURL, devAuditURL,
  } = options;

  const ahrefsClient = new AhrefsAPIClient(
    { apiKey: process.env.AHREFS_API_KEY },
    // new AhrefsCache(OUTPUT_DIR),
    undefined,
    httpClient,
  );

  const topBacklinksResponse = await ahrefsClient
    .getBacklinks(siteAuditURL, options.topBacklinks);
  let topBacklinks = topBacklinksResponse?.result?.backlinks;

  if (!topBacklinks || topBacklinks.length === 0) {
    log.warn(`No backlinks found for the site URL ${siteAuditURL}`);
    return;
  }

  let topPagesUrls;
  if (options.onlyBacklinksInTopPages) {
    const topPagesResponse = await ahrefsClient
      .getTopPages(siteAuditURL, options.topPages);
    if (!topPagesResponse?.result?.pages
      || topPagesResponse?.result?.pages.length === 0) {
      log.warn(`No top pages found for the site URL ${siteAuditURL}`);
      return;
    }
    topPagesUrls = topPagesResponse.result.pages.map((page) => page.url);
  }

  // filter out backlinks that are not top pages
  if (options.onlyBacklinksInTopPages) {
    topBacklinks = topBacklinks
      .filter((backlink) => topPagesUrls.includes(backlink.url_to));
  }

  topBacklinks = topBacklinks
    .map((backlink) => ({
      ...backlink,
      original_url_to: backlink.url_to,
      url_to: prodToDevUrl(backlink.url_to, {
        hlxSiteURL,
        devAuditURL,
      }),
    }));

  const brokenBacklinks = await filterOutValidBacklinks(topBacklinks, log);

  // TODO: this could be outside of the audit function, since it's just formatting stuff
  brokenBacklinks.forEach((backlink) => {
    assessment.addRow({
      original_url: backlink.original_url_to,
      url: backlink.url_to,
      source: 'ahrefs',
      title: backlink.title,
      url_from: backlink.url_from,
    });
  });
};

export const brokenBacklinks = async (options) => {
  const { baseURL } = options;
  const title = 'Broken Backlinks';
  console.log(`Running broken backlinks audit for ${baseURL} with options: ${JSON.stringify(options)}`);

  const assessment = new Assessment(options, title);
  assessment.setRowHeadersAndDefaults({
    original_url: '',
    url: '',
    source: 'ahrefs',
    title: '',
    url_from: '',
  });

  await brokenBacklinksAudit(assessment, options);

  assessment.end();
  return {
    auditType: title,
    amountOfIssues: assessment.getRows().length,
    location: assessment.reportFilePath,
  };
};
