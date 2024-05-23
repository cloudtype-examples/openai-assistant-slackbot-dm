FROM node:18 as build

RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    git curl bash build-essential libssl-dev ca-certificates imagemagick && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app


COPY ./package*.json ./yarn*.lock ./

ENV NODE_ENV='production'
RUN echo "use npmjs.org registry"
RUN npm install

COPY ./ ./


FROM node:18
LABEL org.opencontainers.image.source https://github.com/cloudtype-examples/openai-assistant-slackbot.git

RUN apt-get update
RUN apt-get install -y --no-install-recommends \
    git curl bash build-essential libssl-dev ca-certificates imagemagick && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/ ./
RUN chown -f node:node /app && rm -rf .git*

ENV NODE_ENV='production'

USER node

EXPOSE 3000

CMD npm start