## API Changes

### New Function: `diagnostics`

A new asynchronous function `diagnostics` has been added to the `diagnostics` module.

#### Description

This function provides operator diagnostics by checking the health of live dependencies and reporting runtime information. It specifically verifies connectivity to Redis and Weaviate, reports the depth of RQ queues, the Python version, and the process uptime. This endpoint is designed for post-deployment verification and on-call troubleshooting.

#### Returns

A JSON object containing the following keys:
*   `python_version` (str): The version of the Python interpreter.
*   `uptime_seconds` (float): The uptime of the process in seconds.
*   `deployment_mode` (str): The current deployment mode.
*   `redis` (dict): The diagnostic result for Redis connectivity.
*   `weaviate` (dict): The diagnostic result for Weaviate connectivity.
*   `timestamp` (str): The ISO-formatted timestamp of when the diagnostics were generated.

#### Example Usage

```python
import asyncio
from src.api.diagnostics import diagnostics

async def main():
    diag_info = await diagnostics()
    print(diag_info)

if __name__ == "__main__":
    asyncio.run(main())
```