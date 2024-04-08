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
import { USER_AGENT } from '../assessment-lib.js';

class CachedFetchAPI {
  /**
   * build a NodeFetchCache wrapper and pass a TTL and a cache directory.
   * no need to add overhead by handling custom path renames or HAR responses, support is OOTB
   * @param {Object} config - Configuration object
   * @param {string} config.cacheDirectory - Path to the cache directory
   * @param {number} config.ttl - Time to live for cache in milliseconds set as undefined
   * to cache indefinitely
   *
   */

  constructor(config) {
    this.fetch = NodeFetchCache.create({
      shouldCacheResponse: (response) => response.ok,
      cache: new FileSystemCache({
        cacheDirectory: config.cacheDirectory,
        ttl: config.ttl,
      }),
    });
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch

  /**
   * Wrapper over Fetch API GET
   *
   * @param url
   * @param options
   * @returns {Promise<NodeFetchResponse>}
   */
  async get(url, options = {}) {
    return this.call('GET', url, undefined, options);
  }

  /**
   * Wrapper over Fetch API POST
   *
   * @param url
   * @param data
   * @param options
   * @returns {Promise<NodeFetchResponse>}
   */
  async post(url, data = {}, options = {}) {
    return this.call('POST', url, data, options);
  }

  async call(method, url, data = undefined, options = {}) {
    const body = data ? { body: JSON.stringify(data) } : {};
    const delay = (ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

    console.log('StartUrl:', url, 'Time:', performance.now());
    let response = await this.fetch(url, {
      ...options,
      method,
      headers: {
        ...options.headers,
        'Cache-Control': 'only-if-cached',
        'User-Agent': USER_AGENT,
      },
      ...body,
    });
    console.log('isCacheMissed:', response.isCacheMiss, url);
    if (response.isCacheMiss) {
      await delay(1000);
      response = await this.fetch(url, {
        ...options,
        method,
        headers: {
          ...options.headers,
          'User-Agent': USER_AGENT,
        },
        ...body,
      });
    }
    console.log('EndUrl:', url, 'Time:', performance.now());

    return response;
  }

  /**
     * Wrapper over Node Fetch Cache isCacheMiss
     * @param {NFCResponse} response (from a get or post call)
     * @returns {boolean}
     */
  isCached(response) {
    return !response.isCacheMiss;
  }
}

export default class HttpClient {
  constructor() {
    if (!HttpClient.instance) {
      HttpClient.instance = new CachedFetchAPI({
        cacheDirectory: path.join(ROOT_DIR, '.http_cache'),
      });
    }
  }

  /**
     * @returns {CachedFetchAPI}
     */
  getInstance() {
    return HttpClient.instance;
  }
}
