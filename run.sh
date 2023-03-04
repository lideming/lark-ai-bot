#!/bin/sh

exec deno run \
    --allow-net --allow-read --allow-write=data --allow-env \
    src/app.ts
