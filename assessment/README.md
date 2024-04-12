# SEO assessment

## Setup

- Run all assessments sequentially.  
- Every assessment shall return a CSV that can be copy/pasted into the overall assessment.  
- Every assessment requires a URL as first parameter. The URL must exist within the SpaceCat Catalogue.

## Development guide

1. Go to `/assessment/`
2. Create a new file `/assessment/boilerplate.js` with the following content:
   ```
   export const boilderplate = async (options) => {
      const { site, baseURL } = options;
      const assessment = new Assessment(options, 'Boilderplate Audit');

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
3. Add the audit to all-assessments.js
   ```
   import { boilerplate } from './boilerplate.js'
   
   const audits = {
       boilerplate,
       // other audits...
    }
   ```
   
4. Add the audit to the `package.json` to execute individual audits
   ```
   "boilerplate": "node ./all-assessments.js audit=boilerplate"
   ```
