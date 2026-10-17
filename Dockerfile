# Steplight: server + Studio + headless Chromium (recording, replay, PDF and video exports).
# The Playwright image ships Node and a Chromium that matches the playwright npm version.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

ENV HOST=0.0.0.0 \
    PORT=4100 \
    STEPLIGHT_DATA=/app/data
VOLUME ["/app/data"]
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "const b=new URL(process.env.STEPLIGHT_BASE_URL||'http://x').pathname.replace(/\/+$/,'');fetch('http://127.0.0.1:'+process.env.PORT+b+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["npx", "tsx", "src/server/index.ts"]
