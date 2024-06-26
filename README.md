# aem-seo-research
Misc SEO research

## Setup
Create .env file with the following content:
```
SPACECAT_API_KEY=
AHREFS_API_KEY=
```
Retrieve the values from [Vault](https://vault-amer.adobe.net/ui/vault/secrets/aem_exp_success_eng/show/spacecat/seo).

Run `npm install` to install dependencies.

## How to trigger all assessments

`npm run all <baseURL> [options]`

This will create a CSV file for each assessment in the `output` folder with the results.
The results are summarized in a `summary.csv` file.

## How to trigger sitemap assessment

`npm run sitemap <baseUrl>`

## How to trigger canonical assessment

`npm run canonical <baseUrl> [options]`

## How to trigger brokenInternalLinks assessment

`npm run broken-internal-links <baseUrl>`

## How to trigger broken backlinks assessment

`npm run broken-backlinks <baseUrl>`

The backlinks will be checked on the development environment, if a `devBaseURL` is provided (with priority) or an
`gitHubURL` is set in SpaceCat for the site. If none of these are set, the backlinks will be checked on the
production environment, as inferred from the `baseURL` of the site in SpaceCat.

## Options
The following options are available for the assessments.
They can be used either for running a single assessment or to run all assessments.
If they are used to run all assessments, some options will only be used by their relevant assessments.

- `topBacklinks=<number>` - Number of top backlinks (default 200), to run the audit for
- `topPages=<number>` - Number of top pages (default 200), based on estimated organic traffic, to filter the backlinks
- `onlyBacklinksInTopPages=<boolean>` - Only check backlinks that are in the top pages (default true)
- `devBaseURL=<devBaseURL>` - Base URL of the development environment on which the backlinks should be checked. 
- `sitemap=<sitemapUrl>` - Not used for now. Specify a specific sitemap location (default fetched from robots.txt or 
  /sitemap.xml), especially useful for page in development as they are not listed yet in the robots.txt or sitemap_index.xml,
 to use instead of the top pages from Ahrefs
