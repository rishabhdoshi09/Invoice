# ─── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
# Disable source maps in production to reduce bundle size
ENV GENERATE_SOURCEMAP=false
RUN npm run build

# ─── Stage 2: Backend production image ────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install production deps only
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/ .

# Copy built frontend to the path Express expects:
# backend/index.js: path.resolve(__dirname, '..', 'frontend', 'build')
# __dirname = /app  →  ../frontend/build  =  /frontend/build
COPY --from=frontend-builder /frontend/build /frontend/build

EXPOSE 8001

# Run pending migrations then start the server.
# Migrations are idempotent — safe to run on every container start.
CMD ["sh", "-c", "npx sequelize-cli db:migrate && node index.js"]
