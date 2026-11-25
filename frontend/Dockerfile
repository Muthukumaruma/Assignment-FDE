# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Public (non-secret) Google OAuth client id is baked in at build time.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npx vite build

# ---- runtime: static files + reverse proxy to the API ----
FROM nginx:1.27-alpine
# Rendered to /etc/nginx/conf.d/default.conf at container start (envsubst).
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=backend:4000 \
    PROXY_SECRET=""
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
