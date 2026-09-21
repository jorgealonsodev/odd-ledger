import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('activates the odd-ledger extension', async () => {
    const extension = vscode.extensions.getExtension('jorgealonsodev.odd-ledger');
    assert.ok(extension, 'extension jorgealonsodev.odd-ledger was not found by the test host');

    await extension!.activate();

    assert.equal(extension!.isActive, true);
  });
});
