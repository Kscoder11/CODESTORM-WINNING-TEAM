import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

async function verifyNewUI() {
  console.log('🔍 VERIFYING ALL FEATURES IN THE NEW REACT UI...');

  // 1. Fetch Root Page
  const rootRes = await fetch('http://localhost:3000/');
  const rootHtml = await rootRes.text();

  console.log(`✔ Root Status: ${rootRes.status}`);
  console.log(`✔ Root HTML Title: ${rootHtml.match(/<title>(.*?)<\/title>/)?.[1]}`);

  // 2. Locate built assets in dist/assets
  const assetsDir = resolve('frontend', 'dist', 'assets');
  const files = readdirSync(assetsDir);
  const jsFile = files.find(f => f.endsWith('.js'));
  const cssFile = files.find(f => f.endsWith('.css'));

  if (!jsFile) {
    throw new Error('No JS bundle found in dist/assets!');
  }

  const jsContent = readFileSync(resolve(assetsDir, jsFile), 'utf-8');

  // 3. Verify Key Features in Bundle
  const checks = [
    { feature: 'Open Folder / Workspace Switcher', pattern: 'Active Workspace' },
    { feature: 'File Tree Explorer API', pattern: '/api/project/tree' },
    { feature: 'Workspace Open API', pattern: '/api/project/open' },
    { feature: 'File Content Read & Write', pattern: '/api/project/file' },
    { feature: 'Governed AI Prompt Interface', pattern: 'Governed AI Prompt Interface' },
    { feature: 'AI Chat Endpoint Integration', pattern: '/api/chat' },
    { feature: 'Live Hot-Reload Preview Pane', pattern: '/preview/index.html' },
    { feature: 'Responsive Breakpoint Viewports', pattern: 'Mobile (375px)' },
    { feature: 'Human Operator Approval Buttons', pattern: 'Approve & Execute' },
    { feature: 'Zero-Trust Decision Badge', pattern: 'VERDICT:' },
    { feature: 'Quick Scenario Presets', pattern: 'Responsive CSS' },
    { feature: 'TopBar Navigation Studio Link', pattern: 'Workspace IDE' },
  ];

  let passed = 0;
  for (const check of checks) {
    const ok = jsContent.includes(check.pattern);
    if (ok) {
      console.log(`  ✔ PASS: ${check.feature} is present in UI`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: ${check.feature} (missing pattern: "${check.pattern}")`);
    }
  }

  console.log(`\n🎉 SUMMARY: ${passed} / ${checks.length} UI features verified in new React bundle!`);
}

verifyNewUI().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
