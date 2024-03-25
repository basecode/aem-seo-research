# aem-seo-research
Misc SEO research

## How to trigger all assessments

`npm run all <baselUrl>`

## How to trigger canonical assessment

`node ./assessment/canonical.js <baseUrl> [options]`

Options:
- `--all` - Run audit for all pages listed in sitemap
- `--top-pages=<number>` - Run audit for top pages (default 200), based on estimated organic traffic
- `--sitemap=<sitemapUrl>` - Specify a specific sitemap location, especially useful for page in development as they are not listed yet in the robots.txt or sitemap_index.xml
- `--ignore-ahrefs-cache` - Top pages are locally cached to reduce API calls to Ahrefs. This option ignores the Ahrefs cache and fetches fresh data
