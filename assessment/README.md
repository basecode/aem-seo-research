# SEO assessment

## Setup

- Run all assessments sequentially.  
- Every assessment shall return a CSV that can be copy/pasted into the overall assessment.  
- Every assessment requires a URL as first parameter. The URL must exist within the SpaceCat Catalogue.

## Development guide

1. Go to `/assessment/`
2. Copy `/assessment/sitemap.js` or use the boilerplate
   ```
   export const boilderplate = async (options) => {
      const { site, baseURL } = options;
      const assessment = await Assessment.create(site, 'Boilderplate Audit');

      // Set the row headers and default values, can be adjusted as needed for the specific assessment
      assessment.setRowHeadersAndDefaults({
         url: '',
         issues: '',
         error: '',
      });

      await audit(options, assessment);

      assessment.end();  
   }
   ```
