import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { execSync } from 'child_process';

const CLI_VERSION = 'v0.3.3';
const GITHUB_REPO = 'Juanpa-Reyest/dbflow-validator';
const BINARY_NAME = 'dbflow-validator';

/**
 * Resolves the path to the dbflow-validator binary.
 * Priority:
 *  1. User-configured path in settings
 *  2. Binary found in system PATH
 *  3. Binary previously downloaded to globalStoragePath
 *  4. AUTO-DOWNLOAD: silently downloads from GitHub Releases (no prompt)
 *
 * This function NEVER asks the user anything. If the binary is missing,
 * it downloads it automatically and silently.
 */
export async function resolveBinary(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): Promise<string> {
  // 1. Check user setting
  const config = vscode.workspace.getConfiguration('dbflowValidator');
  const configuredPath = config.get<string>('binaryPath');
  if (configuredPath && fs.existsSync(configuredPath)) {
    outputChannel.appendLine(`Binary: using configured path ${configuredPath}`);
    return configuredPath;
  }

  // 2. Check PATH
  const pathBinary = findInPath();
  if (pathBinary) {
    outputChannel.appendLine(`Binary: found in PATH at ${pathBinary}`);
    return pathBinary;
  }

  // 3. Check globalStoragePath (previously downloaded)
  const storedBinary = getStoredBinaryPath(context);
  if (fs.existsSync(storedBinary)) {
    outputChannel.appendLine(`Binary: using cached download at ${storedBinary}`);
    return storedBinary;
  }

  // 4. Auto-download silently — no questions asked
  outputChannel.appendLine(`Binary: not found, downloading ${CLI_VERSION} from GitHub Releases...`);
  const downloaded = await downloadBinary(context, outputChannel);
  outputChannel.appendLine(`Binary: downloaded to ${downloaded}`);
  return downloaded;
}

/**
 * Attempts to find the binary in the system PATH.
 */
function findInPath(): string | undefined {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${command} ${BINARY_NAME}`, { encoding: 'utf-8' }).trim();
    if (result && fs.existsSync(result.split('\n')[0])) {
      return result.split('\n')[0];
    }
  } catch {
    // Binary not found in PATH — this is expected, not an error
  }
  return undefined;
}

/**
 * Returns the expected path for the binary in globalStoragePath.
 */
function getStoredBinaryPath(context: vscode.ExtensionContext): string {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(context.globalStorageUri.fsPath, `${BINARY_NAME}${ext}`);
}

/**
 * Detects the current platform and architecture for GitHub release asset naming.
 */
function detectPlatformAsset(): string {
  const platform = process.platform;
  const arch = process.arch;

  let os: string;
  switch (platform) {
    case 'linux':
      os = 'linux';
      break;
    case 'darwin':
      os = 'darwin';
      break;
    case 'win32':
      os = 'windows';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  let cpu: string;
  switch (arch) {
    case 'x64':
      cpu = 'amd64';
      break;
    case 'arm64':
      cpu = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  const ext = platform === 'win32' ? '.exe' : '';
  return `${BINARY_NAME}-${os}-${cpu}${ext}`;
}

/**
 * Downloads the CLI binary from GitHub Releases and stores it in globalStoragePath.
 * Runs silently with a progress notification (no user interaction required).
 */
async function downloadBinary(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel
): Promise<string> {
  const assetName = detectPlatformAsset();
  const url = `https://github.com/${GITHUB_REPO}/releases/download/${CLI_VERSION}/${assetName}`;

  const storagePath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const destPath = getStoredBinaryPath(context);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `DBFlow Validator: installing CLI ${CLI_VERSION}...`,
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: `Downloading ${assetName}...` });
      outputChannel.appendLine(`Downloading: ${url}`);
      await downloadFile(url, destPath);
      progress.report({ message: 'Done!' });
    }
  );

  // Make executable on unix systems
  if (process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755);
  }

  return destPath;
}

/**
 * Downloads a file from a URL following redirects (GitHub releases redirect to S3).
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (targetUrl: string, redirectCount: number) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      https.get(targetUrl, { headers: { 'User-Agent': 'dbflow-validator-vscode' } }, (response) => {
        // Follow redirects (301, 302, 307)
        if (response.statusCode && [301, 302, 307].includes(response.statusCode) && response.headers.location) {
          request(response.headers.location, redirectCount + 1);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err) => {
          fs.unlinkSync(dest);
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    };
    request(url, 0);
  });
}
