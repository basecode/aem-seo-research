# SEO assessment

## Setup

- Run all assessments sequentially.  
- Every assessment shall return a CSV that can be copy/pasted into the overall assessment.  
- Every assessment requires a URL as first parameter. The URL must exist within the SpaceCat Catalogue.

Example: `node ./assessment/sitemap.js "https://bitdefender.com.au/solutions/"`

## Development guide

1. Go to `/assessment/`
2. Copy `/assessment/sitemap.js` or use the boilerplate
   ```
   import dotenv from 'dotenv';
   import { createAssessment } from './assessment-lib.js';

   (async () => {
      const assessment = await createAssessment(userSiteUrl, 'My Assessment');
      assessment.setRowHeadersAndDefaults({
         sitemap: '',
         source: '',
         error: '',
         warning: ''
      });
      // business logic
      // assessment.addColumn({ sitemap: 'https:mysite/sitemap.xml', source: 'default sitemap.xml'});
      assessment.end();
   })();
   ```
