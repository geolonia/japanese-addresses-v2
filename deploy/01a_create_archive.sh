#!/bin/bash -e

cd "$(dirname "$0")"/../out
tar -cf "api.tar" ./api
zstd -T0 -19 --rm -z "api.tar"
