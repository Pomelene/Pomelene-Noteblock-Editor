/** Existing editor suites explicitly opt into the shipped example from the start page. */
module.exports = async function enterWorkspace(page) {
  await page.waitForSelector(".studio");
  const example = page.getByRole("button", {
    name: /查看示例工程|继续编辑当前工程/,
  });
  if (await example.isVisible()) await example.click();
  await page.locator(".menubar").waitFor();
};
