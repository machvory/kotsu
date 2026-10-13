# Two stages: build the web app with Node, serve it and the API from Python.
# One image, one Cloud Run service, one URL — nothing to keep in sync.

FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# ffmpeg measures video length and pulls the still frame a knack card shows.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY server/ ./server/
COPY --from=web /web/dist ./web/dist

# Cloud Run sets PORT. Video analysis holds a request open for ~40s, so the
# worker needs a timeout well above the default.
ENV PORT=8080
CMD exec uvicorn server.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 75
