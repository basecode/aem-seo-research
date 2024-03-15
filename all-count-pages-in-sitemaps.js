import zlib from 'zlib';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { makeSpaceCatApiCall} from './lib.js';

dotenv.config();

const USER_AGENT = 'basecode/seo-research';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __visitedSitemaps = [];

const WRITE_INTO_FILE = false;
const OUTPUT_FILE_PATH = path.join(__dirname, 'output.csv');
const EXECUTE_SITE_REPORT = '';

const report = (message) => {
  if (EXECUTE_SITE_REPORT) console.log(message);
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
          report(`Found Sitemap in Index: ${sitemapIndexUrl}`);
          const response = await fetch(sitemapIndexUrl);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            report(`Error in ${sitemapIndexUrl}, Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}, Source: ${source}`);
          } else if (response.headers.get('content-type').includes('application/x-gzip')) {
            // Handle gzipped sitemap
            report('..and gzipped');
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
    const robotsResponse = await fetch(new URL('robots.txt', siteUrl).toString());
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      const robotsSitemapUrls = parseRobotsTxt(robotsTxt);
      if (robotsSitemapUrls && robotsSitemapUrls.length > 0) {
        // Process each sitemap found in robots.txt
        for (const robotsSitemapUrl of robotsSitemapUrls) {
          if (__visitedSitemaps.includes(robotsSitemapUrl)) break;
          __visitedSitemaps.push(robotsSitemapUrl);
          report(`Found Sitemap in robots.txt: ${robotsSitemapUrl}`);
          const response = await fetch(robotsSitemapUrl);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            report(`Sitemap not found at ${sitemapUrl}`);
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
    report(`No robots.txt found for ${siteUrl}, using default sitemap URL.`);
  }

  // Fetch and parse the default sitemap if no sitemap URL is found in robots.txt
  try {
    __visitedSitemaps.push(sitemapUrl);
    const response = await fetch(sitemapUrl);
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
      report(`Sitemap not found at ${sitemapUrl}`);
    } else {
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
    report(`Error fetching default sitemap ${siteUrl}: ${error}`);
  }

  return urls;
}

// Example usage
(async () => {
  console.time('ExecutionTime');
  let totalPages = 0;

  
  const siteUrls = EXECUTE_SITE_REPORT ? [EXECUTE_SITE_REPORT] : await getSpacecatSitesUrls();
  for (const siteUrl of siteUrls) {
      const pages = await fetchSitemapUrls(siteUrl);
      totalPages += pages.length;
      if (WRITE_INTO_FILE) pages.map(page => fs.appendFileSync(OUTPUT_FILE_PATH, `"${page}"\n`));
  }
  console.log(`Total Pages: ${totalPages}`);
  console.timeEnd('ExecutionTime');
})();
