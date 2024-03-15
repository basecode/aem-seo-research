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
const WRITE_INTO_FILE = false;

/*
Example output:
['https://domain1.com', 'https://domain2.com'];
Test data: ['https://stock.adobe.com', 'https://stock.adobe.com/', 'https://experienceleague.adobe.com'];
*/
const getSpacecatSitesUrls = async () => {
  return ['https://stock.adobe.com'];
  const response = await makeSpaceCatApiCall('get', '/sites');
  return response.map((item) => item.baseURL);
}


async function fetchSitemapUrls(domain) {
  let sitemapUrl = path.join(domain, 'sitemap.xml'); // Default sitemap location
  let urls = [];

  function parseRobotsTxt(robotsTxt) {
    try {
      const regex = /Sitemap:\s*(https?:\/\/[^\s]+)/;
      return robotsTxt.match(regex)[1];
    } catch (error) {
      return null; // No sitemap URL found in robots.txt
    }
  }

  async function parseSitemap(xml) {
      try {
          const result = await parseStringPromise(xml);
          if (result.urlset && result.urlset.url) {
              for (let urlEntry of result.urlset.url) {
                  urls.push(urlEntry.loc[0]);
              }
          } else if (result.sitemapindex && result.sitemapindex.sitemap) {
              for (let sitemap of result.sitemapindex.sitemap) {
                  const response = await fetch(sitemap.loc[0]);
                  const xmlText = await response.text();
                  await parseSitemap(xmlText); // Recursively parse nested sitemaps
              }
          }
      } catch (error) {
          console.error(`Error parsing sitemap for ${domain}: ${error}`);
      }
  }

  // Check robots.txt for the sitemap URL
  try {
      const robotsResponse = await fetch(path.join(domain, 'robots.txt'));
      if (robotsResponse.ok) {
          const robotsTxt = await robotsResponse.text();
          const robotsSitemapUrl = parseRobotsTxt(robotsTxt);
          if (robotsSitemapUrl) {
              sitemapUrl = robotsSitemapUrl;
          }
      }
  } catch (error) {
      console.log(`No robots.txt found for ${domain}, using default sitemap URL.`);
  }

  // Fetch and parse the sitemap
  try {
      const response = await fetch(sitemapUrl);
      // skip if response is html (in both cases: 404-page or 2xx)
      if (response.ok && !response.headers.get('content-type').includes('text/html')) {
          const xml = await response.text();
          await parseSitemap(xml);
      } else {
          console.log(`Sitemap not found at ${sitemapUrl}`);
      }
  } catch (error) {
      console.error(`Error fetching sitemap for ${domain}: ${error}`);
  }

  return urls;
}

// Example usage
(async () => {
  console.time('ExecutionTime');
  let countedPages = 0;
  // Prepare the CSV file
  const outputFilePath = path.join(__dirname, 'output.csv');
  // fs.writeFileSync(outputFilePath, 'page\n'); // Write CSV headers

  const siteUrls = await getSpacecatSitesUrls();
  for (const siteUrl of siteUrls) {
      const pages = await fetchSitemapUrls(siteUrl);
      countedPages += pages.length;
      if (WRITE_INTO_FILE) pages.map(page => fs.appendFileSync(outputFilePath, `"${page}"\n`));
  }
  console.log(`Total Pages: ${countedPages}`);
  console.timeEnd('ExecutionTime');
})();
