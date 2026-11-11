import { checkScriptMain } from '../check-script-main.js'
import { checkSecurity } from '../security-checks.js'

// The default Security aspect's check script, `skills/skill/scripts/check-security.mjs`.
process.exitCode = checkScriptMain(checkSecurity)
