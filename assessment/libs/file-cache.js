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
import { csv2json, json2csv } from 'json-2-csv';
import { generateFileName } from '../file-lib.js';

export default class FileCache {
  constructor(outputDir) {
    this.outputDir = outputDir;
  }

  put(key, parameters, value) {
    if (!value) {
      console.warn(`No value to cache`);
    }
    const csvResult = json2csv(value);
    const FILE_PATH = path.join(this.outputDir, `${generateFileName(parameters.url, `${key}-${parameters.limit}`)}-${Date.now()}.csv`);
    fs.writeFileSync(FILE_PATH, csvResult);
  }

  get(key, parameters) {
    const files = fs.readdirSync(this.outputDir);
    const existingFile = files.find((file) => file.startsWith(`${generateFileName(parameters.url, `${key}-${parameters.limit}`)}`));
    if (existingFile) {
      console.log(`Using cache from file to avoid Ahrefs API call: ${existingFile}`);
      const cachedContent = fs.readFileSync(`${this.outputDir}/${existingFile}`);
      return csv2json(cachedContent.toString());
    }
    return null;
  }
}
