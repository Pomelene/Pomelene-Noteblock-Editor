const fs = require("node:fs");
const path = require("node:path");

function collectOwnedFiles(root) {
  const files = [];
  const walk = (folder) => {
    if (fs.lstatSync(folder).isSymbolicLink())
      throw Error("Refuse linked/reparse directory");
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (fs.lstatSync(file).isSymbolicLink())
        throw Error("Refuse linked/reparse file");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile())
        files.push(path.relative(root, file).replaceAll("\\", "/"));
      else throw Error("Unsupported packaged file type");
    }
  };
  walk(root);
  return files.sort();
}

function removalMacro(files) {
  const seen = new Set();
  const directories = new Set();
  const literal = (name) =>
    name.replaceAll("$", () => "$$").replaceAll("/", "\\");
  const owned = [...files].sort().map((name) => {
    if (
      !name ||
      /^[A-Za-z]:/.test(name) ||
      /[\\:*?"<>|\x00-\x1f]/.test(name) ||
      name
        .split("/")
        .some(
          (part) =>
            !part || part === "." || part === ".." || /[. ]$/.test(part),
        )
    ) {
      throw Error("Unsafe owned file path: " + JSON.stringify(name));
    }
    const key = name.toLowerCase();
    if (seen.has(key)) throw Error("Duplicate/case-colliding owned file");
    seen.add(key);
    const parts = name.split("/");
    parts.pop();
    while (parts.length) {
      directories.add(parts.join("/"));
      parts.pop();
    }
    return literal(name);
  });
  const dirs = [...directories]
    .sort(
      (a, b) => b.split("/").length - a.split("/").length || b.localeCompare(a),
    )
    .map(literal);
  const all = [
    ...owned.filter((name) => name !== ".pomelene-install"),
    "uninstallerIcon.ico",
    "${UNINSTALL_FILENAME}",
    ".pomelene-install",
  ];
  const check = (
    suffix,
  ) => `  StrCpy $2 "$INSTDIR${suffix ? "\\" + suffix : ""}"
  !insertmacro PneRejectReparse`;
  return `; Generated from packaged files. Never delete unknown user files.
!macro PneRejectReparse
  System::Call 'kernel32::GetFileAttributesW(w r2)i.r3'
  \${If} $3 != -1
    IntOp $3 $3 & 0x400
    \${If} $3 != 0
      SetErrorLevel 12
      MessageBox MB_OK|MB_ICONSTOP "An installed path is a directory link. No files were removed." /SD IDOK
      Abort
    \${EndIf}
  \${EndIf}
!macroend
!macro customRemoveFiles
  Var /GLOBAL PneStage
  SetOutPath $TEMP
  StrCpy $2 "$INSTDIR"
  pne_ancestors:
    !insertmacro PneRejectReparse
    \${GetParent} "$2" $3
    \${If} $3 != ""
    \${AndIf} $3 != $2
      StrCpy $2 $3
      Goto pne_ancestors
    \${EndIf}
${[...dirs, ...all].map(check).join("\n")}
  ; Stage on the same volume, so a failed rename can be rolled back.
  ClearErrors
  StrCpy $PneStage ""
  GetTempFileName $PneStage "$INSTDIR"
  IfErrors pne_cannot_stage
  Delete "$PneStage"
  CreateDirectory "$PneStage"
${dirs.map((d) => `  CreateDirectory "$PneStage\\${d}"`).join("\n")}
  IfErrors pne_stage_failed
${all
  .map(
    (f, i) => `  IfFileExists "$INSTDIR\\${f}" 0 pne_skip_${i}
  ClearErrors
  Rename "$INSTDIR\\${f}" "$PneStage\\${f}"
  IfErrors pne_stage_failed
  pne_skip_${i}:`,
  )
  .join("\n")}
${all
  .map(
    (f, i) => `  IfFileExists "$PneStage\\${f}" 0 pne_delete_skip_${i}
  ClearErrors
  SetFileAttributes "$PneStage\\${f}" NORMAL
  Delete "$PneStage\\${f}"
  IfErrors pne_cleanup_failed
  pne_delete_skip_${i}:`,
  )
  .join("\n")}
${dirs
  .map(
    (d) => `  RMDir "$PneStage\\${d}"
  RMDir "$INSTDIR\\${d}"`,
  )
  .join("\n")}
  RMDir "$PneStage"
  RMDir "$INSTDIR"
  Goto pne_remove_done
  pne_stage_failed:
${all
  .map(
    (f, i) => `  IfFileExists "$PneStage\\${f}" 0 pne_restore_skip_${i}
  Rename "$PneStage\\${f}" "$INSTDIR\\${f}"
  pne_restore_skip_${i}:`,
  )
  .join("\n")}
${dirs.map((d) => `  RMDir "$PneStage\\${d}"`).join("\n")}
  RMDir "$PneStage"
  pne_cannot_stage:
  SetErrorLevel 6
  MessageBox MB_OK|MB_ICONSTOP "A program file is busy. Files have been restored where possible. Close other programs and retry. Any remaining backup is at: $PneStage" /SD IDOK
  Abort
  pne_cleanup_failed:
  ; Keep repair metadata and the uninstall entry if final deletion was blocked.
  Rename "$PneStage\\.pomelene-install" "$INSTDIR\\.pomelene-install"
  Rename "$PneStage\\\${UNINSTALL_FILENAME}" "$INSTDIR\\\${UNINSTALL_FILENAME}"
  SetErrorLevel 6
  MessageBox MB_OK|MB_ICONSTOP "Cleanup was blocked. Installation is not fully removed. Retained files are at: $PneStage. Run setup again to repair, or close the blocking program and retry uninstall." /SD IDOK
  Abort
  pne_remove_done:
!macroend
`;
}

module.exports = { collectOwnedFiles, removalMacro };
