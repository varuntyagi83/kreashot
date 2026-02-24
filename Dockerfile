# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install Python + Pillow dependencies (needed at build time for any scripts)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-pillow \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install Node dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# NEXT_PUBLIC_* vars must be present at build time — they get baked into the client bundle
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Copy source and build
COPY . .
RUN npm run build

# ─── Stage 2: Production runner ───────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install Python + Pillow + fonts for the compositing script at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pillow \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Create symlink so 'python3' is callable as expected by spawn()
RUN ln -sf /usr/bin/python3 /usr/local/bin/python3

# Copy built app from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy the Python compositing script
COPY --from=builder /app/scripts/composite_final_asset.py ./scripts/composite_final_asset.py

EXPOSE 8080

CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
