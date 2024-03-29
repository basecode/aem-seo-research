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

import path from 'path';
import NodeFetchCache, { FileSystemCache } from 'node-fetch-cache';
import {ROOT_DIR} from '../file-lib.js';
import {USER_AGENT} from '../assessment-lib.js';

class CachedFetchAPI {

    /**
     * build a NodeFetchCache wrapper and pass a TTL and a cache directory.
     * no need to add overhead by handling custom path renames or HAR responses, support is OOTB
     */
    constructor() {
        this.fetch = NodeFetchCache.create({
            shouldCacheResponse: (response) => response.ok,
            cache: new FileSystemCache({
                cacheDirectory: path.join(ROOT_DIR, '.http_cache'),
                // Time to live. How long (in ms) responses remain cached before being
                // automatically ejected. If undefined, responses are never
                // automatically ejected from the cache.
                ttl: 3_600_000, // 1 hour
            }),
        })
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
        return this.fetch(url, {
            ...options,
            method,
            headers: {
                ...options.headers,
                'User-Agent': USER_AGENT, // always override to ensure consistency
            },
            ...(data ? { body: JSON.stringify(data) } : {}),
        });
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
            HttpClient.instance = new CachedFetchAPI();
        }
    }

    /**
     * @returns {CachedFetchAPI}
     */
    getInstance() {
        return HttpClient.instance;
    }

}
