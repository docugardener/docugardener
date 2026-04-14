"""
WORK-01 Live Testing: Slack/Jira Integration PRs.

Creates 5 PRs covering the full severity spectrum to validate
DocuGardener drift detection and Slack notification flow end-to-end.

Submit one at a time with --index 1..5
"""

import asyncio
import subprocess
import sys
import time
from github import Auth, Github

REPO_NAME = "alexeykopachev/root"


def _gh_token() -> str:
    """Retrieve the token from the gh CLI keyring."""
    result = subprocess.run(
        ["gh", "auth", "token"], capture_output=True, text=True, check=True
    )
    return result.stdout.strip()

# ---------------------------------------------------------------------------
# 5 scenarios: trivial → minor → moderate → significant → critical
# ---------------------------------------------------------------------------

SCENARIOS = [
    # ------------------------------------------------------------------
    # PR 1 — Trivial: pure whitespace / cosmetic change
    # Expected DocuGardener result: NO DRIFT (score ≈ 0)
    # ------------------------------------------------------------------
    {
        "id": "w01-1-cosmetic",
        "title": "[W01-1] Trivial: Cosmetic Whitespace Change",
        "file": "src/cache_manager.py",
        "old_code": (
            "def get_cached(key):\n"
            "    \"\"\"Return cached value for key.\"\"\"\n"
            "    return _store.get(key)\n"
            "\n"
            "def set_cached(key, value):\n"
            "    \"\"\"Store value under key.\"\"\"\n"
            "    _store[key] = value\n"
            "\n"
            "_store = {}\n"
        ),
        "new_code": (
            "def get_cached(key):\n"
            "    \"\"\"Return cached value for key.\"\"\"\n"
            "    return _store.get(key)  \n"  # trailing space
            "\n"
            "\n"  # extra blank line
            "def set_cached(key, value):\n"
            "    \"\"\"Store value under key.\"\"\"\n"
            "    _store[key] = value\n"
            "\n"
            "_store = {}\n"
        ),
        "body": (
            "### What changed\n"
            "Added a trailing space on line 3 and an extra blank line between functions.\n\n"
            "### Expected DocuGardener behaviour\n"
            "**No drift** — purely cosmetic, zero semantic change.\n\n"
            "### WORK-01 test goal\n"
            "Validate that trivial PRs produce no Slack alert (or a clean ✅ pass message)."
        ),
    },

    # ------------------------------------------------------------------
    # PR 2 — Minor: docstring-only improvement on a private function
    # Expected DocuGardener result: MINOR drift (score ~0.2–0.3)
    # ------------------------------------------------------------------
    {
        "id": "w01-2-minor",
        "title": "[W01-2] Minor: Improve Internal Docstrings",
        "file": "src/notification_service.py",
        "old_code": (
            "def send(channel, message):\n"
            "    \"\"\"Send msg.\"\"\"\n"
            "    _dispatch(channel, message)\n"
            "\n"
            "def _dispatch(channel, message):\n"
            "    \"\"\"Do it.\"\"\"\n"
            "    print(f\"{channel}: {message}\")\n"
        ),
        "new_code": (
            "def send(channel, message):\n"
            "    \"\"\"Send a notification message to the specified channel.\"\"\"\n"
            "    _dispatch(channel, message)\n"
            "\n"
            "def _dispatch(channel, message):\n"
            "    \"\"\"\n"
            "    Internal dispatcher — formats and prints the message.\n"
            "\n"
            "    Args:\n"
            "        channel (str): Destination channel identifier.\n"
            "        message (str): Human-readable notification body.\n"
            "    \"\"\"\n"
            "    print(f\"{channel}: {message}\")\n"
        ),
        "body": (
            "### What changed\n"
            "Expanded the docstrings on `send` and the private `_dispatch` helper.\n"
            "No logic, signatures, or behaviour modified.\n\n"
            "### Expected DocuGardener behaviour\n"
            "**Minor drift** — docs improved but public API contract unchanged.\n\n"
            "### WORK-01 test goal\n"
            "Validate that a minor-severity Slack alert is sent with the correct severity label."
        ),
    },

    # ------------------------------------------------------------------
    # PR 3 — Moderate: internal logic rewrite, same public signature
    # Expected DocuGardener result: MODERATE drift (score ~0.5–0.6)
    # ------------------------------------------------------------------
    {
        "id": "w01-3-moderate",
        "title": "[W01-3] Moderate: Rewrite Rate-Limiter Logic",
        "file": "src/rate_limiter.py",
        "old_code": (
            "class RateLimiter:\n"
            "    \"\"\"Fixed-window rate limiter.\"\"\"\n"
            "\n"
            "    def __init__(self, limit, window):\n"
            "        self.limit = limit\n"
            "        self.window = window\n"
            "        self._count = 0\n"
            "        self._reset_at = 0\n"
            "\n"
            "    def is_allowed(self, key):\n"
            "        \"\"\"Return True if request is within rate limit.\"\"\"\n"
            "        import time\n"
            "        now = time.time()\n"
            "        if now > self._reset_at:\n"
            "            self._count = 0\n"
            "            self._reset_at = now + self.window\n"
            "        self._count += 1\n"
            "        return self._count <= self.limit\n"
        ),
        "new_code": (
            "import time\n"
            "from collections import deque\n"
            "\n"
            "class RateLimiter:\n"
            "    \"\"\"Sliding-window rate limiter.\"\"\"\n"
            "\n"
            "    def __init__(self, limit, window):\n"
            "        self.limit = limit\n"
            "        self.window = window\n"
            "        self._timestamps = deque()\n"
            "\n"
            "    def is_allowed(self, key):\n"
            "        \"\"\"Return True if request is within rate limit.\"\"\"\n"
            "        now = time.time()\n"
            "        cutoff = now - self.window\n"
            "        while self._timestamps and self._timestamps[0] < cutoff:\n"
            "            self._timestamps.popleft()\n"
            "        if len(self._timestamps) < self.limit:\n"
            "            self._timestamps.append(now)\n"
            "            return True\n"
            "        return False\n"
        ),
        "body": (
            "### What changed\n"
            "Replaced fixed-window counter with a sliding-window deque-based algorithm.\n"
            "Public interface (`is_allowed(key)`) is preserved; internal state completely rewired.\n\n"
            "### Expected DocuGardener behaviour\n"
            "**Moderate drift** — same public signature, but behaviour semantics changed\n"
            "(sliding vs fixed window has different burst characteristics).\n\n"
            "### WORK-01 test goal\n"
            "Validate moderate-severity Slack alert content and PR link formatting."
        ),
    },

    # ------------------------------------------------------------------
    # PR 4 — Significant: new public class added to an existing module
    # Expected DocuGardener result: SIGNIFICANT drift (score ~0.7–0.8)
    # ------------------------------------------------------------------
    {
        "id": "w01-4-significant",
        "title": "[W01-4] Significant: Add EventBus Public Class",
        "file": "src/event_bus.py",
        "old_code": (
            "# Event utilities\n"
            "\n"
            "def emit(event_name, payload):\n"
            "    \"\"\"Fire a named event with payload.\"\"\"\n"
            "    _handlers = _registry.get(event_name, [])\n"
            "    for h in _handlers:\n"
            "        h(payload)\n"
            "\n"
            "_registry = {}\n"
        ),
        "new_code": (
            "# Event utilities\n"
            "\n"
            "def emit(event_name, payload):\n"
            "    \"\"\"Fire a named event with payload.\"\"\"\n"
            "    _handlers = _registry.get(event_name, [])\n"
            "    for h in _handlers:\n"
            "        h(payload)\n"
            "\n"
            "_registry = {}\n"
            "\n"
            "\n"
            "class EventBus:\n"
            "    \"\"\"\n"
            "    Thread-safe publish/subscribe event bus.\n"
            "\n"
            "    Supports multiple subscribers per topic and\n"
            "    wildcard topic matching via '*' suffix.\n"
            "    \"\"\"\n"
            "\n"
            "    def __init__(self):\n"
            "        self._subscribers = {}\n"
            "\n"
            "    def subscribe(self, topic, callback):\n"
            "        \"\"\"\n"
            "        Register *callback* to receive messages on *topic*.\n"
            "\n"
            "        Args:\n"
            "            topic (str): Topic name or wildcard pattern.\n"
            "            callback (callable): Handler invoked with (topic, message).\n"
            "        \"\"\"\n"
            "        self._subscribers.setdefault(topic, []).append(callback)\n"
            "\n"
            "    def publish(self, topic, message):\n"
            "        \"\"\"\n"
            "        Broadcast *message* to all subscribers of *topic*.\n"
            "\n"
            "        Args:\n"
            "            topic (str): The topic to publish to.\n"
            "            message: Arbitrary payload passed to subscribers.\n"
            "        \"\"\"\n"
            "        for sub_topic, callbacks in self._subscribers.items():\n"
            "            if sub_topic == topic or sub_topic.rstrip('*') in topic:\n"
            "                for cb in callbacks:\n"
            "                    cb(topic, message)\n"
            "\n"
            "    def unsubscribe(self, topic, callback):\n"
            "        \"\"\"\n"
            "        Remove *callback* from *topic* subscribers.\n"
            "\n"
            "        Args:\n"
            "            topic (str): Topic the callback was registered under.\n"
            "            callback (callable): The handler to remove.\n"
            "        \"\"\"\n"
            "        if topic in self._subscribers:\n"
            "            self._subscribers[topic] = [\n"
            "                cb for cb in self._subscribers[topic] if cb != callback\n"
            "            ]\n"
        ),
        "body": (
            "### What changed\n"
            "Added a new `EventBus` class with three public methods (`subscribe`, `publish`,\n"
            "`unsubscribe`) alongside the existing `emit()` function. Entirely new public API surface.\n\n"
            "### Expected DocuGardener behaviour\n"
            "**Significant drift** — large new public API introduced without corresponding\n"
            "documentation update.\n\n"
            "### WORK-01 test goal\n"
            "Validate that significant-severity alert reaches Slack with full diff context."
        ),
    },

    # ------------------------------------------------------------------
    # PR 5 — Critical: public API signature broken + docstring removed
    # Expected DocuGardener result: CRITICAL drift (score ~0.9–1.0)
    # ------------------------------------------------------------------
    {
        "id": "w01-5-critical",
        "title": "[W01-5] Critical: Break Auth Service Public API",
        "file": "src/auth_service.py",
        "old_code": (
            "def authenticate(username, password):\n"
            "    \"\"\"\n"
            "    Authenticate a user with username and password.\n"
            "\n"
            "    Args:\n"
            "        username (str): The account username.\n"
            "        password (str): The plaintext password.\n"
            "\n"
            "    Returns:\n"
            "        str: A session token on success.\n"
            "\n"
            "    Raises:\n"
            "        AuthError: If credentials are invalid.\n"
            "    \"\"\"\n"
            "    if username and password:\n"
            "        return f\"token-{username}\"\n"
            "    raise AuthError(\"Invalid credentials\")\n"
            "\n"
            "\n"
            "def logout(token):\n"
            "    \"\"\"Invalidate a session token.\"\"\"\n"
            "    _sessions.discard(token)\n"
            "\n"
            "\n"
            "class AuthError(Exception):\n"
            "    pass\n"
            "\n"
            "_sessions = set()\n"
        ),
        "new_code": (
            "def authenticate(credentials, provider=\"local\", mfa_code=None):\n"
            "    # credentials is now a dict: {\"user\": ..., \"secret\": ...}\n"
            "    # old (username, password) signature removed without deprecation\n"
            "    user = credentials.get(\"user\")\n"
            "    secret = credentials.get(\"secret\")\n"
            "    if provider == \"local\" and user and secret:\n"
            "        if mfa_code is None:\n"
            "            raise AuthError(\"MFA required\")\n"
            "        return f\"token-{user}-{provider}\"\n"
            "    raise AuthError(\"Authentication failed\")\n"
            "\n"
            "\n"
            "def revoke(token, reason=None):\n"
            "    # renamed from logout() — callers using logout() will break\n"
            "    _sessions.discard(token)\n"
            "\n"
            "\n"
            "class AuthError(Exception):\n"
            "    pass\n"
            "\n"
            "_sessions = set()\n"
        ),
        "body": (
            "### What changed\n"
            "- `authenticate(username, password)` → `authenticate(credentials: dict, provider, mfa_code)`\n"
            "  — **incompatible positional signature change**, docstring deleted.\n"
            "- `logout(token)` → `revoke(token, reason=None)` — **function renamed**, all callers break.\n\n"
            "### Expected DocuGardener behaviour\n"
            "**Critical drift** — two public API contracts broken simultaneously with no\n"
            "documentation update. Highest possible severity.\n\n"
            "### WORK-01 test goal\n"
            "Validate critical-severity Slack alert fires with blocking/urgent formatting."
        ),
    },
]


async def submit_one(index: int):
    """Submit a single scenario by 1-based index."""
    if index < 1 or index > len(SCENARIOS):
        print(f"Index must be 1–{len(SCENARIOS)}")
        sys.exit(1)

    scenario = SCENARIOS[index - 1]
    token = _gh_token()
    repo = Github(auth=Auth.Token(token)).get_repo(REPO_NAME)
    base_branch = repo.default_branch

    print(f"\nSubmitting PR {index}/{len(SCENARIOS)}: {scenario['title']}")
    print(f"  File   : {scenario['file']}")
    print(f"  Base   : {base_branch}")

    # --- Seed base file if needed -----------------------------------------
    try:
        existing = repo.get_contents(scenario["file"], ref=base_branch)
        repo.update_file(
            path=scenario["file"],
            message=f"[W01] Seed baseline: {scenario['file']}",
            content=scenario["old_code"],
            sha=existing.sha,
            branch=base_branch,
        )
        print("  Seeded : updated existing file to baseline")
    except Exception:
        repo.create_file(
            path=scenario["file"],
            message=f"[W01] Seed baseline: {scenario['file']}",
            content=scenario["old_code"],
            branch=base_branch,
        )
        print("  Seeded : created new baseline file")

    await asyncio.sleep(3)  # let GitHub propagate

    # --- Create feature branch --------------------------------------------
    sb = repo.get_branch(base_branch)
    branch_name = f"work01-{scenario['id']}-{int(time.time())}"
    repo.create_git_ref(ref=f"refs/heads/{branch_name}", sha=sb.commit.sha)
    print(f"  Branch : {branch_name}")

    # --- Apply change ------------------------------------------------------
    file_on_branch = repo.get_contents(scenario["file"], ref=branch_name)
    repo.update_file(
        path=scenario["file"],
        message=f"[W01] {scenario['title']}",
        content=scenario["new_code"],
        sha=file_on_branch.sha,
        branch=branch_name,
    )

    # --- Open PR ----------------------------------------------------------
    pr = repo.create_pull(
        title=scenario["title"],
        body=scenario["body"],
        head=branch_name,
        base=base_branch,
    )
    print(f"\n  PR URL : {pr.html_url}")
    print(f"  Done. DocuGardener webhook should fire within seconds.")


async def submit_all():
    for i in range(1, len(SCENARIOS) + 1):
        await submit_one(i)
        print("\nWaiting 5s before next PR...")
        await asyncio.sleep(5)


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1].isdigit():
        asyncio.run(submit_one(int(sys.argv[1])))
    elif len(sys.argv) == 2 and sys.argv[1] == "all":
        asyncio.run(submit_all())
    else:
        print(__doc__)
        print("\nUsage:")
        print("  python scripts/submit_work01_prs.py 1     # submit PR 1 only")
        print("  python scripts/submit_work01_prs.py 2     # submit PR 2 only")
        print("  python scripts/submit_work01_prs.py all   # submit all 5")
        print("\nScenarios:")
        for i, s in enumerate(SCENARIOS, 1):
            print(f"  {i}. {s['title']}")
