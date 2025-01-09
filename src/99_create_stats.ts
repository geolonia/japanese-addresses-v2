import main from './processes/99_create_stats.js';

main(process.argv)
  .then(() => {
    process.exit(0);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
