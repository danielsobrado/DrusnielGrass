#!/usr/bin/env bash
# ==============================================================================
# FluffyGrass - Lines of Code (LOC) Counter
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if node is available and delegate to loc.mjs
if command -v node >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/loc.mjs" ]; then
    exec node "$SCRIPT_DIR/loc.mjs" "$@"
fi

# Fallback: Portable Shell LOC Counter
TARGET_DIR="${1:-$REPO_ROOT}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory '$TARGET_DIR' does not exist." >&2
    exit 1
fi

echo ""
echo "================================================================================"
echo "  LINES OF CODE (LOC) REPORT: $(basename "$TARGET_DIR")"
echo "  Path: $TARGET_DIR"
echo "================================================================================"
echo ""

printf "%-22s %-12s %7s %10s %9s %9s %11s\n" "Language" "Category" "Files" "Lines" "Blank" "Comment" "Code(SLOC)"
echo "-------------------------------------------------------------------------------------------"

# Simple portable scan using find & awk
find "$TARGET_DIR" -type f \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/.git/*' \
    ! -path '*/.shots/*' \
    ! -path '*/.tmp-screenshots/*' \
    ! -path '*/.claude/*' \
    ! -path '*/.gemini/*' \
    ! -name 'package-lock.json' \
    ! -name '*.glb' ! -name '*.gltf' ! -name '*.bin' \
    ! -name '*.png' ! -name '*.jpg' ! -name '*.jpeg' ! -name '*.webp' ! -name '*.gif' ! -name '*.ico' \
    ! -name '*.log' | awk '
BEGIN {
    totalFiles = 0; totalLines = 0; totalBlank = 0; totalComment = 0; totalCode = 0;
}
{
    file = $0;
    ext = "";
    if (match(file, /\.[^.\/]+$/)) {
        ext = substr(file, RSTART);
    }
    if (match(file, /\.d\.ts$/)) {
        ext = ".d.ts";
    }

    lang = "Other"; cat = "Other";
    if (ext == ".ts") { lang = "TypeScript"; cat = "Code"; }
    else if (ext == ".tsx") { lang = "TypeScript React"; cat = "Code"; }
    else if (ext == ".d.ts") { lang = "TypeScript Decl"; cat = "Code"; }
    else if (ext == ".js") { lang = "JavaScript"; cat = "Code"; }
    else if (ext == ".mjs") { lang = "JavaScript ESM"; cat = "Code"; }
    else if (ext == ".cjs") { lang = "JavaScript CJS"; cat = "Code"; }
    else if (ext == ".css") { lang = "CSS"; cat = "Code"; }
    else if (ext == ".html" || ext == ".htm") { lang = "HTML"; cat = "Code"; }
    else if (ext == ".json") { lang = "JSON"; cat = "Data/Config"; }
    else if (ext == ".yaml" || ext == ".yml") { lang = "YAML"; cat = "Data/Config"; }
    else if (ext == ".md") { lang = "Markdown"; cat = "Docs"; }
    else if (ext == ".sh") { lang = "Shell / Bash"; cat = "Script"; }
    else if (ext == ".ps1") { lang = "PowerShell"; cat = "Script"; }
    else if (ext == ".bat" || ext == ".cmd") { lang = "Batch Script"; cat = "Script"; }

    fLines = 0; fBlank = 0; fComment = 0; fCode = 0; inBlock = 0;
    while ((getline line < file) > 0) {
        fLines++;
        # Trim leading/trailing whitespace
        sub(/^[ \t\r\n]+/, "", line);
        sub(/[ \t\r\n]+$/, "", line);
        if (length(line) == 0) { fBlank++; continue; }

        if (inBlock) {
            fComment++;
            if (line ~ /\*\//) { inBlock = 0; }
            continue;
        }
        if (line ~ /^\/\*/) {
            fComment++;
            if (line !~ /\*\//) { inBlock = 1; }
            continue;
        }
        if (line ~ /^\/\// || line ~ /^#/) {
            fComment++;
            continue;
        }
        fCode++;
    }
    close(file);

    files[lang]++; lines[lang] += fLines; blank[lang] += fBlank; comment[lang] += fComment; code[lang] += fCode;
    category[lang] = cat;
    totalFiles++; totalLines += fLines; totalBlank += fBlank; totalComment += fComment; totalCode += fCode;
}
END {
    for (l in files) {
        printf "%-22s %-12s %7d %10d %9d %9d %11d\n", l, category[l], files[l], lines[l], blank[l], comment[l], code[l];
    }
    print "-------------------------------------------------------------------------------------------";
    printf "%-22s %-12s %7d %10d %9d %9d %11d\n", "TOTAL", "", totalFiles, totalLines, totalBlank, totalComment, totalCode;
    print "================================================================================";
}
'
