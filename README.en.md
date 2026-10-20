# Pomelene Noteblock Editor

[简体中文](README.md) | **English**

**Author: 柚烯Pomelene** · [GitHub profile](https://github.com/Pomelene)

For bug reports and feature requests, [open an issue](https://github.com/Pomelene/Pomelene-Noteblock-Editor/issues). When reporting a problem, please include the application version, steps to reproduce it, and screenshots where possible.

A desktop editor for Minecraft note block music, designed to make editing `.nbs` files, reusing musical phrases, and arranging songs easier.

This page is available in English. The application interface and the detailed documentation linked below are currently primarily in Chinese.

## Download and install

A **Windows x64 installer** is currently available. It includes the required runtime; you do not need to install Node.js or any development tools.

Version **0.5.9** improves large-song processing, playback rendering, and package size while preserving existing artwork and audio. See the [release notes](docs/release-0.5.9.md) (Chinese).

1. Open the **[latest release page](https://github.com/Pomelene/Pomelene-Noteblock-Editor/releases/latest)**.
2. Under **Assets**, download the installer whose name ends in **`Setup-x64.exe`**, such as `PomeleneNoteblockEditor-0.5.9-Setup-x64.exe`.
3. Run the installer and choose an installation location. Select a parent directory; setup will create a `Pomelene Noteblock Editor` folder inside it.
4. Once installation is complete, launch **Pomelene Noteblock Editor** using its desktop or Start menu shortcut.

The `source.zip` archive and GitHub's automatically generated `Source code` downloads are for development. To install the application, choose the `.exe` file above.

The current installer does not have a publisher code signature, so Windows may display an “Unknown publisher” notice. You do not need to disable antivirus software or change system security policies. See the [installation and uninstallation guide](docs/windows-installer.md) for details (Chinese).

### First launch

On the start screen, choose one of the following:

- **Open an .nbs song** (`打开 .nbs 歌曲`): import existing music and review the preview before editing. You can optionally enable Smart Pattern Organization (Beta).
- **Open an .nbproject project** (`打开工程文件 .nbproject`): continue working on a saved project.
- **Create a new project** (`新建工程`): start from scratch.

Save your work as `.nbproject` to retain the complete project. Export `.nbs` when you want to use the music with an NBS-compatible player or Minecraft tool.

### Uninstall

Uninstall through Windows **Installed apps**, or run `Uninstall Pomelene Noteblock Editor.exe` in the installation folder. Uninstallation preserves additional user files and AppData settings.

## Basic features

| Feature | What you can do |
| --- | --- |
| Note editing | Place, delete, select, and drag notes in the piano roll or NBS layer view. Adjust pitch, instrument, velocity, and other properties. |
| Patterns and song arrangement | Reuse editable Patterns throughout a song, move and copy clips, adjust clip length, and mute, solo, or lock tracks. |
| Reusable fragments | Save existing notes as read-only fragment samples for reuse, or create an editable Pattern from a fragment. |
| Tempo and playback | Set BPM and time signature, play the entire song or the current fragment, pause while retaining the position, and stop to return to the beginning. |
| Instrument management | Preview built-in instruments, manage custom instrument resources, and select replacement mappings for missing or unsupported instruments. |
| File support | Open `.nbs` songs, save and reopen `.nbproject` projects, and export `.nbs` files. |

## Highlights

- **Smart Pattern Organization (Beta)**: organize imported NBS music into parts and phrases, and identify identical phrases for reuse. The original import layout is retained for restoration and comparison.
- **Chord generator**: choose a time position and place a group of notes using the chord panel.
- **Continuous drawing and right-drag erasing**: hold and drag to place or erase notes continuously. Each gesture is a single undo step.
- **Flexible editor windows**: resize or maximize the song arrangement and Pattern editors, detach them into native windows, and dock them again.
- **Instrument focus**: when an instrument is selected, notes and velocity bars belonging to other instruments become translucent, making individual parts easier to edit.
- **Adjustable editing density**: change row height, use Ctrl + mouse wheel to zoom the time axis, and choose straight, triplet, or bar snapping.
- **Context-aware shortcuts**: selection, clipboard, navigation, and window controls follow the active editor. Press F1 to search for actions.
- **Real-time sound-pattern start screen**: a full-background procedural animation evolves over time, with controls to pause it and reduce motion.

### Compatibility and development status

- Reads **NBS v0–6** and exports **NBS v5 or v6**. All four copper timbres are bundled: v6 uses native instrument IDs, while v5 uses a custom-instrument sample pack.
- Projects use the version-tagged **v2 `.nbproject`** format. Earlier JSON project files are not supported.
- Smart organization is still being improved. Complex parts and phrases spanning bar boundaries may need manual adjustment.
- Intelligent MIDI conversion, a drum-pattern library, and semi-automatic arrangement enrichment have not been implemented yet.

Further reading (Chinese): [User guide](resources/使用说明.txt) · [0.5.9 release notes](docs/release-0.5.9.md) · [Development guide](docs/development.md) · [References](docs/reference-notes.md)
