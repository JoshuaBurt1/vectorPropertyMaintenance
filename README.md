# Vector Property Maintenance

Sample landing page for "Vector Property Maintenance". 
Use case: Demonstrate a functional business webpage with a $0 24/7 server without start-up times; using a monorepo architechture.

Monorepo architechture: standard front-end to server build; with mobile Android .apk file.
* Server reads and writes to Firestore database, updates front-end booking view dynamically, and separates completed work orders into separate collections to keep database reads efficient.
. Hosted on Render. Server kept from coldstart using: https://cron-job.org/en/.
* Web (front-end) communicates through server only. Hosted on Firebase. 
* Mobile application is a WebView of the front-end.


## Getting Started

https://vector-property-maintenance.web.app
