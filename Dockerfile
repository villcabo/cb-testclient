# Dockerfile reducido a dos etapas
FROM node:20-alpine AS build

# Instalar pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copiar archivos de dependencias y fuente
COPY package.json pnpm-lock.yaml ./
COPY . .

# Instalar dependencias y compilar
RUN pnpm install --frozen-lockfile --production=false \
    && pnpm build

# Etapa final: solo artefactos necesarios
FROM node:20-alpine AS runner

WORKDIR /app

# Crear usuario no root
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copiar artefactos de build
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Asignar permisos
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
