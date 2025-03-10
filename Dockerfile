# Build stage with memory optimization
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with optimizations to reduce memory usage
RUN npm config set fetch-retry-maxtimeout 60000 \
    && npm config set fetch-timeout 60000 \
    && npm config set network-timeout 60000 \
    && npm config set production false \
    && NODE_OPTIONS="--max-old-space-size=2048" npm ci --no-audit --prefer-offline

# Copy source code
COPY . .

# Generate Prisma client if schema exists (with memory optimization)
RUN if [ -f prisma/schema.prisma ]; then \
      NODE_OPTIONS="--max-old-space-size=2048" npx prisma generate; \
    else \
      echo "No Prisma schema found, skipping generation"; \
    fi

# Build TypeScript code (with memory optimization)
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Production stage with memory optimization
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies with optimizations
RUN npm config set fetch-retry-maxtimeout 60000 \
    && npm config set fetch-timeout 60000 \
    && npm config set network-timeout 60000 \
    && NODE_OPTIONS="--max-old-space-size=2048" npm ci --only=production --no-audit --prefer-offline

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production

# Expose health check port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]