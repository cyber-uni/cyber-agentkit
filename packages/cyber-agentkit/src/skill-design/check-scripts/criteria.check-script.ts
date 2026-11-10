import { checkScriptMain } from '../check-script-main.js'
import { checkCriteria } from '../criteria-checks.js'

// The default Criteria aspect's check script, `skills/skill/scripts/check-criteria.mjs`.
process.exitCode = checkScriptMain(checkCriteria)
