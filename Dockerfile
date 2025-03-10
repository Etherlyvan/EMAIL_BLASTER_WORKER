# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client if schema exists
RUN if [ -f prisma/schema.prisma ]; then \
      npx prisma generate; \
    else \
      echo "No Prisma schema found, skipping generation"; \
    fi

# Build TypeScript code using npx for explicit path resolution
RUN npx tsc

# Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production

# Expose health check port
EXPOSE 3000

# Run the application
CMD ["node", "dist/index.js"]