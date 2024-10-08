#!/bin/bash -e

aws s3 sync \
  --cache-control="max-age=86400, public" \
  --exclude="*" \
  --include="*.txt" \
  --content-type="text/plain; charset=utf-8" \
  ./out/ s3://japanese-addresses-v2.geoloniamaps.com/
aws s3 sync \
  --cache-control="max-age=86400, public" \
  --exclude="*" \
  --include="*.json" \
  --content-type="application/json; charset=utf-8" \
  ./out/ s3://japanese-addresses-v2.geoloniamaps.com/
