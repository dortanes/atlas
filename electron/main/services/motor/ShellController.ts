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
    log.info(`exec: ${command}`)

    return new Promise((resolve) => {
      exec(
        command,
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
}
