/**
 * Generates a throwaway demo repository for screenshots, GIFs, and manual
 * testing. The logic ships in the CLI as `branchit demo`; this wrapper keeps
 * `npm run demo:repo [targetDir]` working from a checkout.
 */
import { createDemoRepo } from "../src/commands/demo.js";

createDemoRepo(process.argv[2])
  .then((dir) => {
    process.stdout.write(`Demo repository ready:\n  ${dir}\n\nTry it:\n  cd ${dir} && branchit\n`);
  })
  .catch((err) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  });
