# Changelog

All notable changes to tskdeck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- At launch, a kept project name that starts with "-" leaves the settings after one alert, because tsk can't take it as a title. Before, tskdeck tried again and showed the same alert at each launch.

## [1.2.1] - 2026-11-20

### Fixed

- At launch, a kept project name whose title another project has in tsk leaves the settings after one alert. Before, tskdeck tried again and showed the same alert at each launch.

## [1.2.0] - 2026-11-18

### Changed

- With tsk 0.14.0 or later, Rename… sets the tsk project title, and tskdeck shows the titles that tsk keeps, including ones set from the terminal board or by an agent. A refused name stays in the Rename Project sheet with tsk's reason. At launch, tskdeck moves the names it kept in its settings into tsk; a name that tsk refuses stays in the settings, and an alert lists it. With older tsk, tskdeck keeps the names in its settings as before.

## [1.1.1] - 2026-11-06

### Fixed

- The macOS app has a valid ad-hoc signature on the whole app bundle. Before, only the binary had a signature, so `codesign --verify` rejected the app.

## [1.1.0] - 2026-11-06

### Added

- Update checks: tskdeck looks for a newer release one minute after launch and then once a day, and a card at the foot of the sidebar installs it and relaunches the app, or hides it with Later until the app quits.
- Check for Updates… in the app menu on macOS and in the command palette, and an Updates setting with Check Now in Settings → General.
- Signed update files and a `latest.json` manifest on each GitHub release.

## [1.0.1] - 2026-11-05

### Changed

- Selecting another view, project, thread or assignee closes the task view.

## [1.0.0] - 2026-11-03

### Added

- A sidebar listing Views, Projects, Threads and Assignees with live task counts.
- A board with the NEEDS YOU, IN MOTION and ON DECK sections, plus group and sort controls.
- A task view, beside the board or as an overlay, for editing title, notes, status, assignee, "runs after" and steps, with an activity trail and Done, Reply and Archive actions. Marking the open task done or archiving it closes the task view.
- Block and review cards with options, replies, approve, send back and a changeable "waits on", with review checks shown read-only.
- Quick capture of new tasks inside the app window.
- Search, multi-select with bulk actions, and undo for changes made in tskdeck.
- A done drawer with archived tasks and unarchive.
- A command palette and a rebindable keymap that defaults to the terminal board's keys.
- Settings for the open-task mode, the keymap and the path to the `tsk` binary.
- Live refresh when the store changes, so the board follows the terminal board, the CLI and agents.
- A screen for when `tsk` is missing or older than 0.13.0, with the install guide, a way to choose the `tsk` path and a check-again button.
- Project names: Rename… in a project's context menu in the sidebar opens a sheet that shows the project's full path and gives the project a name that tskdeck shows in the sidebar, the window title, the task pane, the New Task sheet and the Group By Project headers, and Sort By Project orders projects by that name.
- The tskdeck app icon, built in Icon Composer so macOS 26 and later show it with Liquid Glass and its Dark, Clear and Tinted variants.
- Zoom In, Zoom Out and Actual Size (Ctrl+=, Ctrl+- and Ctrl+0) on Linux and Windows, where the app has no menu bar, and a tsk Documentation action in the command palette.
- A 60-second limit on each `tsk` command, after which tskdeck stops it and reports that it didn't finish.
- A release workflow that builds installers for macOS (ARM64 and x86-64), Linux and Windows when a plain semver tag is pushed.

### Security

- A content security policy for the app's windows, and an absolute path required for the `tsk` binary in Settings.

[Unreleased]: https://github.com/s3rgiosan/tskdeck/compare/1.2.1...HEAD
[1.2.1]: https://github.com/s3rgiosan/tskdeck/compare/1.2.0...1.2.1
[1.2.0]: https://github.com/s3rgiosan/tskdeck/compare/1.1.1...1.2.0
[1.1.1]: https://github.com/s3rgiosan/tskdeck/compare/1.1.0...1.1.1
[1.1.0]: https://github.com/s3rgiosan/tskdeck/compare/1.0.1...1.1.0
[1.0.1]: https://github.com/s3rgiosan/tskdeck/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/s3rgiosan/tskdeck/releases/tag/1.0.0
