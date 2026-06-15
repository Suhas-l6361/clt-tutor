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
  /** Public site — contact us form (POST JSON) */
  CONTACT_US_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/contactUs',
  /** CRM — fee receipts (GET/POST/PUT/DELETE JSON) — same API Gateway stage as CONTACT_US_API */
  FEES_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/fees',
  /** CRM — attendance save + history (GET/POST JSON) */
  ATTENDANCE_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/attendance',
  /** Public site — PYQ download modal (POST JSON) */
  DOWNLOAD_ANSWER_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/downloadAnswer',
  /** Public site — PYQ resource list (GET JSON) */
  PREVIOUS_QUEATION_PAPER_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/previous_queation_paper',
  /** Public site — demo class request (POST JSON) */
  DEMO_CLASS_API:
    'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/demoClass',
  /** CRM — student list (GET array) — same stage as auth student_general_info */
  STUDENT_GENERAL_INFO_API:
    'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info',
  /** CRM — OMR scan (POST JSON { image_base64 }). Deploy: npm run deploy:omr in Backend/crm_files */
  SCAN_OMR_API:
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/scan_omr',
  DEMO_MODE: true,
};

window.APP_CONFIG = APP_CONFIG;
