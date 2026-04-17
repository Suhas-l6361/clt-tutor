/**
 * CloudFront Functions — Viewer request (cloudfront-js-2.0)
 *
 * Paste the chosen `function handler(event) { ... }` into the AWS console.
 *
 * 1) DEFAULT (recommended): appends .html to any extensionless path so the whole
 *    site keeps working: /login, /html_files/contactus, /clat-coaching-jayanagar, etc.
 *
 * 2) COACHING_ONLY: only the three branch paths get .html — use only if you have
 *    another way to serve other extensionless URLs (otherwise you will get 403/404).
 */

/* -------------------------------------------------------------------------- */
/* DEFAULT — use this unless you know you need a whitelist only              */
/* -------------------------------------------------------------------------- */
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === "/" || uri.endsWith("/")) {
    return request;
  }

  if (/\.(html|htm|css|js|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|pdf|mp4|webm|xml|txt)$/i.test(uri)) {
    return request;
  }

  request.uri = uri + ".html";
  return request;
}

/* -------------------------------------------------------------------------- */
/* OPTIONAL — only these three paths get .html (replace handler() with this) */
/* -------------------------------------------------------------------------- */
/*
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === "/" || uri.endsWith("/")) {
    return request;
  }

  if (/\.(html|htm|css|js|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|pdf|mp4|webm|xml|txt)$/i.test(uri)) {
    return request;
  }

  var coachingOnly = [
    "/clat-coaching-jayanagar",
    "/clat-coaching-malleshwaram",
    "/clat-coaching-yelahanka"
  ];

  if (coachingOnly.indexOf(uri) !== -1) {
    request.uri = uri + ".html";
    return request;
  }

  return request;
}
*/
