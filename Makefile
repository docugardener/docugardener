DC = docker-compose --env-file .env -f docker/docker-compose.yml

# ── Dev startup / shutdown ────────────────────────────────────────────────────

.PHONY: dev-up dev-down dev-restart dev-status

## Start all background services (postgres, redis, worker, smee, grafana, prometheus)
dev-up:
	$(DC) up -d postgres redis worker smee grafana prometheus
	@echo ""
	@echo "Services started. Run 'make dev-check' to verify health."

## Stop all background services
dev-down:
	$(DC) down

## Restart worker + smee (quick fix for webhook / queue issues)
dev-restart:
	$(DC) restart worker smee
	@sleep 3
	@$(MAKE) dev-check

# ── Health check ──────────────────────────────────────────────────────────────

.PHONY: dev-check beta-preflight beta-trigger

## Check health of all dev services + FastAPI
dev-check:
	@echo "=== Service health ==="
	@docker ps --format "  {{.Names}}\t{{.Status}}" | grep docugardener || echo "  (no docugardener containers running)"
	@echo ""
	@echo "=== FastAPI ==="
	@curl -sf http://localhost:8000/health | python3 -m json.tool 2>/dev/null || echo "  FastAPI not reachable on :8000"
	@echo ""
	@echo "=== Redis ==="
	@docker exec docugardener-redis redis-cli ping 2>/dev/null || echo "  Redis not responding"
	@echo ""
	@echo "=== RQ worker queue depth ==="
	@docker exec docugardener-redis redis-cli llen rq:queue:default 2>/dev/null | xargs -I{} echo "  {} jobs queued"
	@echo ""
	@echo "=== Smee last log line ==="
	@docker logs docugardener-smee --tail 3 2>/dev/null || echo "  smee container not running"
	@echo ""
	@echo "=== Stripe CLI (run 'make stripe-forward' in a separate terminal if missing) ==="
	@pgrep -f "stripe listen" > /dev/null 2>&1 && echo "  ✓  stripe listen running" || echo "  ✗  stripe listen not running — run: make stripe-forward"

## Pre-flight check for beta scenario runs — auto-recovers missing components
## Usage: make beta-preflight
beta-preflight:
	@echo "── Beta pre-flight ────────────────────────────────────────────"
	@FAIL=0; \
	\
	echo "[1/4] Docker services..."; \
	MISSING=$$($(DC) ps --services --filter "status=running" 2>/dev/null); \
	for svc in postgres redis worker smee; do \
	  if ! $(DC) ps --services --filter "status=running" 2>/dev/null | grep -q "^$$svc$$"; then \
	    echo "  ⚠  $$svc not running — starting..."; \
	    $(DC) up -d $$svc; \
	  else \
	    echo "  ✓  $$svc"; \
	  fi; \
	done; \
	sleep 2; \
	\
	echo "[2/4] FastAPI on :8000..."; \
	if curl -sf http://localhost:8000/health > /dev/null 2>&1; then \
	  echo "  ✓  FastAPI healthy"; \
	else \
	  echo "  ✗  FastAPI not reachable — start it manually: make dev-api"; \
	  FAIL=1; \
	fi; \
	\
	echo "[3/4] Smee relay..."; \
	if docker logs docugardener-smee --tail 3 2>/dev/null | grep -q "Connected\|POST"; then \
	  echo "  ✓  Smee forwarding webhooks"; \
	else \
	  echo "  ⚠  Smee not forwarding — restarting..."; \
	  $(DC) restart smee; \
	  sleep 2; \
	fi; \
	\
	echo "[4/4] Redis queue..."; \
	DEPTH=$$(docker exec docugardener-redis redis-cli llen rq:queue:default 2>/dev/null || echo "?"); \
	echo "  ✓  Queue depth: $$DEPTH jobs"; \
	\
	echo "[5/5] Stripe CLI webhook forward..."; \
	if pgrep -f "stripe listen" > /dev/null 2>&1; then \
	  echo "  ✓  stripe listen running"; \
	else \
	  echo "  ⚠  stripe listen not running — billing webhooks won't fire locally"; \
	  echo "     Start it with: make stripe-forward"; \
	fi; \
	\
	echo "───────────────────────────────────────────────────────────────"; \
	if [ "$$FAIL" = "1" ]; then \
	  echo "  ✗  Pre-flight FAILED — fix issues above before running scenarios"; \
	  exit 1; \
	else \
	  echo "  ✓  All systems go — ready to run beta scenarios"; \
	fi

## Re-trigger webhook for a PR that was missed (e.g. smee was down)
## Usage: make beta-trigger REPO=alexeykopachev/docugardener-test PR=7
beta-trigger:
	@if [ -z "$(REPO)" ] || [ -z "$(PR)" ]; then \
	  echo "Usage: make beta-trigger REPO=owner/repo PR=<number>"; \
	  exit 1; \
	fi
	@echo "Re-triggering analysis for $(REPO) PR #$(PR)..."
	@gh api repos/$(REPO)/hooks 2>/dev/null | python3 -c "import sys,json; hooks=json.load(sys.stdin); [print(h['id']) for h in hooks if 'smee.io' in h.get('config',{}).get('url','') or 'docugardener' in h.get('config',{}).get('url','')]" | head -1 | xargs -I{} sh -c '\
	  DELIVERIES=$$(gh api repos/$(REPO)/hooks/{}/deliveries 2>/dev/null); \
	  DELIVERY_ID=$$(echo "$$DELIVERIES" | python3 -c "import sys,json; d=json.load(sys.stdin); prs=[x for x in d if \"pull_request\" in x.get(\"event\",\"\")]; print(prs[0][\"id\"] if prs else \"\")" 2>/dev/null); \
	  if [ -n "$$DELIVERY_ID" ]; then \
	    gh api repos/$(REPO)/hooks/{}/deliveries/$$DELIVERY_ID/attempts -X POST 2>/dev/null && echo "  ✓  Webhook redelivered (delivery $$DELIVERY_ID)"; \
	  else \
	    echo "  ✗  No pull_request webhook delivery found to redeliver"; \
	  fi \
	'

# ── Stripe CLI ───────────────────────────────────────────────────────────────
# Forwards Stripe test-mode events to the local FastAPI webhook endpoint.
# The CLI automatically updates STRIPE_WEBHOOK_SECRET in the terminal output —
# copy the "whsec_..." value into .env if it differs from the current one.
#
# Run in a separate terminal alongside `make dev-api`.
# Stripe Dashboard → Developers → Webhooks → "Test in a local environment"
# documents the same flow.

.PHONY: stripe-forward stripe-trigger-checkout

## Forward Stripe test webhooks to local FastAPI (run in a separate terminal)
stripe-forward:
	stripe listen \
	  --forward-to http://localhost:8000/webhooks/stripe \
	  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed

## Manually trigger a test checkout.session.completed event (for smoke testing)
stripe-trigger-checkout:
	stripe trigger checkout.session.completed

# ── Logs ─────────────────────────────────────────────────────────────────────

.PHONY: logs-worker logs-api logs-smee

logs-worker:
	docker logs docugardener-worker -f --tail 50

logs-api:
	tail -f /private/tmp/docugardener-api.log

logs-smee:
	docker logs docugardener-smee -f --tail 20
