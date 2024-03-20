import zlib from 'zlib';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createAssessment, USER_AGENT } from './assessment-lib.js';
import { parseStringPromise } from 'xml2js';

dotenv.config();

const __USER_AGENT_HEADER = { headers: { 'User-Agent': USER_AGENT } };
const __visitedSitemaps = [];
const userSiteUrl = process.argv[2];

async function fetchSitemapUrls(siteUrl, assessment) {
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
          assessment.addRow(`Found Sitemap in Index: ${sitemapIndexUrl}`);
          const response = await fetch(sitemapIndexUrl, __USER_AGENT_HEADER);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            assessment.addRow(`Error in ${sitemapIndexUrl}, Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}, Source: ${source}`);
          } else if (response.headers.get('content-type').includes('application/x-gzip')) {
            // Handle gzipped sitemap
            assessment.addRow('..and gzipped');
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
          assessment(`Found Sitemap in robots.txt: ${robotsSitemapUrl}`);
          const response = await fetch(robotsSitemapUrl, __USER_AGENT_HEADER);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            assessment(`Sitemap not found at ${sitemapUrl}`);
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
    assessment(`No robots.txt found for ${siteUrl}, using default sitemap URL.`);
  }

  // Fetch and parse the default sitemap if no sitemap URL is found in robots.txt
  try {
    const response = await fetch(sitemapUrl, __USER_AGENT_HEADER);
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
      assessment.addRow(`Sitemap not found at ${sitemapUrl}`);
    } else {
      assessment.addRow(`Found Sitemap in default location: ${sitemapUrl}`);
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
    assessment.addRow(`Error fetching default sitemap ${siteUrl}: ${error}`);
  }

  return urls;
}

(async () => {
  const assessment = await createAssessment(userSiteUrl, 'Sitemap');
  const pages = await fetchSitemapUrls(userSiteUrl, assessment);
  assessment.addRow(`Total Pages: ${pages.length}`);
  pages.forEach(page => assessment.addRow(page) );
  assessment.end();
})();
