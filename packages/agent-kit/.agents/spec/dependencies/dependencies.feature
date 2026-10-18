Feature: Check a plugin's declared dependencies against the running harness

  # ── Read a declared list ──

  Scenario: the plugin-manager key wins over every other source
    Given a plugin whose root plugin.json lists "tracer" under the org.spikyuni.plugin-manager extension
    And the same file lists "lintbot" under the org.cyberuni.universal-plugin extension
    And its .claude-plugin/plugin.json lists "formatter"
    When the declared dependencies are read
    Then the list is exactly "tracer"

  Scenario: the older universal-plugin key is read when the plugin-manager key lists none
    Given a plugin whose root plugin.json lists "lintbot" under the org.cyberuni.universal-plugin extension
    And its .claude-plugin/plugin.json lists "formatter"
    When the declared dependencies are read
    Then the list is exactly "lintbot"

  Scenario: the Claude Code manifest is read when no extension key lists any
    Given a plugin whose root plugin.json has no extensions
    And its .claude-plugin/plugin.json lists "formatter"
    When the declared dependencies are read
    Then the list is exactly "formatter"

  Scenario: string and object entries keep their marketplace and version
    Given a manifest whose dependencies hold the string "tracer@acme"
    And the object with name "lintbot", marketplace "forge", and version "2.1"
    When the declared dependencies are read
    Then "tracer" carries the marketplace "acme" and no version
    And "lintbot" carries the marketplace "forge" and the version "2.1"

  Scenario: a plugin that lists nothing reports no dependencies and no error
    Given an empty plugin directory
    When the declared dependencies are read
    Then the list is empty
    And no error is reported

  Scenario: an unparsable manifest yields no dependencies and a reported error
    Given a plugin whose root plugin.json is not valid JSON
    And it has no .claude-plugin/plugin.json
    When the declared dependencies are read
    Then the list is empty
    And an error is reported

  Scenario: an unparsable manifest does not hide a later source but is still reported
    Given a plugin whose root plugin.json is not valid JSON
    And its .claude-plugin/plugin.json lists "formatter"
    When the declared dependencies are read
    Then the list is exactly "formatter"
    And an error is reported

  Scenario: a malformed entry is skipped and its valid sibling kept
    Given a manifest whose dependencies hold the number 7 and the name "formatter"
    When the declared dependencies are read
    Then the list is exactly "formatter"

  Scenario: a given dependencies list is used and the plugin root is not read
    Given a plugin root whose manifest lists "formatter"
    And a dependencies list holding "tracer"
    When the dependencies are checked with both
    Then the checked dependencies are exactly "tracer"

  Scenario: neither a list nor a plugin root gives an empty list and no error
    When the dependencies are checked with no list and no plugin root
    Then the checked dependencies are empty
    And no error is reported

  # ── Check states ──

  Scenario: an installed dependency set to true is enabled
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    When the dependency "tracer@acme" is checked
    Then its state is "enabled"

  Scenario: a requested version never changes the state
    Given the harness is Claude Code
    And "tracer@acme" version "1.0.0" is installed
    And its enabledPlugins entry is true
    When the dependency "tracer@acme" requesting version "9.0.0" is checked
    Then its state is "enabled"
    And the result carries the requested version "9.0.0"

  Scenario: an installed dependency set to false is disabled
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And its enabledPlugins entry is false
    When the dependency "tracer@acme" is checked
    Then its state is "disabled"

  Scenario: an installed dependency with no setting is installed
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And enabledPlugins lists only "lintbot@forge"
    When the dependency "tracer@acme" is checked
    Then its state is "installed"

  Scenario: a dependency that is not installed is missing
    Given the harness is Claude Code
    And the installed plugins are exactly "lintbot@forge"
    When the dependency "tracer@acme" is checked
    Then its state is "missing"

  Scenario: a harness with no install record reports every dependency unknown
    Given the harness is Cursor
    When the dependencies "tracer@acme" and "lintbot@forge" are checked
    Then both states are "unknown"

  Scenario: a bare name is not satisfied by an install from another marketplace
    Given the harness is Claude Code
    And "tracer@other" is installed
    And its enabledPlugins entry is true
    And the declaring marketplace is "acme"
    When the dependency "tracer" with no marketplace is checked
    Then its state is "missing"

  Scenario: a named marketplace does not match an install from a different one
    Given the harness is Claude Code
    And "tracer@other" is installed
    And its enabledPlugins entry is true
    When the dependency "tracer@acme" is checked
    Then its state is "missing"

  Scenario: a bare name resolves in the declaring marketplace
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    And the declaring marketplace is "acme"
    When the dependency "tracer" with no marketplace is checked
    Then its state is "enabled"

  Scenario: a passed declaring marketplace wins over the derived one
    Given the harness is Claude Code
    And the plugin root is installed from the marketplace "forge"
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    When the dependency "tracer" with no marketplace is checked for that plugin root with the declaring marketplace "acme" passed
    Then its state is "enabled"

  Scenario: a bare name with no known declaring marketplace is unknown
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    And the declaring marketplace is not known
    When the dependency "tracer" with no marketplace is checked
    Then its state is "unknown"

  # ── Steps ──

  Scenario: Claude Code gets an install step and a reload step for a missing dependency
    Given the harness is Claude Code
    And the dependency "tracer@acme" is missing
    When the steps are produced
    Then they include "claude plugin install tracer@acme"
    And they end with "Run /reload-plugins."

  Scenario: Claude Code gets an enable step for a disabled dependency
    Given the harness is Claude Code
    And the dependency "tracer@acme" is disabled
    When the steps are produced
    Then a step sets "tracer@acme" to true in enabledPlugins
    And no step contains the text "plugin install"

  Scenario: nothing missing or disabled gives no steps
    Given the harness is Claude Code
    And the dependency "tracer@acme" is enabled
    And the dependency "lintbot@forge" is installed with no setting
    When the steps are produced
    Then the steps are empty

  Scenario: a harness without dependency support gets a manual step for a missing dependency
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When the steps are produced
    Then a step names "tracer" and "acme" as a plugin to install and enable yourself
    And no step contains the text "plugin install"

  Scenario: a harness without dependency support gets no reload step
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When the steps are produced
    Then no step contains the text "/reload-plugins"

  Scenario: a harness without dependency support starts with the nothing-resolved step
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When the steps are produced
    Then the first step says nothing is resolved for the user

  Scenario: Claude Code explains an unknown bare dependency instead of guessing a marketplace
    Given the harness is Claude Code
    And the declaring marketplace is not known
    And the dependency "tracer" with no marketplace is unknown
    When the steps are produced
    Then a step says the declaring marketplace is not known and asks the user to install the plugin from a marketplace or to declare "tracer@" with one
    And no step contains the text "plugin install tracer"

  Scenario: a harness without dependency support gets no step for an enabled dependency
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And "tracer@acme" is installed on the harness
    And the harness reports "tracer@acme" as enabled
    When the steps are produced
    Then the steps are empty

  Scenario: a harness without dependency support or a record says nothing is resolved and lists manual steps
    Given the harness is Cursor
    And the plugin lists "tracer@acme"
    When the steps are produced
    Then the first step says nothing is resolved for the user
    And a later step names "tracer" and "acme"
    And no step contains the text "plugin install"

  Scenario: a missing dependency that names a marketplace asks the user to check it is added
    Given the harness is Claude Code
    And the dependency "tracer@acme" is missing
    When the steps are produced
    Then a step names "acme" and asks the user to check that it is added

  Scenario: a disabled dependency that names a marketplace gets no marketplace question
    Given the harness is Claude Code
    And the dependency "tracer@acme" is disabled
    When the steps are produced
    Then no step asks the user to check that "acme" is added

  Scenario: a missing dependency with no marketplace gets no marketplace question
    Given the harness is Claude Code
    And the dependency "tracer" with no marketplace is missing
    When the steps are produced
    Then no step asks about a marketplace

  Scenario: Claude Code adds the cross-marketplace step for a missing dependency in another marketplace
    Given the harness is Claude Code
    And the declaring marketplace is "forge"
    And the dependency "tracer@acme" is missing
    When the steps are produced
    Then a step says the root marketplace must list "acme" in allowCrossMarketplaceDependenciesOn
    And that step also says the user may instead already have it enabled

  Scenario: a missing dependency in the declaring marketplace gets no cross-marketplace step
    Given the harness is Claude Code
    And the declaring marketplace is "acme"
    And the dependency "tracer@acme" is missing
    When the steps are produced
    Then no step mentions allowCrossMarketplaceDependenciesOn

  Scenario: a harness without dependency support never gets the cross-marketplace step
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When the steps are produced
    Then no step mentions allowCrossMarketplaceDependenciesOn

  Scenario: a harness without dependency support gets a manual step for a disabled dependency
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And "tracer@acme" is installed on the harness
    And the harness reports "tracer@acme" as disabled
    When the steps are produced
    Then a step names "tracer" as a plugin to enable yourself
    And no step contains the text "plugin install"

  Scenario: a harness without dependency support asks the user to check the marketplace of a missing dependency
    Given the harness is Codex
    And the plugin lists "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When the steps are produced
    Then a step names "acme" and asks the user to check that it is added

  Scenario: a missing dependency with an unknown declaring marketplace gets the cross-marketplace step
    Given the harness is Claude Code
    And the declaring marketplace is not known
    And the dependency "tracer@acme" is missing
    When the steps are produced
    Then a step says the root marketplace must list "acme" in allowCrossMarketplaceDependenciesOn

  Scenario: a missing bare dependency is installed from the declaring marketplace
    Given the harness is Claude Code
    And the declaring marketplace is "acme"
    And the dependency "tracer" with no marketplace is missing
    When the steps are produced
    Then they include "claude plugin install tracer@acme"

  Scenario: the steps come in the order install, marketplace question, cross-marketplace, reload
    Given the harness is Claude Code
    And the declaring marketplace is "forge"
    And the dependency "tracer@acme" is missing
    When the steps are produced
    Then the steps in order are the install step, the marketplace question, the cross-marketplace step, and "Run /reload-plugins."

  # ── The doctor command ──

  Scenario: the check command exits 1 when a dependency is missing
    Given the harness is Claude Code
    And a plugin listing "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output names "tracer@acme" with the state "missing" and the code "dependency-missing"

  Scenario: the check command exits 1 when a dependency is disabled
    Given the harness is Claude Code
    And a plugin listing "tracer@acme"
    And "tracer@acme" is installed
    And its enabledPlugins entry is false
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output carries the code "dependency-disabled"

  Scenario: the check command exits 0 when a dependency is installed with no setting
    Given the harness is Claude Code
    And a plugin listing "tracer@acme"
    And "tracer@acme" is installed
    And enabledPlugins lists only "lintbot@forge"
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 0

  Scenario: the check command exits 0 when every dependency is enabled
    Given the harness is Claude Code
    And a plugin listing "tracer@acme"
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 0

  Scenario: the check command exits 1 with dependency-unknown when the harness keeps no install record
    Given the harness is Cursor
    And a plugin listing "tracer@acme"
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output carries the code "dependency-unknown"

  Scenario: the check command lists every problem it finds with its own code
    Given the harness is Claude Code
    And a plugin whose root plugin.json is not valid JSON
    And its .claude-plugin/plugin.json lists "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output carries the code "manifest-unparsable"
    And its output carries the code "dependency-missing"

  Scenario: the check command exits 1 with manifest-unparsable for an unparsable manifest
    Given a plugin whose root plugin.json is not valid JSON
    And it has no .claude-plugin/plugin.json
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output carries the code "manifest-unparsable"

  Scenario: the check command exits 1 with manifest-unparsable even when the later source is all enabled
    Given the harness is Claude Code
    And a plugin whose root plugin.json is not valid JSON
    And its .claude-plugin/plugin.json lists "tracer@acme"
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output carries the code "manifest-unparsable"

  Scenario: the check command says a plugin declares no dependencies and exits 0
    Given an empty plugin directory
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its output says the plugin declares no dependencies
    And its exit code is 0

  Scenario: the check command resolves a bare name in the marketplace the plugin was installed from
    Given the harness is Claude Code
    And the plugin root is installed from the marketplace "acme"
    And its .claude-plugin/plugin.json lists "tracer" with no marketplace
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 0

  Scenario: the check command reports a bare name as unknown when the plugin is not installed
    Given the harness is Claude Code
    And the plugin root is a folder under development that is not in the installed plugins
    And its .claude-plugin/plugin.json lists "tracer" with no marketplace
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output carries the code "dependency-unknown"

  Scenario: the check command exits 1 with harness-not-detected when no harness is detected
    Given the process runs in a plain shell that no harness has started
    When "uni-agent-kit dependencies check --plugin <root>" runs without --harness
    Then its exit code is 1
    And its output carries the code "harness-not-detected"
    And a step tells the user to pass --harness

  Scenario: the check command uses an explicit --harness
    Given the process runs in a plain shell that no harness has started
    And a plugin listing "tracer@acme"
    When "uni-agent-kit dependencies check --plugin <root> --harness cursor" runs
    Then its output names "tracer@acme" with the state "unknown"

  Scenario: the check command exits 2 for an unknown flag
    When "uni-agent-kit dependencies check --nonsense" runs
    Then its exit code is 2

  Scenario: the check command exits 2 when the plugin root does not exist
    When "uni-agent-kit dependencies check --plugin <a path that does not exist>" runs
    Then its exit code is 2

  Scenario: the check command reads the current directory when --plugin is omitted
    Given the current directory is a plugin whose .claude-plugin/plugin.json lists "tracer@acme"
    And the harness is Claude Code
    And the installed plugins are exactly "lintbot@forge"
    When "uni-agent-kit dependencies check" runs
    Then its output names "tracer@acme" with the state "missing"

  Scenario: the check command changes no plugin or settings file
    Given the harness is Claude Code
    And a plugin listing "tracer@acme"
    And the installed plugins are exactly "lintbot@forge"
    And a snapshot of the harness's installed-plugins file and settings files
    When "uni-agent-kit dependencies check --plugin <root>" runs
    Then the snapshot is byte-identical afterwards
