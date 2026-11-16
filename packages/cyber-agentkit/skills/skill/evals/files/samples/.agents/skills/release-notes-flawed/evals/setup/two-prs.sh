#!/bin/sh
set -e
mkdir -p .git/hooks
printf '#!/bin/sh\nexit 0\n' > .git/hooks/commit-msg
git config user.name tester
git commit -q --allow-empty -m start
