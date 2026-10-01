FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json server.js index.html style.css script.js manus-routes.json ./
COPY assets/logo.png ./assets/logo.png
EXPOSE 3000
USER node
CMD ["node", "server.js"]
