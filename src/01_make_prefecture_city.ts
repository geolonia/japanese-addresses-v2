#!/usr/bin/env node

import main from './processes/01_make_prefecture_city.js';

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
