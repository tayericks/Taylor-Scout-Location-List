# Taylor Scout Location List
Deploy to Vercel as a Vite project. Recommended domain: locations.taylorscout.com.

Current build uses browser local storage for the working prototype. The UI is ready for the shared Supabase data layer; do not treat the Connect/shared-data behavior as live until the database migration is added.


## Update 4.0.0
- Unified Taylor Scout logo and dashboard navigation.
- Interface and print refinements requested July 29, 2026.

## v6 connected suite styling
- Restyled Location List to match Taylor Budget and Location Bible.
- Added dark navy top bar and left sidebar, teal-backed Taylor Scout logo, uniform actions, and suite typography/colors.
- Preserved connected Scout Log data and final-location printing.

## Shared subdomain authentication
This build reads the same chunked Supabase session cookies used by the Hub on `.taylorscout.com`. Deploy the matching Hub shared-auth build first, then refresh/sign in at the Hub before opening Location List.
