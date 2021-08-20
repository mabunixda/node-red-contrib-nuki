#!/bin/bash

docker run -u root --rm -it --network host -v "$PWD:/src" --entrypoint /src/scripts/docker-run.sh nodered/node-red:latest-14-minimal
