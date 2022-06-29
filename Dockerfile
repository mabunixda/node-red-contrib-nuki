FROM docker.io/nodered/node-red:latest-minimal

USER root
COPY docker-package.json /usr/src/node-red/package-patch.json
RUN awk -F':' '{system("npm install "$1)}' package-patch.json \
  && rm /usr/src/node-red/package-patch.json

COPY ./ /usr/src/nuki

## link dev code
RUN npm link /usr/src/nuki

