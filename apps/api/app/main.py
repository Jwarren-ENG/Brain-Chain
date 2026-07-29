import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import Base, engine
from .routers import (
    admin,
    agents,
    assistant,
    auth,
    brainmap,
    connectors,
    feedback,
    insights,
    interviews,
    knowledge,
)

logging.basicConfig(
    level=logging.INFO,
    format='{"t":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger("brainchain")

settings = get_settings()
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="BrainChain API",
    description="Secure enterprise intelligence platform — permission-aware "
    "knowledge, assistant, agents, and management insights.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    elapsed_ms = int((time.monotonic() - start) * 1000)
    # Structured request log: metadata only, never bodies (see logging policy).
    logger.info(
        "%s %s -> %s in %dms", request.method, request.url.path, response.status_code, elapsed_ms
    )
    response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
    return response


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.environment,
        "deployment_profile": settings.deployment_profile,
        "external_models_allowed": settings.external_models_allowed,
    }


for router in (
    auth.router,
    knowledge.router,
    assistant.router,
    connectors.router,
    feedback.router,
    agents.router,
    insights.router,
    interviews.router,
    interviews.assignments_router,
    admin.router,
    brainmap.router,
):
    app.include_router(router, prefix="/api")
