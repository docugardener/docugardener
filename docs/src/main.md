### Changed Entity
**Name:** create_app
**Type:** function
**File:** src/main.py

### Change Analysis
**Type:** logic_modified
**Details:** The `diagnostics_router` has been added to the application's included routers.

### Updated Documentation

The `create_app` function initializes and configures the FastAPI application. It includes various middleware for CORS, Prometheus metrics, and tenant context.

The function now registers the following routers:
- `health_router`
- `diagnostics_router`
- `webhooks_router`
- `stripe_router` (conditionally, based on `settings.deployment_mode`)
- `prompts_router`
- `inbox_router`
- `repos_router`
- `check_router`
- `plugin_key_router`
- `saml_router`
- `scim_router`
- `feedback_router`
- `rules_router`
- `billing_router`

It also mounts a Prometheus metrics endpoint at `/metrics` and includes a global exception handler to ensure all unhandled exceptions return a JSON response.

**Example Usage:**

```python
from src.main import create_app

app = create_app()

# Now you can run the app using uvicorn or another ASGI server
# uvicorn src.main:app --reload
```