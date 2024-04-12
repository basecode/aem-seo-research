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

import fs from 'fs';
import path from 'path';
import { json2csv } from 'json-2-csv';
import { generateFileName, OUTPUT_DIR } from '../file-lib.js';

export const USER_AGENT = 'basecode/seo-research-crawler/1.0';
export const SPACECAT_API_BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';

class Assessment {
  constructor(options, userTitle) {
    this.site = options.site;
    this.userTitle = userTitle;
    this.csvContent = [];
    this.rowHeadersAndDefaults = null;
    this.totalStartHrTime = process.hrtime();
    this.reportFilePath = path.join(OUTPUT_DIR, `${generateFileName(options.siteAuditURL, this.userTitle)}-${new Date().toISOString()}.csv`);
    console.log(`${this.userTitle}: Assessment for ${options.siteAuditURL}`);
  }

  getSite() {
    return this.site;
  }

  setRowHeadersAndDefaults(defaults) {
    this.rowHeadersAndDefaults = defaults;
  }

  addRow(row) {
    const merge = { ...this.rowHeadersAndDefaults, ...row };
    this.csvContent.push(merge);
  }

  getRows() {
    return this.csvContent;
  }

  end() {
    const hrtimeToSeconds = (hrtime) => {
      const [seconds, nanoseconds] = hrtime;
      return (seconds * 1e9 + nanoseconds) / 1e9;
    };

    console.log(`Processing time in Minutes: ${hrtimeToSeconds(process.hrtime(this.totalStartHrTime)) / 60}`);
    const csv = json2csv(this.csvContent);
    fs.writeFileSync(this.reportFilePath, csv);
  }
}

export default Assessment;
