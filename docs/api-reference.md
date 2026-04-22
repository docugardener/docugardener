
## New Endpoint

### GET /health/extended

Returns extended health information including database connectivity and queue status.

**Response:**
```json
{
  "status": "ok",
  "db": "connected",
  "queue": "active"
}
```
