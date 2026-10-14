import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

for (const way of ['botão Voltar', 'histórico do navegador']) {
test(`volta ao mesmo livro, página e filtros pelo ${way}`, async ({ page }) => {
  await page.goto('/?page=3&lng=por&status=lendo');
  const card = page.locator('[data-book-id="19"]');
  await card.scrollIntoViewIfNeeded();
  const top = await card.evaluate((element) => element.getBoundingClientRect().top);
  await card.click();
  await expect(page.getByRole('heading', { name: 'Ficha do livro' })).toBeVisible();
  if (way === 'botão Voltar') await page.getByRole('link', { name: 'Voltar', exact: true }).click();
  else await page.goBack();
  await expect(page).toHaveURL(/page=3/);
  await expect(page).toHaveURL(/lng=por/);
  await expect(card).toBeFocused();
  await expect.poll(() => card.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(top, 0);
});
}

test('rolar e carregar capas mantém a altura e a posição das fileiras', async ({ page }, info) => {
  await page.addInitScript(() => {
    const shifts: number[] = [];
    const gaps: number[] = [];
    let previous = 0;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) shifts.push((entry as PerformanceEntry & { value: number }).value);
      }
    }).observe({ type: 'layout-shift', buffered: true });
    function frame(now: number) { if (previous) gaps.push(now - previous); previous = now; requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    Object.assign(window, { scrollMetrics: { shifts, gaps } });
  });
  await page.goto('/');
  await expect(page.locator('[data-book-id]')).toHaveCount(28);
  const before = await page.locator('[data-book-id]').evaluateAll((elements) => elements.map((element) => ({
    top: element.getBoundingClientRect().top + window.scrollY, height: element.getBoundingClientRect().height,
  })));
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => {
    const data = (window as unknown as { scrollMetrics: { shifts: number[]; gaps: number[] } }).scrollMetrics;
    data.shifts.length = 0; data.gaps.length = 0;
  });
  for (let y = 0; y < height; y += 250) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(250);
  await expect.poll(() => page.evaluate(() => Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0).length)).toBe(0);
  const after = await page.locator('[data-book-id]').evaluateAll((elements) => elements.map((element) => ({
    top: element.getBoundingClientRect().top + window.scrollY, height: element.getBoundingClientRect().height,
  })));
  for (let i = 0; i < before.length; i++) {
    expect(Math.abs(after[i].top - before[i].top)).toBeLessThan(1);
    expect(Math.abs(after[i].height - before[i].height)).toBeLessThan(1);
  }
  const metrics = await page.evaluate(() => {
    const data = (window as unknown as { scrollMetrics: { shifts: number[]; gaps: number[] } }).scrollMetrics;
    const sorted = data.gaps.slice().sort((a, b) => a - b);
    return { layoutShiftSum: data.shifts.reduce((sum, value) => sum + value, 0), frameGapP95Ms: sorted[Math.floor(sorted.length * 0.95)], maxFrameGapMs: Math.max(...sorted), images: performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/_next/image') || entry.name.includes('/cover.svg')).length };
  });
  expect(metrics.images).toBeGreaterThan(0);
  const metricsPath = info.outputPath('scroll-metrics.json');
  await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  await info.attach('scroll-metrics.json', { path: metricsPath, contentType: 'application/json' });
});

test('salva e remove uma estante com os filtros atuais', async ({ page }, info) => {
  await page.route('**/api/saved-searches*', async (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
    const body = route.request().postDataJSON();
    expect(body.query).toBe('lng=por&status=lendo');
    return route.fulfill({ status: 201, json: { id: 1, name: body.name, query: body.query } });
  });
  await page.goto('/?page=3&lng=por&status=lendo');
  await page.getByRole('button', { name: 'Salvar busca como estante' }).click();
  await page.getByLabel('Nome da estante').fill('Leituras em português');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Leituras em português' })).toHaveAttribute('href', '/?lng=por&status=lendo');
  await page.screenshot({ path: info.outputPath('saved-search.png') });
  await page.getByRole('button', { name: 'Remover estante Leituras em português' }).click();
  await expect(page.getByRole('link', { name: 'Leituras em português' })).toHaveCount(0);
});

test('exporta arquivo e informa falha sem perder a tela', async ({ page }) => {
  await page.route('**/api/reading/export*', (route) => route.fulfill({ contentType: 'text/csv', body: '\uFEFFTítulo\r\nLivro\r\n' }));
  await page.goto('/');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('meus-dados-de-leitura.csv');
  await page.route('**/api/reading/export*', (route) => route.fulfill({ status: 401, json: { error: 'Sessão expirada.' } }));
  await page.getByRole('button', { name: 'Exportar Markdown' }).click();
  await expect(page.getByRole('alert')).toHaveText('Sessão expirada.');
});
