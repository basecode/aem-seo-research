import axios from 'axios';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const sleep = promisify(setTimeout);

const SPACECAT_SITES_API = 'https://spacecat.experiencecloud.live/api/v1/sites';
const USER_AGENT = 'basecode/seo-research';

/*
Example output:
['https://domain1.com', 'https://domain2.com'];
*/
const getSpacecatSitesUrls = async () => {
  const response = await axios.get(SPACECAT_SITES_API, {
    headers: {
      'x-api-key': process.env.SPACECAT_API_KEY,
      'User-Agent': USER_AGENT
    }
  });
  return response.data.map((item) => item.baseURL);
}

const getSitemapXml = async (url) => {
  try {
    const response = await axios.get(`${url}/sitemap.xml`, {
      headers: {
          'User-Agent': USER_AGENT
      }
    });
    return response.status === 200 ? response.data : '';
  } catch (err) {
    return '';
  }
}

const findUrlsInSitemap = (xml) => {
  const regex = /(?<=<loc>)(.+?)(?=<\/loc>)/g;
  try {
    return [...xml.match(regex)];
  } catch (err) {
    return [];
  }
}

(async function() {
  console.time('ExecutionTime');
  const sitesUrls = await getSpacecatSitesUrls();
  const sitemapXmls = await Promise.all(sitesUrls.map(url => getSitemapXml(url)));
  const sitemapUrls = sitemapXmls.map(sitemapXml => findUrlsInSitemap(sitemapXml));
  const result = sitemapUrls.reduce((accumulator, urls) => Number(accumulator + urls.length), [0]);
  console.log(result);
  console.timeEnd('ExecutionTime');
})();

