import { performance } from 'node:perf_hooks';
import { findFirstMatchingRule } from '../lib/rules.js';

console.log(`Node ${process.version}; 500 URLs; 30 warm-up URLs; median of 3 runs (ms)`);
for (const ruleCount of [10, 100, 1000]) {
  const rules = Array.from({ length: ruleCount }, (_, i) => ({
    id: `r${i}`,
    pattern: `*://site${i}.test/private/*`,
    enabled: true
  }));
  for (const scenario of ['miss', 'last-hit']) {
    const hostname = scenario === 'miss' ? 'unmatched.test' : `site${ruleCount - 1}.test`;
    const urls = Array.from({ length: 500 }, (_, i) => `https://${hostname}/private/${i}?q=1`);
    for (const url of urls.slice(0, 30)) findFirstMatchingRule(rules, url);
    const samples = [];
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const start = performance.now();
      for (const url of urls) {
        const match = findFirstMatchingRule(rules, url);
        if (scenario === 'miss' ? match !== null : match?.id !== `r${ruleCount - 1}`) {
          throw new Error('Unexpected matching result');
        }
      }
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({
      scenario,
      ruleCount,
      urlCount: urls.length,
      medianMs: Number(samples[1].toFixed(2))
    }));
  }
}
