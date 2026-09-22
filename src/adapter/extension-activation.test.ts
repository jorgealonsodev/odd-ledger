import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('activates the odd-ledger extension', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension, 'extension jorgealonsodev.odd-ledger was not found by the test host');

    await extension!.activate();

    assert.equal(extension!.isActive, true);
  });

  test('registers the refresh command', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('oddLedger.refresh'), 'oddLedger.refresh was not registered');
  });

  test('registers the openFeature command (T10)', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension);
    await extension!.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('oddLedger.openFeature'), 'oddLedger.openFeature was not registered');
  });
});
