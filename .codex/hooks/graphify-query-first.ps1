param()

$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) {
    exit 0
}

try {
    $call = $raw | ConvertFrom-Json
    $command = [string]$call.tool_input.command
} catch {
    exit 0
}

if ([string]::IsNullOrWhiteSpace($command)) {
    exit 0
}

$isGraphifyCommand = $command -match '(?i)\bgraphify\s+(query|explain|path|update|extract|cluster-only)\b'
$isRawExploration = $command -match '(?i)(^|[;&|]\s*)(rg|grep|Get-Content|gc|cat|Select-String|Get-ChildItem|gci|ls|dir|findstr)\b'

if ($isRawExploration -and -not $isGraphifyCommand) {
    @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            additionalContext = 'Graphify guard: before raw repository exploration, run graphify query "<question>" --budget 1200 (or graphify explain/path). Never manually read the full graphify-out/graph.json or GRAPH_REPORT.md. After Graphify returns specific source paths or symbols, read only those relevant files.'
        }
    } | ConvertTo-Json -Compress -Depth 4
}
