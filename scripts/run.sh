#!/bin/bash

podman run -u root --rm -it --network host -v "$PWD:/src" --entrypoint /src/scripts/docker-run.sh docker.io/nodered/node-red:latest-14-minimal
