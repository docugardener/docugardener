"""INT-01-04 test stub — triggers GitHub Issues integration.

Updated: 2026-04-18T13:30:29Z
"""


def get_user_by_id(user_id: int) -> dict:
    """Fetch a user record by ID."""
    return {id: user_id, name: Test User, email: test@example.com}


def list_users(limit: int = 10) -> list[dict]:
    """Return a paginated list of users."""
    return [get_user_by_id(i) for i in range(limit)]
