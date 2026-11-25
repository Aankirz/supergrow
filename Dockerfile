FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY specs ./specs
COPY rules ./rules
COPY desktop ./desktop
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.ts"]
