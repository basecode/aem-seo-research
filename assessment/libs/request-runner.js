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

/**
 * Represents a RequestRunner that handles running multiple requests with retries.
 */
export default class RequestRunner {
  /**
   * Creates a new instance of RequestRunner.
   * @param {Object} options - The options for the RequestRunner.
   * @param {number} sleepTime - The sleep time in milliseconds between retries.
   * @param {number} backoffFactor - The backoff factor for exponential backoff.
   * @param {number} maxRetries - The maximum number of retries.
   * @param {Object} log - The logger object.
   */
  constructor(
    { sleepTime = 1000, backoffFactor = 2, maxRetries = 10 },
    log = console,
  ) {
    this.sleepTime = sleepTime;
    this.backoffFactor = backoffFactor;
    this.maxRetries = maxRetries;
    this.log = log;
  }

  /**
   * Sleeps for the specified amount of time.
   * @param {number} ms - The sleep time in milliseconds.
   * @returns {Promise<void>} A promise that resolves after the specified time.
   */
  static sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Runs multiple requests with retries.
   * @param {Array<Function>} requests - An array of request functions to run.
   * @returns {Promise<Array<Response>>} A promise that resolves with an array of responses.
   */
  async run(requests) {
    const responses = [];
    for (let i = 0; i < requests.length; i += 1) {
      let retry = 0;
      let response;

      try {
        do {
          // eslint-disable-next-line no-await-in-loop
          response = await requests[i];
          if (response.status === 429) {
            // eslint-disable-next-line no-await-in-loop
            await RequestRunner.sleep(this.sleepTime * this.backoffFactor ** retry);
            retry += 1;
          } else {
            break;
          }
        } while (retry <= this.maxRetries);

        responses.push(response);

        if (response.ok) {
          this.log.info(`Request ${i + 1} succeeded.`);
        } else {
          this.log.error(`Request ${i + 1} failed with status: ${response.status}`);
        }
      } catch (error) {
        this.log.error(`Request ${i + 1} threw an exception: ${error}`);
      }

      // eslint-disable-next-line no-await-in-loop
      await RequestRunner.sleep(this.sleepTime);
    }

    return responses;
  }
}
