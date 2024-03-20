import fetch from 'node-fetch';
const BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';

const USER_AGENT = 'basecode/seo-research-crawler/1.0';

export async function makeApiCall(method, url, data = null) {
  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      method: method,
      headers: {
          'x-api-key': process.env.SPACECAT_API_KEY,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) throw new Error(`API call failed with HTTP status ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

export async function getSiteByBaseUrl(siteUrl) {
  const base64Url = Buffer.from(siteUrl).toString('base64');
  try {
    return await makeApiCall('GET', `/sites/by-base-url/${base64Url}`);
  } catch (error) {
    console.error('Error fetching site:', error);
    return null; // Site does not exist or an error occurred
  }
}