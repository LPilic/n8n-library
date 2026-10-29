# Node 22 for security fixes (Node 20 is EOL since Apr 2026; no fix for CVE-2026-111497).
# Patch pinned for reproducible builds — bump deliberately when security releases land.
FROM node:22.23.4-alpine

# Build Vue frontend
WORKDIR /app/frontend
# @n8n/design-system pulls an optional native dep (isolated-vm via expression-runtime)
# that needs node-gyp toolchain to build on alpine
RUN apk add --no-cache python3 make g++
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Install backend dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy backend + frontend sources
COPY . .

# Serve the React build by default. Set FRONTEND=legacy to use public/ instead.
ENV FRONTEND=react

EXPOSE 3100
CMD ["sh", "-c", "node migrate.js && node server.js"]
