/**
 * CloudFront Functions — Viewer request (cloudfront-js-2.0)
 *
 * Appends .html ONLY for the three branch landing paths.
 * Other extensionless URLs (e.g. /login, /html_files/contactus) are NOT rewritten here —
 * link with explicit .html or use viewer-request-append-html.js (generic) instead.
 */
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
