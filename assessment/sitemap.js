import zlib from 'zlib';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { createAssessment, getRobotsTxt, USER_AGENT } from './assessment-lib.js';
import { parseStringPromise } from 'xml2js';

dotenv.config();

const __USER_AGENT_HEADER = { headers: { 'User-Agent': USER_AGENT } };
const __visitedSitemaps = [];
const userSiteUrl = process.argv[2];

async function fetchSitemapUrls(siteUrl, assessment) {
  let sitemapUrl = new URL('sitemap.xml', siteUrl).toString(); // Default sitemap location

  async function parseSitemap(xml, source) {
    if (__visitedSitemaps.includes(sitemapUrl)) return;
    try {
      const result = await parseStringPromise(xml);
      if (result.urlset && result.urlset.url) {
        let urls = [];
        for (let urlEntry of result.urlset.url) {
          urls.push(urlEntry.loc[0]);
        }
        return urls;
      } else if (result.sitemapindex && result.sitemapindex.sitemap) {
        let sitemapIndexUrls = [];
        for (let sitemap of result.sitemapindex.sitemap) {
          const sitemapIndexUrl = sitemap.loc[0];
          sitemapIndexUrls.push(sitemapIndexUrl);
          if (__visitedSitemaps.includes(sitemapIndexUrl)) break;
          __visitedSitemaps.push(sitemapIndexUrl);
          const response = await fetch(sitemapIndexUrl, __USER_AGENT_HEADER);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            assessment.addColumn({ sitemap: sitemapIndexUrl, source, error: `Status: ${response.status}, Content-Type: ${response.headers.get('content-type')}` });
          } else if (response.headers.get('content-type').includes('application/x-gzip')) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const decompressed = zlib.gunzipSync(buffer).toString();
            const urls = await parseSitemap(decompressed, sitemapIndexUrl);
            assessment.addColumn({ sitemap: sitemapIndexUrl, source, locs: urls.length });
          } else {
            const xmlText = await response.text();
            const urls = await parseSitemap(xmlText, sitemapIndexUrl); // Recursively parse nested sitemaps
            assessment.addColumn({ sitemap: sitemapIndexUrl, source, locs: urls.length });
          }
        }
        return sitemapIndexUrls;
      }
    } catch (error) {
      __visitedSitemaps.push(sitemapUrl);
      assessment.addColumn({ sitemap: sitemapIndexUrl, source, error });
      return [];
    }
  }

  // Check robots.txt for the sitemap URL(s)
  try {
    const robots = await getRobotsTxt(siteUrl);
    if (robots.exists) {
      if (robots.sitemaps) {
        for (const robotsSitemapUrl of robots.sitemaps) {
          if (__visitedSitemaps.includes(robotsSitemapUrl)) break;
          const response = await fetch(robotsSitemapUrl, __USER_AGENT_HEADER);
          if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
            assessment.addColumn({ sitemap: sitemapUrl, source: '/robots.txt', warning: 'not found' });
          } else {
            if (response.headers.get('content-type').includes('application/x-gzip')) {
              // Handle gzipped sitemap
              const buffer = Buffer.from(await response.arrayBuffer());
              const decompressed = zlib.gunzipSync(buffer).toString();
              const urls = await parseSitemap(decompressed, robotsSitemapUrl);
              assessment.addColumn({ sitemap: robotsSitemapUrl, source: '/robots.txt', locs: urls.length });
            } else {
              // Handle regular sitemap
              const xml = await response.text();
              const urls = await parseSitemap(xml, robotsSitemapUrl);
              assessment.addColumn({ sitemap: robotsSitemapUrl, source: '/robots.txt', locs: urls.length });
            }
          }
        }
      }
    } else {
      assessment.addColumn({ sitemap: siteUrl, source: '/robots.txt', error: 'No robots.txt found' });
    }
  } catch (error) {
    
  }

  // Fetch and parse the default sitemap if no sitemap URL is found in robots.txt
  try {
    const response = await fetch(sitemapUrl, __USER_AGENT_HEADER);
    if (!response.ok || response.status === '404' || response.headers.get('content-type').includes('text/html')) {
      assessment.addColumn({ sitemap: sitemapUrl, source: 'Default /sitemap.xml', warning: 'not found' });
    } else {
      let xml;
      if (response.headers.get('content-type').includes('application/x-gzip')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const xml = zlib.gunzipSync(buffer).toString();
      } else {
        xml = await response.text();
      }
      const urls = await parseSitemap(xml, sitemapUrl);
      assessment.addColumn({ sitemap: sitemapUrl, source: 'Default /sitemap.xml', locs: urls.length });
    }
  } catch (error) {
    __visitedSitemaps.push(sitemapUrl);
    assessment.addColumn({ sitemap: sitemapUrl, source: 'Default /sitemap.xml', error });
  }
}

(async () => {
  const assessment = await createAssessment(userSiteUrl, 'Sitemap');
  assessment.setRowHeadersAndDefaults({
    sitemap: '',
    source: '',
    locs: 0,
    error: '',
    warning: ''
  });
  await fetchSitemapUrls(userSiteUrl, assessment);
  assessment.end();
})();
