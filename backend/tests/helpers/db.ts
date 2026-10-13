import pg, { Pool } from "pg"
import { execSync } from "child_process"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, "../..")
const initDbScript = resolve(projectRoot, "scripts", "init-db.sh")

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST

if (DATABASE_URL_TEST == null || DATABASE_URL_TEST === "") {
  throw new Error("DATABASE_URL_TEST is not set — refusing to skip schema tests")
}

export const pool: Pool = new pg.Pool({ connectionString: DATABASE_URL_TEST })

function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1"
    )
  } catch {
    return false
  }
}

const SG_DOCKER_INIT_CMD = `sg docker -c 'bash ${initDbScript}'`

function runMigrationScript(): void {
  const composeAvailable = (() => {
    try {
      execSync("docker compose version", { stdio: "ignore" })
      return true
    } catch {
      return false
    }
  })()

  if (composeAvailable && isLocalhostUrl(DATABASE_URL_TEST as string)) {
    execSync(SG_DOCKER_INIT_CMD, { cwd: projectRoot, stdio: "pipe" })
    return
  }

  execSync(`bash ${initDbScript}`, {
    cwd: projectRoot,
    env: process.env,
    stdio: "pipe",
  })
}

export async function resetSchema(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(`
      DROP TABLE IF EXISTS "integrations"    CASCADE;
      DROP TABLE IF EXISTS "possible_integration_docu" CASCADE;
      DROP TABLE IF EXISTS "seats"          CASCADE;
      DROP TABLE IF EXISTS "organizations"  CASCADE;
      DROP TABLE IF EXISTS "users"          CASCADE;
      DROP TABLE IF EXISTS "role"           CASCADE;
      DROP TABLE IF EXISTS "plans"          CASCADE;
    `)
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }

  runMigrationScript()
}

export async function closePool(): Promise<void> {
  await pool.end()
}
