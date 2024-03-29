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

import { isValidUrl } from '@adobe/spacecat-shared-utils';

const AHREFS_API_BASE_URL = 'https://api.ahrefs.com/v3';

export default class AhrefsAPIClient {
  static createFrom(context) {
    const { AHREFS_API_BASE_URL: apiBaseUrl, AHREFS_API_KEY: apiKey } = context.env;
    return new AhrefsAPIClient({ apiBaseUrl, apiKey });
  }

  constructor(config, cache, log = console) {
    const { apiKey, apiBaseUrl = AHREFS_API_BASE_URL } = config;

    if (!isValidUrl(apiBaseUrl)) {
      throw new Error(`Invalid Ahrefs API Base URL: ${apiBaseUrl}`);
    }

    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey;
    this.cache = cache || {
      get: () => {},
      put: () => {},
    };
    this.log = log;
  }

  async sendRequest(endpoint, queryParams = {}) {
    const queryParamsKeys = Object.keys(queryParams);
    const queryString = queryParamsKeys.length > 0
      ? `?${queryParamsKeys
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
        .join('&')}` : '';

    const fullAuditRef = `${this.apiBaseUrl}${endpoint}${queryString}`;
    const response = await fetch(fullAuditRef, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    this.log.info(`Ahrefs API ${endpoint} response has number of rows: ${response.headers.get('x-api-rows')}, 
      cost per row: ${response.headers.get('x-api-units-cost-row')},
      total cost: ${response.headers.get('x-api-units-cost-total-actual')}`);

    if (!response.ok) {
      this.log.error(`Ahrefs API request failed with status: ${response.status}`);
      throw new Error(`Ahrefs API request failed with status: ${response.status}`);
    }

    try {
      const result = await response.json();
      return {
        result,
        fullAuditRef,
      };
    } catch (e) {
      this.log.error(`Error parsing Ahrefs API response: ${e.message}`);
      throw new Error(`Error parsing Ahrefs API response: ${e.message}`);
    }
  }

  async getBrokenBacklinks(url) {
    const BROKEN_BACKLINKS = 'broken-backlinks';

    this.log.info(`Calling Ahrefs API ${BROKEN_BACKLINKS} for url ${url}`);

    const filter = {
      and: [
        { field: 'is_dofollow', is: ['eq', 1] },
        { field: 'is_content', is: ['eq', 1] },
        { field: 'domain_rating_source', is: ['gte', 29.5] },
        { field: 'traffic_domain', is: ['gte', 500] },
        { field: 'links_external', is: ['lte', 300] },
      ],
    };

    const queryParams = {
      select: [
        'title',
        'url_from',
        'url_to',
      ].join(','),
      limit: 50,
      mode: 'prefix',
      order_by: 'domain_rating_source:desc,traffic_domain:desc',
      target: url,
      output: 'json',
      where: JSON.stringify(filter),
    };

    return this.sendRequest(`/site-explorer/${BROKEN_BACKLINKS}`, queryParams);
  }

  async getTopPages(url, limit = 100) {
    const TOP_PAGES = 'top-pages';
    this.log.info(`Calling Ahrefs API ${TOP_PAGES} for url ${url}`);

    const cached = this.cache.get(TOP_PAGES, { url, limit });
    if (cached) {
      return {
        result: {
          pages: cached,
        },
      };
    }

    const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;

    const queryParams = {
      select: [
        'url',
        'sum_traffic',
      ].join(','),
      limit,
      order_by: 'sum_traffic_merged',
      target: url,
      mode: 'prefix',
      date: new Date().toISOString().split('T')[0],
      date_compared: new Date(Date.now() - MONTH_IN_MS).toISOString().split('T')[0],
      output: 'json',
    };

    const response = await this.sendRequest(`/site-explorer/${TOP_PAGES}`, queryParams);
    this.cache.put(TOP_PAGES, { url, limit }, response?.result?.pages);
    return response;
  }

  async getBacklinks(url, limit = 200) {
    const ALL_BACKLINKS = 'all-backlinks';
    this.log.info(`Calling Ahrefs API ${ALL_BACKLINKS} for url ${url}`);

    const cached = this.cache.get(ALL_BACKLINKS, { url, limit });
    if (cached) {
      return {
        result: {
          backlinks: cached,
        },
      };
    }

    const filter = {
      and: [
        { field: 'is_dofollow', is: ['eq', 1] },
        { field: 'is_content', is: ['eq', 1] },
        { field: 'domain_rating_source', is: ['gte', 29.5] },
        { field: 'traffic_domain', is: ['gte', 500] },
        { field: 'links_external', is: ['lte', 300] },
      ],
    };

    const queryParams = {
      select: [
        'title',
        'url_from',
        'url_to',
      ].join(','),
      limit: 50,
      mode: 'prefix',
      order_by: 'domain_rating_source:desc,traffic_domain:desc',
      target: url,
      output: 'json',
      where: JSON.stringify(filter),
    };

    const response = await this.sendRequest(`/site-explorer/${ALL_BACKLINKS}`, queryParams);
    this.cache.put(ALL_BACKLINKS, { url, limit }, response?.result?.backlinks);
    return response;
  }
}
