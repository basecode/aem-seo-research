import axios from 'axios';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const sleep = promisify(setTimeout);

const RUM_DASHBOARD_URL = 'https://helix-pages.anywhere.run/helix-services/run-query@v3/rum-dashboard';
const REDIRECT_THRESHOLD = 1000;
const USER_AGENT = 'basecode/many-redirects';

/*
Example output:
[
  'www.mydomain.com',
  'null',
  'main--mydomain--adobecom.hlx.live',
  'main--mydomain--adobecom.hlx.page',
  'Other',
];
*/
const getRumUrls = async () => {
  const response = await axios.get(`${RUM_DASHBOARD_URL}?limit=300`, {
    headers: {
      'Authorization': `Bearer ${process.env.RUM_GLOBAL_KEY}`,
      'User-Agent': USER_AGENT
    }
  });
  return response.data.results.data.map((item) => item.url);
}

const getRedirectUrls = (urls) => {
  return urls
    .filter((url) => {
      return url != 'null' && url != 'Other' && url != 'undefined' && url != ' ' && url != '' && url != null && url != undefined;
    })
    .map((url) => {
      if (url.startsWith('main--')) {
        return {
          url,
          redirectUrl: `https://${url}/redirects.json`
        };
      }
      const parts = url.replace('www.', '').replace('http://', '').replace('https://', '').split('.');
      return {
        url,
        redirectUrl: `https://main--${parts[0]}--hlxsites.hlx.live/redirects.json`,
      };
    })
}

/*
Example output:
[
  {url: 'www.somedomain.com', total: 1752, redirectUrl: 'https://main--somedomain--hlxsites.hlx.live/redirects.json'},
];
*/
const getRedirectFiles = async (urls) => {
  const redirectUrls = [];

  const promises = urls.map(async (urlObject) => {
    try {
      const response = await axios.get(urlObject.redirectUrl, {
        headers: {
          'User-Agent': USER_AGENT
        }
      });
      if (response.data.total > REDIRECT_THRESHOLD) {
        return {
          url: urlObject.url,
          total: response.data.total,
          redirectUrl: urlObject.redirectUrl
        };
      }
    } catch (e) {
    }
    return null;
  });

  const results = await Promise.all(promises);

  results.forEach(result => {
    if (result) {
      redirectUrls.push(result);
    }
  });

  return redirectUrls;
};

(async function() {
  const rumUrls = await getRumUrls();
  const redirectUrls = getRedirectUrls(rumUrls);
  const redirectFiles = await getRedirectFiles(redirectUrls);
  console.log(redirectFiles);
})();

