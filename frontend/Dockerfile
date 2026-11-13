# Production image: the built app served by nginx on port 8080.
# Build from frontend/:
#   docker build --build-arg VITE_OWNER_USERNAME=<username> -t critic-frontend .

FROM node:24.22.3-slim AS build
WORKDIR /app

# No default: vite.config.ts fails the build when it's missing.
ARG VITE_OWNER_USERNAME
ENV VITE_OWNER_USERNAME=$VITE_OWNER_USERNAME

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginxinc/nginx-unprivileged:1.30.6-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# Outside conf.d, so nginx only loads it where default.conf includes it.
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
