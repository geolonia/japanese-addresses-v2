#!/usr/bin/env node

import main from './processes/03_make_rsdt.js';

main(process.argv)
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
