# Shortcuts and flexible workspace design

The existing Electron/React editor gains three connected improvements: discoverable context-aware shortcuts, a real Playlist child window with desktop detachment and docking, and prominent instrument focus in Pattern editors. Existing NBS audio and project semantics stay intact.

Global shortcuts: file actions, undo/redo, Space play/pause, Escape stop when no gesture/menu consumes it, F1 searchable help, F5 Playlist, F7 current source editor, F12 minimize editors, Ctrl+Tab cycle, Ctrl+Shift+H tile, Enter maximize focused editor. Existing Ctrl+N new and Ctrl+E NBS export are retained. Input fields and dialogs keep their own editing keys; repeats cannot trigger destructive global actions. Native menu accelerators must not double-dispatch.

Local shortcuts: tools P/B/E/D (Playlist T/S), selection all/deselect/invert, copy/cut/paste/duplicate, delete, snapped arrows and octave movement, Home/End seek, PageUp/PageDown zoom, Backspace toggle snap with previous value restored. Pattern G/K instrument navigation and H/J navigation among used instruments. Commands operate only on the focused editor. Help lists only implemented commands with scope and search.

Playlist starts maximized inside the workspace, can restore, move, resize, minimize, close and reopen via F5/dock. All editor windows can tile/cascade and detach into independent OS windows; detached windows offer docking back to main. All windows share one authoritative project and undo history. Playlist desktop windows include a placement-source selector. Source instances retain independent view and selection state.

Instrument focus is obvious in Pattern: clearly labeled current instrument, accessible instrument choices/counts, preview action, and an all-instruments visual override. Notes and velocity indicators from other instruments render at reduced opacity without muting or changing export. Locked/muted layers and note selections remain legible.

References: Image-Line official basics_shortcuts.htm and menu_view.htm. No slicer, slide, mixer or effect placeholders are added. Preserve pause position and one-click Stop returning to zero.
