import zlib from 'zlib';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { makeSpaceCatApiCall} from './lib.js';

dotenv.config();

const __USER_AGENT_HEADER = { headers: { 'User-Agent': 'basecode/seo-research-crawler/1.0' } };
const __visitedSitemaps = [];

const REPORTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports');
const EXECUTE_SINGLE_SITE_REPORT = 'https://behindok.com';

// Ensure the reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}

const sanitizeFilename = (url) => {
  return url.replace(/[^a-zA-Z0-9]/g, '_');
};

const reportExists = (site) => {
  return fs.existsSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`));
}

const reportSite = (site) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(`Report for ${site}`);
    fs.writeFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `Report for ${site}\n`);
    report(site, `Date: ${Date.now()}`);
}

const report = (site, message) => {
  if (EXECUTE_SINGLE_SITE_REPORT) console.log(message);
  fs.appendFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), message + "\n");
}

const reportPages = (site, pages) => {
  report(site, `Total Pages: ${pages.length}`);
  pages.forEach(page => fs.appendFileSync(path.join(REPORTS_DIR, `${sanitizeFilename(site)}.txt`), `${page}\n`) );
}

/*
Example output:
['https://domain1.com', 'https://domain2.com'];
*/
const getSpacecatSitesUrls = async () => {
  const response = await makeSpaceCatApiCall('get', '/sites');
  return response.map((item) => item.baseURL);
}


async function fetchSitemapUrls(siteUrl) {
  let sitemapUrl = new URL('sitemap.xml', siteUrl).toString(); // Default sitemap location
  let urls = [];

  function parseRobotsTxt(robotsTxt) {
    try {
      const regex = /Sitemap:\s*(https?:\/\/[^\s]+)/g;
      let match;
      let sitemaps = [];
      while ((match = regex.exec(robotsTxt)) !== null) {
        sitemaps.push(match[1]);
      }
      return sitemaps.length > 0 ? sitemaps : null;
    } catch (error) {
      return null; // No sitemap URL found in robots.txt
    }
  }

  async function parseSitemap(xml, source) {
    if (__visitedSitemaps.includes(sitemapUrl)) return;
    try {
      const result = await parseStringPromise(xml);
      if (result.urlset && result.urlset.url) {
        for (let urlEntry of result.urlset.url) {
          urls.push(urlEntry.loc[0]);
        }
      } else if (result.sitemapindex && result.sitemapindex.sitemap) {
        for (let sitemap of result.sitemapindex.sitemap) {
          const sitemapIndexUrl = sitemap.loc[0];
          if (__visitedSitemaps.includes(sitemapIndexUrl)) break;
          __visitedSitemaps.push(sitemapIndexUrl);
          report(siteUrl, `Found Sitemap in Index: ${sitemapIndexUrl}`);
          const response = await fetch(sitemapIndexUrl, __USER_AGENT_HEADER);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            report(siteUrl, `Error in ${sitemapIndexUrl}, Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}, Source: ${source}`);
          } else if (response.headers.get('content-type').includes('application/x-gzip')) {
            // Handle gzipped sitemap
            report(siteUrl, '..and gzipped');
            const buffer = Buffer.from(await response.arrayBuffer());
            const decompressed = zlib.gunzipSync(buffer).toString();
            await parseSitemap(decompressed);
          } else {
            // Handle regular sitemap
            const xmlText = await response.text();
            await parseSitemap(xmlText); // Recursively parse nested sitemaps
          }
        }
      }
    } catch (error) {
      __visitedSitemaps.push(sitemapUrl);
      console.error(`Error in ${sitemapUrl}: ${error}. Source: ${source}`);
    }
  }

  // Check robots.txt for the sitemap URL(s)
  try {
    const robotsResponse = await fetch(new URL('robots.txt', siteUrl).toString(), __USER_AGENT_HEADER);
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      const robotsSitemapUrls = parseRobotsTxt(robotsTxt);
      if (robotsSitemapUrls && robotsSitemapUrls.length > 0) {
        // Process each sitemap found in robots.txt
        for (const robotsSitemapUrl of robotsSitemapUrls) {
          if (__visitedSitemaps.includes(robotsSitemapUrl)) break;
          report(siteUrl, `Found Sitemap in robots.txt: ${robotsSitemapUrl}`);
          const response = await fetch(robotsSitemapUrl, __USER_AGENT_HEADER);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            report(siteUrl, `Sitemap not found at ${sitemapUrl}`);
          } else {
            if (response.headers.get('content-type').includes('application/x-gzip')) {
              // Handle gzipped sitemap
              const buffer = Buffer.from(await response.arrayBuffer());
              const decompressed = zlib.gunzipSync(buffer).toString();
              await parseSitemap(decompressed, robotsSitemapUrl);
            } else {
              // Handle regular sitemap
              const xml = await response.text();
              await parseSitemap(xml, robotsSitemapUrl);
            }
          }
        }
        return urls; // Return early if sitemap URLs are found in robots.txt
      }
    }
  } catch (error) {
    report(siteUrl, `No robots.txt found for ${siteUrl}, using default sitemap URL.`);
  }

  // Fetch and parse the default sitemap if no sitemap URL is found in robots.txt
  try {
    const response = await fetch(sitemapUrl, __USER_AGENT_HEADER);
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
      report(siteUrl, `Sitemap not found at ${sitemapUrl}`);
    } else {
      report(siteUrl, `Found Sitemap in default location: ${sitemapUrl}`);
      let xml;
      if (response.headers.get('content-type').includes('application/x-gzip')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const xml = zlib.gunzipSync(buffer).toString();
      } else {
        xml = await response.text();
      }
      await parseSitemap(xml, sitemapUrl);
    }
  } catch (error) {
    __visitedSitemaps.push(sitemapUrl);
    report(siteUrl, `Error fetching default sitemap ${siteUrl}: ${error}`);
  }

  return urls;
}

// Example usage
(async () => {
  const totalStartTime = process.hrtime();
  let totalPages = 0;

  const siteUrls = EXECUTE_SINGLE_SITE_REPORT ? [EXECUTE_SINGLE_SITE_REPORT] : await getSpacecatSitesUrls();
  for (const siteUrl of siteUrls) {
    if (!reportExists(siteUrl)) {
      const startTime = process.hrtime();
      reportSite(siteUrl);
      const pages = await fetchSitemapUrls(siteUrl);
      totalPages += pages.length;
      reportPages(siteUrl, pages);
      report(siteUrl, `ExecutionTime ${process.hrtime(startTime)}`);
    } else {
      console.log(`Skip: ${siteUrl}`);
    }
  }
  console.log(`Total Pages: ${totalPages}`);
  console.log(`Total time: ${process.hrtime(totalStartTime)}`);
})();
