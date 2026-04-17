### API Changes

#### `diagnostics()`

The `diagnostics` function has been updated to include PostgreSQL connectivity checks.

**Description:**

Operator diagnostics — live dependency health + runtime info.

Checks Redis, Weaviate, and PostgreSQL connectivity; reports RQ queue depths, Python version, and process uptime. Intended for post-deploy verification and on-call triage.

**Returns:**

JSON object with keys: `python_version`, `uptime_seconds`, `redis`, `weaviate`, `postgres`, `deployment_mode`, `timestamp`.

**Example:**

```python
import asyncio
from your_module import diagnostics # Assuming diagnostics is in your_module

async def main():
    diag_info = await diagnostics()
    print(diag_info)

if __name__ == "__main__":
    asyncio.run(main())
```

**Example Output:**

```json
{
  "python_version": "3.10.12 (main, Nov 20 2023, 15:14:05) [GCC 11.4.0]",
  "uptime_seconds": 1234.5,
  "deployment_mode": "production",
  "redis": {
    "connected": true,
    "version": "7.0.11"
  },
  "weaviate": {
    "connected": true,
    "version": "1.22.5"
  },
  "postgres": {
    "connected": true,
    "version": "15.3"
  },
  "timestamp": "2023-10-27T10:30:00.123456+00:00"
}
```