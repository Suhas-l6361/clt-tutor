<?php
/**
 * Same-origin fetch for Toprankers pages (avoids browser CORS).
 * Only toprankers.com hosts are allowed.
 */
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$url = isset($_GET['url']) ? trim((string) $_GET['url']) : '';
$url = preg_replace('/^view-source:/i', '', $url);

$host = parse_url($url, PHP_URL_HOST);
$scheme = parse_url($url, PHP_URL_SCHEME);
if (
  !$url ||
  !in_array(strtolower((string) $scheme), ['http', 'https'], true) ||
  !$host ||
  !preg_match('/(^|\.)toprankers\.com$/i', $host)
) {
  http_response_code(400);
  echo 'Only https://www.toprankers.com URLs are allowed.';
  exit;
}

$ctx = stream_context_create([
  'http' => [
    'timeout' => 28,
    'follow_location' => 1,
    'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nAccept: text/html\r\n",
  ],
  'ssl' => [
    'verify_peer' => true,
    'verify_peer_name' => true,
  ],
]);

$html = @file_get_contents($url, false, $ctx);
if ($html === false) {
  http_response_code(502);
  echo 'Could not fetch that Toprankers page from the server.';
  exit;
}

echo $html;
