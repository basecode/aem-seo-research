# aem-seo-research
Misc SEO research

## How to trigger all assessments

`npm run all <baselUrl>`

## How to trigger canonical assessment

`node ./assessment/canonical.js <baseUrl> [options]`

Options:
- `--top-pages=<number>` - Run audit for top pages (default 200), based on estimated organic traffic
- `--sitemap=<sitemapUrl>` - Specify a specific sitemap location (default fetched from robots.txt or /sitemap.xml), especially useful for page in development as they are not listed yet in the robots.txt or sitemap_index.xml
