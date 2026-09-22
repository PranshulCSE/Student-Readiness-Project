export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.password_hash',
  '*.token',
  '*.email',
];
