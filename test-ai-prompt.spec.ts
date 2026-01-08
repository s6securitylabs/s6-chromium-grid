import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080';
const AUTH_USER = 'admin';
const AUTH_PASS = 'admin';

test.describe('AI Prompt Customization Feature', () => {
  test.use({
    httpCredentials: {
      username: AUTH_USER,
      password: AUTH_PASS,
    },
  });

  test('should load dashboard with v1.4.8 version badge', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('.version-badge', { timeout: 10000 });
    const version = await page.locator('.version-badge').textContent();
    expect(version?.trim()).toBe('v1.4.8');
  });

  test('should have AI Prompt Template section in Settings', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Open Settings modal
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active', { timeout: 5000 });
    
    // Find AI Prompt Template section
    const aiPromptHeader = page.locator('.settings-section-header:has-text("🤖 AI Prompt Template")');
    await expect(aiPromptHeader).toBeVisible();
    
    // Section should start collapsed
    const sectionContent = page.locator('.settings-section-header:has-text("🤖 AI Prompt Template")').locator('..').locator('.settings-section-content');
    await expect(sectionContent).toHaveClass(/collapsed/);
  });

  test('should expand/collapse AI Prompt section (accordion behavior)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    
    const aiPromptHeader = page.locator('.settings-section-header:has-text("🤖 AI Prompt Template")');
    const sectionContent = page.locator('.settings-section-header:has-text("🤖 AI Prompt Template")').locator('..').locator('.settings-section-content');
    
    // Click to expand
    await aiPromptHeader.click();
    await expect(sectionContent).not.toHaveClass(/collapsed/);
    
    // Click again to collapse
    await aiPromptHeader.click();
    await expect(sectionContent).toHaveClass(/collapsed/);
  });

  test('should load default AI prompt template', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    
    // Expand AI Prompt section
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const textarea = page.locator('#ai-prompt-textarea');
    await expect(textarea).toBeVisible();
    
    const content = await textarea.inputValue();
    expect(content).toContain('I need you to write Playwright tests');
    expect(content).toContain('{ENDPOINT}');
    expect(content).toContain('{INSTANCE_ID}');
    expect(content).toContain('connectOverCDP');
  });

  test('should save and persist custom AI prompt template', async ({ page, context }) => {
    await page.goto(BASE_URL);
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    
    // Expand AI Prompt section
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const textarea = page.locator('#ai-prompt-textarea');
    const customPrompt = 'Custom test prompt with {ENDPOINT} and {HOST}:{PORT} for instance {INSTANCE_ID}';
    
    // Clear and enter custom prompt
    await textarea.fill(customPrompt);
    
    // Save settings
    await page.click('button:has-text("Save All Settings")');
    await page.waitForSelector('.toast.success', { timeout: 5000 });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Open settings again and verify persistence
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const savedContent = await textarea.inputValue();
    expect(savedContent).toBe(customPrompt);
  });

  test.skip('should reset AI prompt to default', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Set a custom prompt first
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const textarea = page.locator('#ai-prompt-textarea');
    await textarea.fill('Custom prompt that should be reset');
    await page.click('button:has-text("Save All Settings")');
    await page.waitForSelector('.toast.success');
    
    // Now reset (need to reopen Settings after save closes it)
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    page.on('dialog', dialog => dialog.accept()); // Accept confirm dialog
    await page.click('button:has-text("🔄 Reset to Default")');
    await page.waitForSelector('.toast.success:has-text("reset to default")');
    
    const resetContent = await textarea.inputValue();
    expect(resetContent).toContain('I need you to write Playwright tests');
    expect(resetContent).toContain('{ENDPOINT}');
  });

  test.skip('should replace placeholders in copied AI prompt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);
    
    // Set a simple custom template with all placeholders
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const testTemplate = 'Endpoint: {ENDPOINT}, Host: {HOST}, Port: {PORT}, Instance: {INSTANCE_ID}';
    await page.locator('#ai-prompt-textarea').fill(testTemplate);
    await page.click('button:has-text("Save All Settings")');
    await page.waitForSelector('.toast.success');
    
    // Close settings
    await page.locator('#settings-modal button.close-btn').click();
    await page.waitForSelector('#settings-modal:not(.active)');
    
    // Copy AI prompt for instance 1 (CDP port 9222)
    await page.locator('[onclick*="copyAIPrompt(1, 9222)"]').click();
    await page.waitForSelector('.toast.success:has-text("copied")');
    
    // Read clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    
    // Verify placeholders were replaced
    expect(clipboardText).toContain('Endpoint: ws://localhost:9222');
    expect(clipboardText).toContain('Host: localhost');
    expect(clipboardText).toContain('Port: 9222');
    expect(clipboardText).toContain('Instance: 1');
    expect(clipboardText).not.toContain('{ENDPOINT}');
    expect(clipboardText).not.toContain('{HOST}');
    expect(clipboardText).not.toContain('{PORT}');
    expect(clipboardText).not.toContain('{INSTANCE_ID}');
  });

  test('should show available placeholders documentation', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    // Check for placeholder documentation
    const placeholderDocs = page.locator('text=Available Placeholders:');
    await expect(placeholderDocs).toBeVisible();
    
    await expect(page.locator('code:has-text("{ENDPOINT}")')).toBeVisible();
    await expect(page.locator('code:has-text("{HOST}")')).toBeVisible();
    await expect(page.locator('code:has-text("{PORT}")')).toBeVisible();
    await expect(page.locator('code:has-text("{INSTANCE_ID}")')).toBeVisible();
  });

  test('should handle empty custom prompt gracefully', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const textarea = page.locator('#ai-prompt-textarea');
    
    // Clear textarea (empty prompt)
    await textarea.fill('');
    await page.click('button:has-text("Save All Settings")');
    await page.waitForSelector('.toast.success');
    
    // Reload and verify it falls back to default
    await page.reload();
    await page.click('button:has-text("⚙️ Settings")');
    await page.waitForSelector('#settings-modal.active');
    await page.click('.settings-section-header:has-text("🤖 AI Prompt Template")');
    
    const content = await textarea.inputValue();
    expect(content).toContain('I need you to write Playwright tests'); // Default
  });
});
