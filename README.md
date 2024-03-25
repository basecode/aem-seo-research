# aem-seo-research
Misc SEO research

## How to trigger all assessments

`npm run all <baselUrl>`

## How to trigger canonical assessment

`node ./assessment/canonical.js <baseUrl> [options]`

Options:
- `--all` - Run audit for all pages listed in sitemap
- `--top-pages=<number>` - Run audit for top pages (default 200), based on estimated organic traffic
- `--ignore-ahrefs-cache` - Top pages are locally cached to reduce API calls to Ahrefs. This option ignores the Ahrefs cache and fetches fresh data
