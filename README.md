# Vector Property Maintenance

Sample landing page for "Vector Property Maintenance". 

Monorepo architechture: 
* server reads and writes to Firestore database. Hosted on Render.
* web (front-end) communicates through server only. Hosted on Firebase. 
* mobile application is a WebView of the front-end.

Performance boost:
* Server kept from coldstart using: https://cron-job.org/en/. Note that this may be turned off to conserve run-time for other projects.
* $0 24/7 server without start-up times. Perform server tasks like calculating minimum distance scheduling for workers and deleting expired tasks.

Use-case:
* Standard front-end to server architecture; with mobile Android .apk file.
* Light-weight example.


## Getting Started

https://vector-property-maintenance.web.app
