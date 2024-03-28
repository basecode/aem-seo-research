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
import fs from 'fs';
import { generateFileName } from '../file-lib.js';

export default class PageCache {
  constructor(outputDir) {
    this.outputDir = outputDir;
  }

  put(pageUrl, pageDetails) {
    if (!pageDetails) {
      console.warn('No pageDetails to cache');
      return;
    }
    const FILE_PATH = path.join(this.outputDir, `${generateFileName(pageUrl, 'page-cache')}.json`);
    fs.writeFileSync(FILE_PATH, JSON.stringify(pageDetails));
  }

  get(pageUrl) {
    const files = fs.readdirSync(this.outputDir);
    const existingFile = files.find((file) => file.startsWith(`${generateFileName(pageUrl, 'page-cache')}.json`));
    if (existingFile) {
      console.log(`Using cache from file to avoid requesting the page again: ${existingFile}`);
      const cachedContent = fs.readFileSync(`${this.outputDir}/${existingFile}`);
      return JSON.parse(cachedContent.toString());
    }
    return null;
  }
}
