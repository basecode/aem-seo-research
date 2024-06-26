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

// eslint-disable-next-line max-classes-per-file
import path from 'path';
import NodeFetchCache, { FileSystemCache } from 'node-fetch-cache';
import { ROOT_DIR } from '../file-lib.js';
import { USER_AGENT } from './assessment-lib.js';

class CachedFetchAPI {
  /**
   * build a NodeFetchCache wrapper and pass a TTL and a cache directory.
   * no need to add overhead by handling custom path renames or HAR responses, support is OOTB
   * @param {Object} config - Configuration object
   * @param {string} config.cacheDirectory - Path to the cache directory
   * @param {number} config.ttl - Time to live for cache in milliseconds.
   * @param {number} config.delay - Time to live for cache in milliseconds.
   * Set as undefined to cache indefinitely
   */
  constructor(config) {
    this.cachedFetch = NodeFetchCache.create({
      shouldCacheResponse: (response) => response.ok,
      cache: new FileSystemCache({
        cacheDirectory: config.cacheDirectory,
        ttl: config.ttl,
      }),
    });
    this.delay = config.delay !== undefined ? config.delay : 1000;
  }

  getFetch() {
    return this.fetch.bind(this);
  }

  /**
   * Wrapper over Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
   *
   * @param url
   * @param options
   * @returns {Promise<NodeFetchResponse>}
   */
  async fetch(url, options = {}) {
    const response = this.cachedFetch(url, {
      ...options,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        'User-Agent': USER_AGENT, // always override to ensure consistency
      },
    });

    if (!CachedFetchAPI.isCached(response)) {
      console.log(`Fetch request to ${url} was not cached. Sleeping...`);
      await new Promise((resolve) => {
        setTimeout(resolve, this.delay);
      });
    }

    return response;
  }

  /**
   * Wrapper over Node Fetch Cache isCacheMiss
   * @param {NFCResponse} response (from a get or post call)
   * @returns {boolean}
   */
  static isCached(response) {
    return response.returnedFromCache;
  }
}

export default class HttpClient {
  /**
   * @returns {CachedFetchAPI}
   */
  static getInstance() {
    if (!HttpClient.instance) {
      HttpClient.instance = new CachedFetchAPI({
        cacheDirectory: path.join(ROOT_DIR, '.http_cache'),
      });
    }
    return HttpClient.instance;
  }
}
