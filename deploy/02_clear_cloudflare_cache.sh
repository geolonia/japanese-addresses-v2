#!/bin/bash -e

curl  --request POST \
      --url https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache \
      --header 'Content-Type: application/json' \
      --header "Authorization: Bearer ${CLOUDFLARE_TOKEN}" \
      --data '{
        "files": [
          "https://japanese-addresses-v2.geoloniamaps.com/api/ja.json"
        ]
      }'
