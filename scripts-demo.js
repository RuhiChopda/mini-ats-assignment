// Records a short demo video of the running app: `PORT=3000 npm start` then `node scripts-demo.js`
const { chromium } = require('playwright'); // npm i -D playwright
const url = process.env.URL || 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, recordVideo: { dir: 'docs/video', size: { width: 1280, height: 760 } } });
  const p = await ctx.newPage(); const w = (ms) => p.waitForTimeout(ms);
  await p.goto(url); await p.waitForSelector('.kpi'); await w(2500);
  await p.click('[data-view=pipeline]'); await w(2000);
  const card = p.locator('.kcard').first(), target = p.locator('.col[data-stage=Interview]');
  await card.dragTo(target); await w(1800);
  await p.click('[data-view=candidates]'); await w(1000);
  await p.type('#q', 'react', { delay: 150 }); await w(1500);
  await p.selectOption('#fExp', '5'); await w(1500);
  await p.click('#clearFilters'); await w(800);
  await p.click('#addBtn'); await w(600);
  await p.fill('[name=name]', 'Demo Candidate'); await p.fill('[name=email]', `demo${Date.now()}@example.com`);
  await p.fill('[name=position]', 'Frontend Engineer'); await p.fill('[name=skills]', 'React, CSS');
  await p.fill('[name=experience_years]', '4'); await w(1000);
  await p.click('#formSave'); await w(1500);
  await p.click('#rows tr >> nth=0'); await p.waitForSelector('.stage-pick'); await w(1000);
  await p.click('.stage-pick button:nth-child(3)'); await w(1200);
  await p.fill('#noteBody', 'Great first call!'); await p.keyboard.press('Enter'); await w(1500);
  await p.click('#dClose'); await p.click('[data-view=dashboard]'); await w(3000);
  await ctx.close(); await b.close(); console.log('Video saved in docs/video/');
})();
