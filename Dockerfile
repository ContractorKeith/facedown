FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS production
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Keep only Bun and its linked runtime libraries, without an OS package manager.
FROM oven/bun:1.4.3@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS runtime
RUN mkdir -p /runtime/data /runtime/tmp /runtime/usr/local/bin \
    && cp /usr/local/bin/bun /runtime/usr/local/bin/ \
    && ldd /usr/local/bin/bun | awk '/=> \// {print $3} /^[[:space:]]*\// {print $1}' | xargs -r cp --parents -t /runtime \
    && chown 1000:1000 /runtime/data && chmod 1777 /runtime/tmp

FROM scratch
WORKDIR /app
COPY --from=runtime /runtime/ /
COPY --from=runtime /etc/passwd /etc/passwd
COPY --from=runtime /etc/group /etc/group
COPY --from=runtime /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=production /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY src ./src
COPY package.json ./
ENV FACEDOWN_DB=/data/facedown.db
ENV PORT=8080
ENV HOST=0.0.0.0
ENV FACEDOWN_TRUST_PROXY=1
ENV PATH=/usr/local/bin
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=2s --start-period=5s --retries=3 CMD ["bun", "-e", "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz', {signal: AbortSignal.timeout(1500)}); process.exit(r.ok ? 0 : 1); } catch { process.exit(1); }"]
CMD ["bun", "src/server/main.ts"]
