/**
 * App configuration — swap API_BASE when backend is ready.
 * Demo mode uses localStorage via data-store.js
 */
const APP_CONFIG = {
  NAME: 'Institute Portal',
  STORAGE_PREFIX: 'edportal_',
  /** Set to REST root when APIs exist; fetch() will use this */
  API_BASE: '',
  /** CRM — Add Test: Lambda + API Gateway (POST multipart JSON with base64 files) */
  ADD_TEST_API: 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/add_test',
  /** Student — submit online test answers + grading (same API Gateway stage as ADD_TEST_API) */
  SUBMIT_ONLINE_TEST_API: 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/submit_online_test',
  /** Public site — index “Request a callback” form (POST JSON) */
  REQUEST_CALLBACK_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/requestCallback',
  /** Public site — admission enrollment form (POST JSON) */
  ENROLL_REQUEST_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/enrollrequest',
  /** Public site — PYQ download modal (POST JSON) */
  DOWNLOAD_ANSWER_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/downloadAnswer',
  DEMO_MODE: true,
};

window.APP_CONFIG = APP_CONFIG;
