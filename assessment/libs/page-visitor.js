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

export default class PageVisitor {
  constructor(runner, cache, log = console) {
    this.runner = runner;
    this.cache = cache;
    this.log = log;
  }

  async visit(pageUrls) {
    // Compose the list of async functions that do the fetch call
    const fetchFunctions = pageUrls.map((url) => async () => {
      try {
        const response = await fetch(url);
        const body = await response.text();
        const headers = response.headers.raw();
        const { status } = response;

        return {
          url, status, body, headers,
        };
      } catch (error) {
        this.log.error(`Failed to fetch ${url}: ${error.message}`);
        return null;
      }
    });

    // Run the fetch functions with delays and exponential backoff
    const responses = await this.runner.run(fetchFunctions);

    // Store the responses in the cache
    responses.forEach((response) => {
      if (response) {
        this.cache.put(response.url, response);
      }
    });

    return responses;
  }
}
