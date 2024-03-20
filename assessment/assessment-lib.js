import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { getSiteByBaseUrl } from '../spacecat-lib.js';

export const USER_AGENT = 'basecode/seo-research-crawler/1.0';

const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');

const sanitizeFilename = (url) => {
  return url.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
};

const hrtimeToSeconds = (hrtime) => {
  // hrtime is an array: [seconds, nanoseconds]
  const totalNanoseconds = hrtime[0] * 1e9 + hrtime[1]; // Convert seconds to nanoseconds and add the nanoseconds
  return totalNanoseconds / 1e9;
}

export const createAssessment = async (userSite, userTitle) => {
  const totalStartTime = process.hrtime();

  // Ensure the output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  console.log('Check if URL is qualified to be assessed. Needs to be part of spacecat catalogue');
  const SITE = await getSiteByBaseUrl(userSite);
  const SITE_URL = SITE.baseURL;

  const TITLE = `${userTitle}: Assessment for ${SITE_URL}`;
  const NOW = Date.now();
  const FILE_PATH = path.join(OUTPUT_DIR, `${sanitizeFilename(userTitle)}-${sanitizeFilename(SITE_URL)}-${NOW}.csv`);

  console.log(TITLE);
  fs.writeFileSync(FILE_PATH, `${TITLE},\nDate: ${NOW}\n`);

  return {
    addRow(message) {
      fs.appendFileSync(FILE_PATH, `${message}\n`);
    },
    end() {
      console.log(`Processing time in Minutes: ${hrtimeToSeconds(process.hrtime(totalStartTime)) / 60}`);
    }
  };
}

