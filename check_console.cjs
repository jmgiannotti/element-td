const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  
  const result = await page.evaluate(() => {
    if (!window.game) return 'Game not found';
    const tm = window.game.textures;
    return {
      tower_water: tm.exists('tower_water'),
      tower_air: tm.exists('tower_air')
    };
  });
  console.log('TEXTURES:', result);
  
  await page.screenshot({ path: 'puppeteer_test.png' });
  await browser.close();
})();
