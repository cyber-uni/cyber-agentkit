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

  Scenario: a plugin that lists nothing reports no dependencies and no error
    Given a plugin with no root plugin.json
    And no .claude-plugin/plugin.json
    When the declared dependencies are read
    Then the list is empty
    And no error is reported

  Scenario: an unparsable manifest yields no dependencies and a reported error
    Given a plugin whose root plugin.json is not valid JSON
    And it has no .claude-plugin/plugin.json
    When the declared dependencies are read
    Then the list is empty
    And an error is reported

  Scenario: a malformed entry is skipped and its valid sibling kept
    Given a manifest whose dependencies hold the number 7 and the name "formatter"
    When the declared dependencies are read
    Then the list is exactly "formatter"

  # ── Check states ──

  Scenario: an installed dependency set to true is enabled
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And its enabledPlugins entry is true
    When the dependency "tracer@acme" is checked
    Then its state is "enabled"

  Scenario: an installed dependency set to false is disabled
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And its enabledPlugins entry is false
    When the dependency "tracer@acme" is checked
    Then its state is "disabled"

  Scenario: an installed dependency with no setting is installed
    Given the harness is Claude Code
    And "tracer@acme" is installed
    And enabledPlugins has no entry for it
    When the dependency "tracer@acme" is checked
    Then its state is "installed"

  Scenario: a dependency that is not installed is missing
    Given the harness is Claude Code
    And nothing named "tracer" is installed
    When the dependency "tracer@acme" is checked
    Then its state is "missing"

  Scenario: a harness with no install record reports every dependency unknown
    Given a harness for which the library has no verified install record
    When the dependencies "tracer" and "lintbot" are checked
    Then both states are "unknown"

  Scenario: a bare name matches an install from any marketplace
    Given "tracer@other" is installed and enabled
    When the dependency "tracer" with no marketplace is checked
    Then its state is "enabled"

  Scenario: a named marketplace does not match an install from a different one
    Given "tracer@other" is installed and enabled
    When the dependency "tracer@acme" is checked
    Then its state is "missing"

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
    Then they include an enable step naming "tracer@acme"

  Scenario: nothing missing or disabled gives no steps
    Given the harness is Claude Code
    And every declared dependency is enabled or installed
    When the steps are produced
    Then the steps are empty

  Scenario: a harness without dependency support gets manual steps that say nothing is resolved
    Given the harness is Cursor
    And the plugin lists "tracer@acme"
    When the steps are produced
    Then the first step says nothing is resolved for the user
    And a later step names "tracer" and "acme"
    And no step contains an install command

  Scenario: a missing dependency that names a marketplace asks the user to check it is added
    Given the dependency "tracer@acme" is missing
    When the steps are produced
    Then a step names "acme" and asks the user to check that it is added

  Scenario: a missing dependency with no marketplace gets no marketplace question
    Given the dependency "tracer" with no marketplace is missing
    When the steps are produced
    Then no step asks about a marketplace

  # ── The doctor command ──

  Scenario: the check command exits 1 when a dependency is missing
    Given a plugin listing "tracer@acme"
    And "tracer@acme" is not installed
    When "agent-harness dependencies check --plugin <root>" runs
    Then its exit code is 1
    And its output names "tracer@acme" with the state "missing"

  Scenario: the check command exits 0 when every dependency is enabled
    Given a plugin listing "tracer@acme"
    And "tracer@acme" is installed and enabled
    When "agent-harness dependencies check --plugin <root>" runs
    Then its exit code is 0

  Scenario: the check command changes no plugin or settings file
    Given a plugin listing "tracer@acme" that is not installed
    And a snapshot of the harness's installed-plugins file and settings files
    When "agent-harness dependencies check --plugin <root>" runs
    Then the snapshot is byte-identical afterwards

  # ── The reference ──

  Scenario: the plugin-dependencies reference loads by name
    When "reference show plugin-dependencies" runs
    Then its status is "found"
    And its content has a section for Claude Code and a section for every other harness

  Scenario: a committed reference that differs from its generator fails the tests
    Given references/plugin-dependencies.md differs from the generator's output
    When the package tests run
    Then the run fails
