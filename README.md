# aem-seo-research
Misc SEO research

## Setup
Create .env file with the following content:
```
SPACECAT_API_KEY=
AHREFS_API_KEY=
```
Retrieve the values from [Vault](https://vault-amer.adobe.net/ui/vault/secrets/aem_exp_success_eng/show/spacecat/seo).

## How to trigger all assessments

`npm run all <baselUrl>`

## How to trigger sitemap assessment

`npm run sitemap <baseUrl>`

## How to trigger canonical assessment

`npm run canonical <baseUrl> [options]`

Options:
- `--top-pages=<number>` - Run audit for top pages (default 200), based on estimated organic traffic
- `--sitemap=<sitemapUrl>` - Specify a specific sitemap location (default fetched from robots.txt or /sitemap.xml), especially useful for page in development as they are not listed yet in the robots.txt or sitemap_index.xml
