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

export async function gitHubURLToHlxSite(gitHubURL) {
  if (!gitHubURL) {
    throw new Error('GitHub URL is required');
  }

  try {
    const gitHubUrl = new URL(gitHubURL);
    const [owner, repository] = gitHubUrl.pathname.split('/').filter(Boolean);
    if (!owner || !repository) {
      throw new Error(`Invalid GitHub URL: ${gitHubUrl.toString()}`);
    }

    const hlxSiteURL = new URL(`https://main--${repository}--${owner}.hlx.live`);
    return composeAuditURL(hlxSiteURL.toString());
  } catch (error) {
    throw new Error(`Failed to convert GitHub URL to hlx site URL: ${error.message}`);
  }
}

export function prodToDevUrl(pageUrl, { hlxSiteURL, devAuditURL }) {
  const url = new URL(pageUrl);
  url.hostname = devAuditURL || hlxSiteURL || url.hostname;
  return url.toString();
}

export default class PageProvider {
  constructor({ ahrefsClient, sitemap }, log = console) {
    this.ahrefsClient = ahrefsClient;
    this.sitemap = sitemap;
    this.log = log;
  }

  async getPagesOfInterest(site, options) {
    const {
      limit = 100, siteAuditURL, devAuditURL, hlxSiteURL,
    } = options || {};

    if (this.ahrefsClient) {
      try {
        const response = await this.ahrefsClient.getTopPages(siteAuditURL, limit);
        if (response?.result?.pages) {
          return response?.result?.pages.map((page) => ({
            prodUrl: page.url,
            devUrl: prodToDevUrl(page.url, { devAuditURL, hlxSiteURL }),
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
