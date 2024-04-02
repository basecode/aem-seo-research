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
import { createAssessment } from './assessment-lib.js';
import AhrefsAPIClient from './libs/ahrefs-client.js';
import AhrefsCache from './libs/ahrefs-cache.js';
import { OUTPUT_DIR } from './file-lib.js';
import { prodToDevUrl } from './libs/page-provider.js';

// TODO: reusable fragment copied from https://github.com/adobe/spacecat-audit-worker/blob/main/src/backlinks/handler.js#L21-L38
async function filterOutValidBacklinks(backlinks, log) {
  const isStillBrokenBacklink = async (backlink) => {
    try {
      const response = await fetch(backlink.url_to);
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

export const brokenBacklinksAudit = async (assessment, userSiteUrl, options, log = console) => {
  const site = assessment.getSite();
  const siteAuditUrl = assessment.getSiteAuditUrl();

  // get top backlinks from ahrefs for the existing domain
  const ahrefsClient = new AhrefsAPIClient(
    { apiKey: process.env.AHREFS_API_KEY },
    new AhrefsCache(OUTPUT_DIR),
  );

  const topBacklinksResponse = await ahrefsClient
    .getBacklinks(siteAuditUrl, options.topPages);

  if (!topBacklinksResponse?.result?.backlinks
    || topBacklinksResponse?.result?.backlinks.length === 0) {
    log.warn(`No backlinks found for the site URL ${siteAuditUrl}`);
    return;
  }

  const topPagesResponse = await ahrefsClient
    .getTopPages(siteAuditUrl, options.topPages);
  if (!topPagesResponse?.result?.pages
    || topPagesResponse?.result?.pages.length === 0) {
    log.warn(`No top pages found for the site URL ${siteAuditUrl}`);
    return;
  }

  // filter out backlinks that are not top pages
  const topPagesUrls = topPagesResponse.result.pages.map((page) => page.url);
  const topBacklinks = topBacklinksResponse.result.backlinks;
  const topBacklinksForTopPages = topBacklinks
    .filter((backlink) => topPagesUrls.includes(backlink.url_to))
    .map((backlink) => ({
      ...backlink,
      original_url_to: backlink.url_to,
      url_to: prodToDevUrl(site, siteAuditUrl, backlink.url_to),
    }));

  const brokenBacklinks = await filterOutValidBacklinks(topBacklinksForTopPages, log);

  brokenBacklinks.forEach((backlink) => {
    assessment.addColumn({
      original_url: backlink.original_url_to,
      url: backlink.url_to,
      source: 'ahrefs',
      title: backlink.title,
      url_from: backlink.url_from,
    });
  });
};

export const brokenBacklinks = (async () => {
  const userSiteUrl = process.argv[2];

  const options = {
    topPages: 200,
    topBacklinks: 200,
  };

  const assessment = await createAssessment(userSiteUrl, 'Broken Backlinks');
  assessment.setRowHeadersAndDefaults({
    original_url: '',
    url: '',
    source: 'ahrefs',
    title: '',
    url_from: '',
  });

  await brokenBacklinksAudit(assessment, userSiteUrl, options);
  assessment.end();
  process.exit(0);
})();
