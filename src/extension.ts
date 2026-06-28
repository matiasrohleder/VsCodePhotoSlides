import * as vscode from 'vscode';
import { PhotoSlidesViewProvider } from './PhotoSlidesViewProvider';
import { SlideshowCoordinator } from './SlideshowCoordinator';

export function activate(context: vscode.ExtensionContext): void {
  const coordinator = new SlideshowCoordinator();

  const explorerProvider = new PhotoSlidesViewProvider(
    context.extensionUri, context, 'explorer', coordinator,
  );
  const scmProvider = new PhotoSlidesViewProvider(
    context.extensionUri, context, 'scm', coordinator,
  );
  const debugProvider = new PhotoSlidesViewProvider(
    context.extensionUri, context, 'debug', coordinator,
  );

  coordinator.register('explorer', explorerProvider);
  coordinator.register('scm', scmProvider);
  coordinator.register('debug', debugProvider);

  const allProviders = [explorerProvider, scmProvider, debugProvider];

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'photoSlides.view', explorerProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      'photoSlides.scmView', scmProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      'photoSlides.debugView', debugProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('photoSlides.selectFolder', () =>
      explorerProvider.promptSelectFolder(),
    ),
    vscode.commands.registerCommand('photoSlides.openSettings', () =>
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:mrohleder.photo-slides',
      ),
    ),
    vscode.commands.registerCommand('photoSlides.refresh', () =>
      allProviders.forEach((p) => void p.refresh()),
    ),
    vscode.commands.registerCommand('photoSlides.next', () =>
      allProviders.forEach((p) => p.sendCommand('next')),
    ),
    vscode.commands.registerCommand('photoSlides.previous', () =>
      allProviders.forEach((p) => p.sendCommand('previous')),
    ),
    vscode.commands.registerCommand('photoSlides.playPause', () =>
      allProviders.forEach((p) => p.sendCommand('playPause')),
    ),
    vscode.commands.registerCommand('photoSlides.toggleShuffle', () =>
      allProviders.forEach((p) => p.sendCommand('toggleShuffle')),
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('photoSlides')) {
        return;
      }
      const needsReload =
        e.affectsConfiguration('photoSlides.folder') ||
        e.affectsConfiguration('photoSlides.recursive') ||
        e.affectsConfiguration('photoSlides.fileTypes') ||
        e.affectsConfiguration('photoSlides.sortOrder') ||
        e.affectsConfiguration('photoSlides.panels');
      if (needsReload) {
        allProviders.forEach((p) => p.reloadFolder());
      } else {
        allProviders.forEach((p) => p.pushConfig());
      }
    }),
  );
}

export function deactivate(): void {
  // Los disposables se manejan vía context.subscriptions.
}
