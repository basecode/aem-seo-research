import fetch from 'node-fetch';
const BASE_URL = 'https://spacecat.experiencecloud.live/api/v1';
const USER_AGENT = 'basecode/seo-research';

export async function makeSpaceCatApiCall(method, url, data = null) {
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