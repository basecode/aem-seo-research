import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { json2csv } from 'json-2-csv';
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
  const TOTAL_START_HRTIME = process.hrtime();
  const csvContent = [];

  // Ensure the output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  console.log('Check if URL is qualified to be assessed. Needs to be part of spacecat catalogue');
  const SITE = await getSiteByBaseUrl(userSite);
  const SITE_URL = SITE.baseURL;
  const FILE_PATH = path.join(OUTPUT_DIR, `${sanitizeFilename(userTitle)}-${sanitizeFilename(SITE_URL)}-${Date.now()}.csv`);

  console.log(`${userTitle}: Assessment for ${SITE_URL}`);

  let rowHeadersAndDefaults;

  return {
    setRowHeadersAndDefaults(arg) {
      rowHeadersAndDefaults = arg;
    },
    addColumn(column) {
      const merge = {...rowHeadersAndDefaults, ...column};
      csvContent.push(merge);
    },
    end() {
      console.log(`Processing time in Minutes: ${hrtimeToSeconds(process.hrtime(TOTAL_START_HRTIME)) / 60}`);
      const csv = json2csv(csvContent);
      fs.writeFileSync(FILE_PATH, csv);
    }
  };
}

export async function getRobotsTxt(siteUrl) {

  const defaultReturnValue = {
    sitemaps: null,
    exists: false,
    error: null
  };
  
  function parseRobotsTxt(robotsTxt) {
    try {
      const regex = /Sitemap:\s*(https?:\/\/[^\s]+)/g;
      let match;
      let sitemaps = [];
      while ((match = regex.exec(robotsTxt)) !== null) {
        sitemaps.push(match[1]);
      }
      return {...defaultReturnValue, ...{ exists: true, sitemaps: sitemaps.length > 0 ? sitemaps : null }};
    } catch (error) {
      return {...defaultReturnValue, ...{ exists: true, sitemaps: null, error }};
    }
  }
  
  try {
    const robotsResponse = await fetch(new URL('robots.txt', siteUrl).toString(), { headers: { 'User-Agent': USER_AGENT } });
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      return parseRobotsTxt(robotsTxt);
    }
  } catch (error) {
    return {...defaultReturnValue, ...{ error }};
  }
}

