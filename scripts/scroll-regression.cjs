const { _electron: electron, expect } = require('playwright/test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

const packaged = process.argv.includes('--packaged')
const version = require('../package.json').version
const executablePath = packaged
  ? process.env.NBE_PACKAGED_APP ?? path.join(__dirname, `../../deliverables/NoteBlockEditor-${version}/win-unpacked/NoteBlock Editor.exe`)
  : require('electron')

async function run() {
  const app = await electron.launch({ executablePath, args: packaged ? [] : [path.join(__dirname, '..')], env: { ...process.env, NBE_SMOKE_TEST: '1' } })
  const errors = []
  let page
  try {
    page = await app.firstWindow()
    page.on('pageerror', error => errors.push(error.message))
    await app.evaluate(({ BrowserWindow }) => { for (const win of BrowserWindow.getAllWindows()) win.showInactive() })
    await page.getByTestId('playlist-grid').waitFor()
    const scroller = page.locator('.playlist-scroll')
    const metrics = await scroller.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: el.clientWidth, height: el.clientHeight, scrollWidth: el.scrollWidth, outerHeight: el.offsetHeight }
    })
    assert.ok(metrics.scrollWidth > metrics.width, 'Demo must have a horizontal scrollbar')
    const thumb = metrics.width * metrics.width / metrics.scrollWidth
    const y = metrics.y + metrics.height + (metrics.outerHeight - metrics.height) / 2
    await page.mouse.move(metrics.x + thumb / 2, y)
    await page.mouse.down()
    await page.mouse.move(metrics.x + metrics.width - 25, y, { steps: 24 })
    await page.mouse.up()
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft), { timeout: 3000 }).toBeGreaterThan(0)
    await expect(page.getByTestId('playlist-grid')).toBeVisible()
    assert.deepEqual(errors, [], 'Dragging scrollbar must not crash React')
    // Exercise subsequent updates as well as the first eager state update.
    for (const fraction of [0.1, 0.8, 0.3, 1, 0]) {
      await scroller.evaluate((el, fraction) => { el.scrollLeft = (el.scrollWidth - el.clientWidth) * fraction; el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction }, fraction)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expect(page.getByTestId('playlist-grid')).toBeVisible()
    }
    await page.getByLabel('编排缩放', { exact: true }).fill('24')
    await page.getByTestId('pattern-p1').dblclick()
    await page.getByRole('button', { name: '最大化或还原', exact: true }).click()
    await page.getByRole('button', { name: '钢琴卷帘', exact: true }).click()
    for (const fraction of [0.2, 1, 0.5, 0]) {
      await page.locator('.note-scroll').evaluate((el, fraction) => { el.scrollLeft = (el.scrollWidth - el.clientWidth) * fraction; el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction }, fraction)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await expect(page.getByTestId('note-grid')).toBeVisible()
    }
    assert.deepEqual(errors, [])
    const result = { version, packaged, passed: true, errors, checks: ['native horizontal scrollbar drag', 'repeated horizontal and vertical scroll', 'zoom after scrolling', 'Pattern piano scroll'] }
    await fs.mkdir(path.join(__dirname, '../test-results'), { recursive: true })
    await fs.writeFile(path.join(__dirname, `../test-results/scroll-${packaged ? 'packaged' : 'source'}.json`), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    await fs.mkdir(path.join(__dirname, '../test-results'), { recursive: true })
    await fs.writeFile(path.join(__dirname, '../test-results/scroll-failure.json'), JSON.stringify({ error: String(error), rendererErrors: errors }, null, 2))
    if (page) await page.screenshot({ path: path.join(__dirname, '../test-results/scroll-failure.png') }).catch(() => {})
    throw error
  } finally { await app.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
