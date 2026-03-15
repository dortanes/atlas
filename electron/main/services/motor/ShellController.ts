import { exec } from 'node:child_process'
import { createLogger } from '@electron/utils/logger'

const log = createLogger('ShellController')

/** Max execution time for a command (ms) */
import { getConfig } from '@electron/utils/config'

/** Result of a PowerShell command execution. */
export interface ShellResult {
  /** Standard output from the command */
  stdout: string
  /** Standard error output from the command */
  stderr: string
  /** Process exit code (0 = success) */
  exitCode: number
}

/**
 * ShellController — executes PowerShell commands on the host OS.
 *
 * Used by the agent to perform reliable system operations:
 * file management, app launch/close, window manipulation, etc.
 *
 * All commands run in PowerShell with UTF-8 encoding and a 30s timeout.
 */
export class ShellController {
  /**
   * Execute a PowerShell command and return its output.
   */
  async exec(command: string): Promise<ShellResult> {
    // Patch hardcoded user folder paths — LLMs often use $HOME\Desktop etc.
    // which breaks when OneDrive redirects these folders.
    const patched = this.patchUserFolderPaths(command)
    log.info(`exec: ${patched}`)

    return new Promise((resolve) => {
      exec(
        patched,
        {
          shell: 'powershell.exe',
          timeout: getConfig().agent.commandTimeout,
          encoding: 'utf-8',
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const exitCode = error?.code ?? (error ? 1 : 0)
          const result: ShellResult = {
            stdout: (stdout ?? '').trim(),
            stderr: (stderr ?? '').trim(),
            exitCode: typeof exitCode === 'number' ? exitCode : 1,
          }

          if (result.exitCode !== 0) {
            log.warn(`Command exited with code ${result.exitCode}: ${result.stderr || result.stdout}`)
          } else {
            log.info(`Command OK${result.stdout ? `: ${result.stdout.slice(0, 200)}` : ''}`)
          }

          resolve(result)
        },
      )
    })
  }

  /**
   * Replace hardcoded user folder paths with OneDrive-safe alternatives.
   *
   * LLMs generate paths like `$HOME\Desktop` or `$env:USERPROFILE\Documents`
   * which break when OneDrive (or other sync tools) redirect shell folders.
   * We replace these with `[Environment]::GetFolderPath()` which always
   * resolves to the actual folder location on any Windows system.
   */
  private patchUserFolderPaths(command: string): string {
    const FOLDER_MAP: Array<[string, string]> = [
      ['Desktop',   'Desktop'],
      ['Documents', 'MyDocuments'],
      ['Pictures',  'MyPictures'],
      ['Music',     'MyMusic'],
      ['Videos',    'MyVideos'],
    ]

    // Prefixes that LLMs use before folder names
    const PREFIXES = [
      '\\$HOME',
      '\\$env:USERPROFILE',
      '\\$env:HOME',
      '~',
    ]

    let patched = command

    for (const [folderName, enumValue] of FOLDER_MAP) {
      const replacement = `$([Environment]::GetFolderPath('${enumValue}'))`
      for (const prefix of PREFIXES) {
        patched = patched.replace(
          new RegExp(`${prefix}[/\\\\]${folderName}`, 'gi'),
          replacement,
        )
      }
    }

    // Downloads has no .NET enum — use shell: protocol
    for (const prefix of PREFIXES) {
      patched = patched.replace(
        new RegExp(`${prefix}[/\\\\]Downloads`, 'gi'),
        `$((New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path)`,
      )
    }

    if (patched !== command) {
      log.info('Patched user folder paths in command')
    }

    return patched
  }
}
