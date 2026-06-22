import * as vscode from 'vscode';
import { PhotoSlidesViewProvider } from './PhotoSlidesViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PhotoSlidesViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'photoSlides.view',
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('photoSlides.selectFolder', () =>
      provider.promptSelectFolder(),
    ),
    vscode.commands.registerCommand('photoSlides.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mrohleder.photo-slides',
      ),
    ),
    vscode.commands.registerCommand('photoSlides.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('photoSlides.next', () => provider.sendCommand('next')),
    vscode.commands.registerCommand('photoSlides.previous', () =>
      provider.sendCommand('previous'),
    ),
    vscode.commands.registerCommand('photoSlides.playPause', () =>
      provider.sendCommand('playPause'),
    ),
    vscode.commands.registerCommand('photoSlides.toggleShuffle', () =>
      provider.sendCommand('toggleShuffle'),
    ),
  );

  // Reacciona en vivo a cambios de configuración del usuario.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('photoSlides')) {
        return;
      }
      // Cambios que afectan QUÉ archivos se listan → re-leer disco.
      const needsReload =
        e.affectsConfiguration('photoSlides.folder') ||
        e.affectsConfiguration('photoSlides.recursive') ||
        e.affectsConfiguration('photoSlides.fileTypes') ||
        e.affectsConfiguration('photoSlides.sortOrder');
      if (needsReload) {
        provider.reloadFolder();
      } else {
        // Solo cambian parámetros de reproducción → no hace falta tocar disco.
        provider.pushConfig();
      }
    }),
  );
}

export function deactivate(): void {
  // Nada que limpiar: los disposables se manejan vía context.subscriptions.
}
