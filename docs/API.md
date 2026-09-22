# API Documentation (docs/API.md)

Base URL: `/api`  
All request and response payloads use JSON. All error responses use the standard Error Envelope.

---

## 1. Error Envelope

All error responses return the following standard JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid",
    "requestId": "req_a1b2c3d4e5f6",
    "fieldErrors": [
      {
        "field": "score",
        "code": "OUT_OF_RANGE",
        "message": "score must be between 0 and 100"
      }
    ],
    "currentVersion": 4
  }
}
```

### Error Codes
| Error Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing, malformed, or expired Bearer token. |
| `FORBIDDEN` | 403 | User role lacks sufficient permissions. |
| `NOT_FOUND` | 404 | Resource not found, or cross-tenant access denied (non-disclosing). |
| `VALIDATION_ERROR` | 400 | Request body, query parameters, or headers failed schema validation. |
| `CONFLICT_VERSION` | 409 | Resource version mismatch (`If-Match` vs database `version`). Returns `currentVersion`. |
| `CONFLICT_IDEMPOTENCY` | 409 | The provided `Idempotency-Key` was already used with different parameters. |
| `IDEMPOTENCY_REPLAY` | 200/201 | Informational code when replaying a stored response with `Idempotency-Replayed: true`. |
| `RATE_LIMITED` | 429 | Rate limit exceeded for the tenant/user or IP. |
| `INTERNAL` | 500 | Unhandled internal server error (stack trace sanitized and masked). |

---

## 2. Authentication

### POST `/api/auth/login`
Authenticate user credentials and retrieve a short-lived JWT scoped to tenant and role.

**Request Body**:
```json
{
  "email": "admin@acme.edu",
  "password": "password123",
  "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
}
```

**Response (200 OK)**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": "11111111-1111-1111-1111-111111111111",
    "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "email": "admin@acme.edu",
    "role": "admin"
  }
}
```

---

## 3. Students

### GET `/api/students`
List students scoped to the authenticated tenant, with filtering, sorting, and cursor-based pagination.

**Headers**:
- `Authorization: Bearer <token>` (Required)

**Query Parameters**:
| Param | Type | Default | Constraints | Description |
|---|---|---|---|---|
| `q` | string | `""` | Max 100 characters | Search term matching full name or email |
| `status` | string | `"active"` | `"active" \| "archived" \| "all"` | Account status filter |
| `readiness` | string | `—` | `"READY" \| "NEARLY_READY" \| "DEVELOPING" \| "NEEDS_PREPARATION" \| "INCOMPLETE"` | Filter by calculated readiness |
| `sort` | string | `"name_asc"` | `"name_asc" \| "name_desc" \| "score_desc" \| "score_asc" \| "updated_desc"` | Sort ordering |
| `limit` | integer | `20` | Min 1, Max 100 | Number of records per page |
| `cursor` | string | `—` | Opaque HMAC-signed string | Keyset pagination cursor |

**Response (200 OK)**:
```json
{
  "data": [
    {
      "id": "44444444-4444-4444-4444-444444444444",
      "fullName": "Asha R.",
      "email": "asha@org.example",
      "status": "active",
      "overallScore": 82.5,
      "readiness": "READY",
      "version": 3,
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "page": {
    "nextCursor": "ZXlKaGJHY2lPaUpJVXpVek5pSXNJbi4uLg.h8_2...",
    "hasMore": true,
    "limit": 20
  }
}
```

---

### GET `/api/students/:id`
Retrieve detailed profile of a student, including the latest non-voided attempt for each competency.

**Headers**:
- `Authorization: Bearer <token>` (Required)

**Response (200 OK)**:
```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "fullName": "Asha R.",
  "email": "asha@org.example",
  "status": "active",
  "version": 3,
  "overallScore": 82.5,
  "readiness": "READY",
  "competencies": [
    {
      "key": "frontend",
      "label": "Frontend",
      "weight": 0.30,
      "latestAttempt": {
        "id": "att-9999-...",
        "score": 85.0,
        "attemptedAt": "2025-01-01T10:00:00.000Z",
        "evaluatorId": "33333333-3333-3333-3333-333333333333"
      }
    },
    {
      "key": "backend",
      "label": "Backend",
      "weight": 0.30,
      "latestAttempt": null
    }
  ]
}
```

---

### PATCH `/api/students/:id`
Update student demographic fields with optimistic concurrency locking.

**Headers**:
- `Authorization: Bearer <token>` (Required, role must be `admin`)
- `If-Match: <currentVersion>` (Required, positive integer)

**Request Body (Allowlist strictly enforced: `fullName`, `email`, `status`)**:
```json
{
  "fullName": "Asha Ram",
  "email": "asharam@org.example",
  "status": "active"
}
```

**Conflict Response (409 Conflict)**:
```json
{
  "error": {
    "code": "CONFLICT_VERSION",
    "message": "Resource version conflict",
    "requestId": "req_b7a2d1094f31",
    "currentVersion": 4
  }
}
```

---

## 4. Attempts

### POST `/api/students/:id/attempts`
Record a new competency evaluation attempt.

**Headers**:
- `Authorization: Bearer <token>` (Required, role: `evaluator` or `admin`)
- `Idempotency-Key: <uuid>` (Required)
- `If-Match: <currentVersion>` (Optional)

**Request Body**:
```json
{
  "competencyKey": "frontend",
  "score": 87.5,
  "attemptedAt": "2025-01-01T00:00:00.000Z"
}
```

**Response (201 Created)**:
```json
{
  "id": "attempt-uuid-1234",
  "studentId": "44444444-4444-4444-4444-444444444444",
  "competencyKey": "frontend",
  "score": 87.5,
  "attemptedAt": "2025-01-01T00:00:00.000Z",
  "evaluatorId": "33333333-3333-3333-3333-333333333333",
  "studentVersion": 4,
  "readiness": "READY",
  "overallScore": 82.5
}
```

*When replaying an exact duplicate request:*
Returns `201 Created` with header `Idempotency-Replayed: true` and the exact cached response body.

*When using the same Idempotency-Key with different payload:*
Returns `409 Conflict` with code `CONFLICT_IDEMPOTENCY`.

---

## 5. Activity & Audit Events

### GET `/api/students/:id/activity`
Retrieve the operational event stream for a student from MongoDB.

**Headers**:
- `Authorization: Bearer <token>` (Required)

**Query Parameters**:
- `limit`: integer (1 to 50, default 20)
- `cursor`: string (optional)

**Response (200 OK)**:
```json
{
  "data": [
    {
      "eventId": "event-uuid-5678",
      "type": "attempt.succeeded",
      "occurredAt": "2025-01-01T00:00:00.000Z",
      "metadata": {
        "competencyKey": "frontend",
        "score": 87.5,
        "evaluatorId": "33333333-3333-3333-3333-333333333333"
      }
    }
  ],
  "page": {
    "nextCursor": "...",
    "hasMore": false,
    "limit": 20
  }
}
```

---

### GET `/api/admin/events/duplicates`
MongoDB aggregation endpoint calculating duplicate delivery violations and rejection rates per tenant.

**Headers**:
- `Authorization: Bearer <token>` (Required, role: `admin`)

**Response (200 OK)**:
```json
[
  {
    "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "duplicateSuccessEvents": 0,
    "rejected": 12,
    "succeeded": 340,
    "rejectionRate": 0.034
  }
]
```
