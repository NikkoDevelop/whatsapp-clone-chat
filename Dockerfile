FROM node:16

WORKDIR /usr/src/aa-chat-service

COPY package.json ./
COPY yarn.lock ./

RUN yarn install --production=true && yarn add typescript -g

COPY . .

RUN NODE_OPTIONS="--max-old-space-size=1024" yarn build

EXPOSE 3500

CMD ["yarn", "start"]