#!/usr/bin/env node

import main from './processes/04_make_chiban.js';

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
