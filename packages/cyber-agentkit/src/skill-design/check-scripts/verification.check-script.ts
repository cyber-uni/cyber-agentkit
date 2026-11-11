import { checkScriptMain } from '../check-script-main.js'
import { checkVerification } from '../verification-checks.js'

// The default Verification aspect's check script, `skills/skill/scripts/check-verification.mjs`.
process.exitCode = checkScriptMain(checkVerification)
