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

import { composeAuditURL } from '@adobe/spacecat-shared-utils';

export function prodToDevUrl(site, siteAuditUrl, pageUrl) {
  if (site.gitHubURL) {
    const gitHubUrl = new URL(site.gitHubURL);
    const [owner, repository] = gitHubUrl.pathname.split('/').filter(Boolean);

    const url = new URL(pageUrl);
    url.hostname = `main--${repository}--${owner}.hlx.live`;

    return url.toString();
  }

  return pageUrl;
}

export default class PageProvider {
  constructor({ ahrefsClient, sitemapSrc }, log = console) {
    this.ahrefsClient = ahrefsClient;
    this.sitemapSrc = sitemapSrc;
    this.log = log;
  }

  async getPagesOfInterest(site, limit = 100) {
    const siteAuditUrl = await composeAuditURL(site.baseURL);

    if (this.ahrefsClient) {
      try {
        const response = await this.ahrefsClient.getTopPages(siteAuditUrl, limit);
        if (response?.result?.pages) {
          return response?.result?.pages.map((page) => ({
            prodUrl: page.url,
            devUrl: prodToDevUrl(site, siteAuditUrl, page.url),
          }));
        }
      } catch (error) {
        this.log.error(`Failed to get pages from Ahrefs: ${error.message}`);
      }
    }

    // TODO: enhance with more logic, e.g. get top pages from sitemap src etc.

    return Promise.resolve([]);
  }
}
