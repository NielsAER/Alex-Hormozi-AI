# --- Stage 1: bouw de React (Vite) frontend ---
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Stage 2: productie-image met de Express-server ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Alleen productie-dependencies van de backend installeren.
COPY package*.json ./
RUN npm ci --omit=dev

# Backend-code, voorbeelddocumenten en de gebouwde frontend.
COPY server/ ./server/
COPY knowledge/ ./knowledge/
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3001
CMD ["node", "server/index.js"]
